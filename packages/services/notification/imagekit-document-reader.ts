import ImageKit from "@imagekit/nodejs";

import type { DocumentReader, ReadDocumentResult } from "./provider";
import { filePathOf } from "../uploads/imagekit-client";

export interface ImageKitDocumentReaderConfig {
  privateKey: string;
  urlEndpoint: string;
}

const REQUEST_TIMEOUT_MS = 30_000;

export class ImageKitDocumentReader implements DocumentReader {
  private readonly client: ImageKit;
  private readonly urlEndpoint: string;

  public constructor(config: ImageKitDocumentReaderConfig) {
    this.client = new ImageKit({ privateKey: config.privateKey });
    this.urlEndpoint = config.urlEndpoint;
  }

  public async read(objectKey: string): Promise<ReadDocumentResult> {
    try {
      const url = this.client.helper.buildSrc({
        urlEndpoint: this.urlEndpoint,
        src: filePathOf(objectKey),
        signed: true,
        expiresIn: 60,
      });
      const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (response.status === 404) {
        return { ok: false, reason: "not_found", message: `ImageKit object ${objectKey} not found` };
      }
      if (!response.ok) {
        return {
          ok: false,
          reason: "unavailable",
          message: `ImageKit read failed: ${response.status}`,
        };
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      return { ok: true, bytes, contentType: response.headers.get("content-type") };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, reason: "unavailable", message: `ImageKit read failed: ${message}` };
    }
  }
}
