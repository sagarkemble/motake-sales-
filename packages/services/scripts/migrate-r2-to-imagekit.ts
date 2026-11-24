import { GetObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import ImageKit, { toFile } from "@imagekit/nodejs";
import { and, db, eq, isNotNull, isNull, notLike, or } from "@repo/database";
import { customersTable, productsTable, profilesTable } from "@repo/database/schema";

const dryRun = process.argv.includes("--dry-run");
const urlsOnly = process.argv.includes("--urls-only");

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for the R2 → ImageKit copy`);
  return value;
}

function filePathOf(objectKey: string): string {
  return `/${objectKey.replace(/^\/+/, "")}`;
}

function splitObjectKey(objectKey: string): { folder: string; fileName: string } {
  const normalized = objectKey.replace(/^\/+/, "");
  const slash = normalized.lastIndexOf("/");
  if (slash <= 0) return { folder: "/", fileName: normalized };
  return { folder: `/${normalized.slice(0, slash)}`, fileName: normalized.slice(slash + 1) };
}

function publicUrlFor(objectKey: string, urlEndpoint: string): string {
  return `${urlEndpoint.replace(/\/+$/, "")}${filePathOf(objectKey)}`;
}

function r2Client(): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${required("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: required("R2_ACCESS_KEY_ID"),
      secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
    },
  });
}

async function listKeys(client: S3Client, bucket: string): Promise<string[]> {
  const keys: string[] = [];
  let continuationToken: string | undefined;
  do {
    const page = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: continuationToken }),
    );
    for (const object of page.Contents ?? []) {
      if (object.Key && !object.Key.endsWith("/")) keys.push(object.Key);
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);
  return keys;
}

async function getObject(
  client: S3Client,
  bucket: string,
  key: string,
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!object.Body) return null;
  return {
    bytes: await object.Body.transformToByteArray(),
    contentType: object.ContentType ?? "application/octet-stream",
  };
}

async function copyBucket(options: {
  label: string;
  bucket: string;
  privateFiles: boolean;
  client: S3Client;
  imagekit: ImageKit;
}): Promise<number> {
  const keys = await listKeys(options.client, options.bucket);
  console.log(`${options.label}: ${keys.length} object(s)`);
  let copied = 0;
  for (const key of keys) {
    const { folder, fileName } = splitObjectKey(key);
    if (!fileName) continue;
    if (dryRun) {
      console.log(`  dry-run ${key}`);
      copied += 1;
      continue;
    }
    const object = await getObject(options.client, options.bucket, key);
    if (!object) {
      console.warn(`  skip empty ${key}`);
      continue;
    }
    await options.imagekit.files.upload({
      file: await toFile(Buffer.from(object.bytes), fileName, { type: object.contentType }),
      fileName,
      folder,
      isPrivateFile: options.privateFiles,
      useUniqueFileName: false,
      overwriteFile: true,
    });
    copied += 1;
    console.log(`  copied ${key}`);
  }
  return copied;
}

async function rewritePublicUrls(urlEndpoint: string): Promise<void> {
  const alreadyOnThisEndpoint = `%${urlEndpoint.replace(/^https?:\/\//, "")}%`;

  const products = await db
    .select({ id: productsTable.id, objectKey: productsTable.imageKey })
    .from(productsTable)
    .where(
      and(
        isNotNull(productsTable.imageKey),
        or(isNull(productsTable.imageUrl), notLike(productsTable.imageUrl, alreadyOnThisEndpoint)),
      ),
    );
  console.log(`products: ${products.length} URL(s) to rewrite`);
  for (const row of products) {
    if (!row.objectKey) continue;
    const nextUrl = publicUrlFor(row.objectKey, urlEndpoint);
    if (dryRun) {
      console.log(`  dry-run products ${row.id} -> ${nextUrl}`);
      continue;
    }
    await db.update(productsTable).set({ imageUrl: nextUrl }).where(eq(productsTable.id, row.id));
    console.log(`  products ${row.id}`);
  }

  const customers = await db
    .select({ id: customersTable.id, objectKey: customersTable.shopPhotoKey })
    .from(customersTable)
    .where(
      and(
        isNotNull(customersTable.shopPhotoKey),
        or(
          isNull(customersTable.shopPhotoUrl),
          notLike(customersTable.shopPhotoUrl, alreadyOnThisEndpoint),
        ),
      ),
    );
  console.log(`customers: ${customers.length} URL(s) to rewrite`);
  for (const row of customers) {
    if (!row.objectKey) continue;
    const nextUrl = publicUrlFor(row.objectKey, urlEndpoint);
    if (dryRun) {
      console.log(`  dry-run customers ${row.id} -> ${nextUrl}`);
      continue;
    }
    await db
      .update(customersTable)
      .set({ shopPhotoUrl: nextUrl })
      .where(eq(customersTable.id, row.id));
    console.log(`  customers ${row.id}`);
  }

  const profiles = await db
    .select({ id: profilesTable.id, objectKey: profilesTable.avatarKey })
    .from(profilesTable)
    .where(
      and(
        isNotNull(profilesTable.avatarKey),
        or(isNull(profilesTable.avatarUrl), notLike(profilesTable.avatarUrl, alreadyOnThisEndpoint)),
      ),
    );
  console.log(`profiles: ${profiles.length} URL(s) to rewrite`);
  for (const row of profiles) {
    if (!row.objectKey) continue;
    const nextUrl = publicUrlFor(row.objectKey, urlEndpoint);
    if (dryRun) {
      console.log(`  dry-run profiles ${row.id} -> ${nextUrl}`);
      continue;
    }
    await db.update(profilesTable).set({ avatarUrl: nextUrl }).where(eq(profilesTable.id, row.id));
    console.log(`  profiles ${row.id}`);
  }
}

async function main() {
  const urlEndpoint = required("IMAGEKIT_URL_ENDPOINT");
  const imagekit = new ImageKit({ privateKey: required("IMAGEKIT_PRIVATE_KEY") });
  const client = r2Client();
  const publicBucket = required("R2_BUCKET_NAME");
  const documentsBucket = required("R2_DOCUMENTS_BUCKET_NAME");

  if (urlsOnly) {
    console.log(dryRun ? "Dry run — URL rewrite only" : "Rewriting public URLs to ImageKit");
    await rewritePublicUrls(urlEndpoint);
    console.log("Done.");
    return;
  }

  console.log(dryRun ? "Dry run — nothing is written" : "Copying R2 objects to ImageKit");
  const publicCopied = await copyBucket({
    label: "public images",
    bucket: publicBucket,
    privateFiles: false,
    client,
    imagekit,
  });
  const privateCopied = await copyBucket({
    label: "private documents",
    bucket: documentsBucket,
    privateFiles: true,
    client,
    imagekit,
  });
  await rewritePublicUrls(urlEndpoint);
  console.log(`Done. public=${publicCopied} private=${privateCopied}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
