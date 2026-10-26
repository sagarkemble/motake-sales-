import { GetObjectCommand, NoSuchKey, S3Client, S3ServiceException } from "@aws-sdk/client-s3";

import type { DocumentReader, ReadDocumentResult } from "./provider";

export interface R2DocumentReaderConfig {
  // Cloudflare account id; the endpoint is built from it like the other R2 clients.
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
}

// The read runs while the send holds the notification row lock, so it never waits forever: a
// stuck connection or a stalled body socket fails the try as `unavailable` (retried).
const CONNECTION_TIMEOUT_MS = 5_000;
const REQUEST_TIMEOUT_MS = 30_000;

// S3 GetObject on the private Documents bucket (Spec L) with the notification app's own read-only
// R2 key. It never makes a signed or public link.
export class R2DocumentReader implements DocumentReader {
  private readonly client: S3Client;
  private readonly bucketName: string;

  public constructor(config: R2DocumentReaderConfig) {
    this.client = new S3Client({
      region: "auto",
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      requestHandler: {
        connectionTimeout: CONNECTION_TIMEOUT_MS,
        requestTimeout: REQUEST_TIMEOUT_MS,
      },
    });
    this.bucketName = config.bucketName;
  }

  public async read(objectKey: string): Promise<ReadDocumentResult> {
    try {
      const object = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucketName, Key: objectKey }),
      );
      if (!object.Body) {
        return { ok: false, reason: "not_found", message: `R2 object ${objectKey} has no body` };
      }
      const bytes = await object.Body.transformToByteArray();
      return { ok: true, bytes, contentType: object.ContentType ?? null };
    } catch (error) {
      const notFound =
        error instanceof NoSuchKey ||
        (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404);
      const message = error instanceof Error ? error.message : String(error);
      return notFound
        ? { ok: false, reason: "not_found", message: `R2 object ${objectKey} not found` }
        : { ok: false, reason: "unavailable", message: `R2 read failed: ${message}` };
    }
  }
}
