import { randomUUID } from "crypto";
import ImageKit from "@imagekit/nodejs";

import { logger } from "@repo/logger";

import { env } from "../env";

export const IMAGEKIT_UPLOAD_URL = "https://upload.imagekit.io/api/v1/files/upload";

export interface ImageUploadFormFields {
  publicKey: string;
  signature: string;
  expire: string;
  token: string;
  fileName: string;
  folder: string;
  useUniqueFileName: string;
}

export interface ClientUploadSession {
  uploadUrl: string;
  imageKey: string;
  imageUrl: string;
  formFields: ImageUploadFormFields;
}

let imageKitClient: ImageKit | undefined;

export function getImageKitClient(): ImageKit {
  if (!imageKitClient) {
    imageKitClient = new ImageKit({ privateKey: env.IMAGEKIT_PRIVATE_KEY });
  }
  return imageKitClient;
}

export function filePathOf(objectKey: string): string {
  return `/${objectKey.replace(/^\/+/, "")}`;
}

export function splitObjectKey(objectKey: string): { folder: string; fileName: string } {
  const normalized = objectKey.replace(/^\/+/, "");
  const slash = normalized.lastIndexOf("/");
  if (slash <= 0) return { folder: "/", fileName: normalized };
  return { folder: `/${normalized.slice(0, slash)}`, fileName: normalized.slice(slash + 1) };
}

export function buildObjectKey(folderName: string, ownerId: string, fileName: string): string {
  const safeFileName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  return `${folderName}/${ownerId}/${randomUUID()}-${safeFileName}`;
}

export function buildPublicUrl(objectKey: string): string {
  const base = env.IMAGEKIT_URL_ENDPOINT.replace(/\/+$/, "");
  return `${base}${filePathOf(objectKey)}`;
}

export function createClientUpload(objectKey: string): ClientUploadSession {
  const { folder, fileName } = splitObjectKey(objectKey);
  const auth = getImageKitClient().helper.getAuthenticationParameters();
  return {
    uploadUrl: IMAGEKIT_UPLOAD_URL,
    imageKey: objectKey,
    imageUrl: buildPublicUrl(objectKey),
    formFields: {
      publicKey: env.IMAGEKIT_PUBLIC_KEY,
      signature: auth.signature,
      expire: String(auth.expire),
      token: auth.token,
      fileName,
      folder,
      useUniqueFileName: "false",
    },
  };
}

async function fileIdForObjectKey(objectKey: string): Promise<string | undefined> {
  const { folder, fileName } = splitObjectKey(objectKey);
  const listed = await getImageKitClient().assets.list({
    path: folder,
    searchQuery: `name="${fileName}"`,
    limit: 1,
  });
  for (const item of listed) {
    if (item.type === "file" && item.fileId) return item.fileId;
  }
  return undefined;
}

export async function deleteObject(objectKey: string): Promise<void> {
  try {
    const fileId = await fileIdForObjectKey(objectKey);
    if (!fileId) return;
    await getImageKitClient().files.delete(fileId);
  } catch (deleteError) {
    logger.error(`Failed to delete ImageKit object ${objectKey}`, { error: deleteError });
  }
}
