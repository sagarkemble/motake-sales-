import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";

import { logger } from "@repo/logger";

import { env } from "../env";

const presignedUrlExpirySeconds = 300;

let r2ClientInstance: S3Client | undefined;

export function getR2Client(): S3Client {
  if (!r2ClientInstance) {
    r2ClientInstance = new S3Client({
      region: "auto",
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return r2ClientInstance;
}

export function buildObjectKey(folderName: string, ownerId: string, fileName: string): string {
  const safeFileName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  return `${folderName}/${ownerId}/${randomUUID()}-${safeFileName}`;
}

export function buildPublicUrl(objectKey: string): string {
  return `${env.R2_PUBLIC_BASE_URL}/${objectKey}`;
}

export async function createPresignedUploadUrl(
  objectKey: string,
  contentType: string,
  contentLength?: number,
): Promise<string> {
  const putCommand = new PutObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: objectKey,
    ContentType: contentType,
    ...(contentLength !== undefined ? { ContentLength: contentLength } : {}),
  });
  return getSignedUrl(getR2Client(), putCommand, { expiresIn: presignedUrlExpirySeconds });
}

export async function deleteObject(objectKey: string): Promise<void> {
  try {
    await getR2Client().send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: objectKey }));
  } catch (deleteError) {
    logger.error(`Failed to delete R2 object ${objectKey}`, { error: deleteError });
  }
}
