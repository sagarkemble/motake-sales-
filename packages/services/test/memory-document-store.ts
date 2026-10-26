import { R2DocumentStore, type StoredObject } from "@repo/pdf/store";

// Document tests never call R2: objects live in a Map. Signed links still go through the real R2
// presigner, which signs locally with these placeholder credentials and makes no network call.
export const TEST_DOCUMENTS_BUCKET = "motake-documents-test";

export class MemoryDocumentStore extends R2DocumentStore {
  public readonly objects = new Map<string, StoredObject>();
  // Every put in order, so a test can see that nothing was drawn twice.
  public readonly puts: string[] = [];

  public constructor() {
    super({
      accountId: "test-account",
      accessKeyId: "test-placeholder",
      secretAccessKey: "test-placeholder",
      bucketName: TEST_DOCUMENTS_BUCKET,
    });
  }

  public override async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    this.puts.push(key);
    this.objects.set(key, { bytes, contentType });
  }

  public override async get(key: string): Promise<StoredObject> {
    const stored = this.objects.get(key);
    if (!stored) throw new Error(`No object stored under ${key}`);
    return stored;
  }

  public override async exists(key: string): Promise<boolean> {
    return this.objects.has(key);
  }
}
