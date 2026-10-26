import { GetObjectCommand, NoSuchKey, S3Client, S3ServiceException } from "@aws-sdk/client-s3";

import type { DocumentReader, ReadDocumentResult } from "./provider";

export interface R2DocumentReaderConfig {
  // e.g. https://<account>.r2.cloudflarestorage.com
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
}

// S3 GetObject on the private Documents bucket (Spec L) with the notification app's own read-only
// R2 key. It never makes a signed or public link.
export class R2DocumentReader implements DocumentReader {
  private readonly client: S3Client;
  private readonly bucketName: string;

  public constructor(config: R2DocumentReaderConfig) {
    this.client = new S3Client({
      region: "auto",
      endpoint: config.endpoint,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
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
