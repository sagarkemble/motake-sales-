import {
  SIGNED_LINK_SECONDS,
  type DocumentStore,
  type SignedLink,
  type SignedLinkOptions,
  type StoredObject,
} from "@repo/pdf/store";

export const TEST_IMAGEKIT_ID = "test";

export class MemoryDocumentStore implements DocumentStore {
  public readonly objects = new Map<string, StoredObject>();
  // Every put in order, so a test can see that nothing was drawn twice.
  public readonly puts: string[] = [];

  public async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    this.puts.push(key);
    this.objects.set(key, { bytes, contentType });
  }

  public async get(key: string): Promise<StoredObject> {
    const stored = this.objects.get(key);
    if (!stored) throw new Error(`No object stored under ${key}`);
    return stored;
  }

  public async exists(key: string): Promise<boolean> {
    return this.objects.has(key);
  }

  public async signedGetLink(key: string, options: SignedLinkOptions): Promise<SignedLink> {
    const expiresAt = new Date(Date.now() + SIGNED_LINK_SECONDS * 1000);
    const url = new URL(`https://ik.imagekit.io/${TEST_IMAGEKIT_ID}/${key}`);
    url.searchParams.set("ik-s", "test-signature");
    url.searchParams.set("ik-t", String(Math.floor(expiresAt.getTime() / 1000)));
    if (options.downloadFileName) {
      url.searchParams.set("ik-attachment", "true");
      url.searchParams.set("ik-fileName", options.downloadFileName);
    }
    return { url: url.toString(), expiresAt };
  }
}
