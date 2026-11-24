// Documents are private ImageKit files: no public URL. Browsers only ever get a 5-minute signed
// GET link; nothing is ever deleted by the app.
export const SIGNED_LINK_SECONDS = 300;

export interface StoredObject {
  bytes: Uint8Array;
  contentType: string;
}

export interface SignedLink {
  url: string;
  expiresAt: Date;
}

// `downloadFileName` makes the link an attachment with that name; without it the object opens
// inline.
export interface SignedLinkOptions {
  contentType: string;
  downloadFileName?: string;
}

// The Document service takes this interface, so tests swap in an in-memory store.
export interface DocumentStore {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject>;
  exists(key: string): Promise<boolean>;
  signedGetLink(key: string, options: SignedLinkOptions): Promise<SignedLink>;
}
