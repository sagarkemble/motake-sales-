import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Documents live in their own private R2 bucket: no public access, no public base URL. Browsers
// only ever get a 5-minute signed GET link; nothing is ever deleted by the app.
export const SIGNED_LINK_SECONDS = 300;

export interface DocumentStoreConfig {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
}

export interface StoredObject {
  bytes: Uint8Array;
  contentType: string;
}

export interface SignedLink {
  url: string;
  expiresAt: Date;
}

// `downloadFileName` makes the link an attachment with that name; without it the object opens
// inline (a signed QR image).
export interface SignedLinkOptions {
  contentType: string;
  downloadFileName?: string;
}

// The Document service takes this interface, so tests swap in an in-memory store.
export interface DocumentStore {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject>;
  signedGetLink(key: string, options: SignedLinkOptions): Promise<SignedLink>;
}

function contentDisposition(downloadFileName: string | undefined): string {
  if (!downloadFileName) return "inline";
  const asciiName = downloadFileName.replace(/[^\x20-\x7e]|"/g, "_");
  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(downloadFileName)}`;
}

// Same S3 client pattern as the services uploads R2 client, pointed at the documents bucket.
export class R2DocumentStore implements DocumentStore {
  private readonly client: S3Client;

  public constructor(private readonly config: DocumentStoreConfig) {
    this.client = new S3Client({
      region: "auto",
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  public async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucketName,
        Key: key,
        Body: bytes,
        ContentType: contentType,
      }),
    );
  }

  public async get(key: string): Promise<StoredObject> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.config.bucketName, Key: key }),
    );
    if (!response.Body) throw new Error(`Document ${key} has no body`);
    return {
      bytes: await response.Body.transformToByteArray(),
      contentType: response.ContentType ?? "application/octet-stream",
    };
  }

  // Signing happens locally; no network call.
  public async signedGetLink(key: string, options: SignedLinkOptions): Promise<SignedLink> {
    const signedAt = Date.now();
    const getCommand = new GetObjectCommand({
      Bucket: this.config.bucketName,
      Key: key,
      ResponseContentType: options.contentType,
      ResponseContentDisposition: contentDisposition(options.downloadFileName),
    });
    const url = await getSignedUrl(this.client, getCommand, { expiresIn: SIGNED_LINK_SECONDS });
    return { url, expiresAt: new Date(signedAt + SIGNED_LINK_SECONDS * 1000) };
  }
}
