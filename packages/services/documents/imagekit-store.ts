import ImageKit, { toFile } from "@imagekit/nodejs";
import {
  SIGNED_LINK_SECONDS,
  type DocumentStore,
  type SignedLink,
  type SignedLinkOptions,
  type StoredObject,
} from "@repo/pdf/store";

import { filePathOf, splitObjectKey } from "../uploads/imagekit-client";

export interface ImageKitDocumentStoreConfig {
  privateKey: string;
  urlEndpoint: string;
}

function attachmentQuery(downloadFileName: string | undefined): Record<string, string> {
  if (!downloadFileName) return {};
  return { "ik-attachment": "true" };
}

export class ImageKitDocumentStore implements DocumentStore {
  private readonly client: ImageKit;

  public constructor(private readonly config: ImageKitDocumentStoreConfig) {
    this.client = new ImageKit({ privateKey: config.privateKey });
  }

  public async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    const { folder, fileName } = splitObjectKey(key);
    await this.client.files.upload({
      file: await toFile(Buffer.from(bytes), fileName, { type: contentType }),
      fileName,
      folder,
      isPrivateFile: true,
      useUniqueFileName: false,
      overwriteFile: true,
    });
  }

  public async get(key: string): Promise<StoredObject> {
    const link = await this.signedGetLink(key, { contentType: "application/octet-stream" });
    const response = await fetch(link.url);
    if (response.status === 404) throw new Error(`Document ${key} not found`);
    if (!response.ok) throw new Error(`Document ${key} read failed: ${response.status}`);
    return {
      bytes: new Uint8Array(await response.arrayBuffer()),
      contentType: response.headers.get("content-type") ?? "application/octet-stream",
    };
  }

  public async exists(key: string): Promise<boolean> {
    try {
      const link = await this.signedGetLink(key, { contentType: "application/octet-stream" });
      const response = await fetch(link.url, { method: "HEAD" });
      if (response.ok) return true;
      if (response.status === 404) return false;
      const getResponse = await fetch(link.url, { method: "GET" });
      return getResponse.ok;
    } catch {
      return false;
    }
  }

  public async signedGetLink(key: string, options: SignedLinkOptions): Promise<SignedLink> {
    const signedAt = Date.now();
    const url = this.client.helper.buildSrc({
      urlEndpoint: this.config.urlEndpoint,
      src: filePathOf(key),
      signed: true,
      expiresIn: SIGNED_LINK_SECONDS,
      queryParameters: attachmentQuery(options.downloadFileName),
    });
    return { url, expiresAt: new Date(signedAt + SIGNED_LINK_SECONDS * 1000) };
  }
}
