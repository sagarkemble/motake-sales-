import { z } from "zod";

import { getProfileById, updateProfile } from "@repo/database/queries/auth";
import type { SelectProfile } from "@repo/database/schema";

import { screenRefusal } from "../errors";
import {
  buildObjectKey,
  buildPublicUrl,
  createClientUpload,
  deleteObject,
  type ImageUploadFormFields,
} from "../uploads/imagekit-client";

const avatarImageFolderName = "avatars";

export const allowedAvatarImageContentTypes = ["image/jpeg", "image/png", "image/webp"] as const;
export const maxAvatarImageContentLengthBytes = 5 * 1024 * 1024;

export const updateProfileNameAndAvatarInputSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  avatarKey: z.string().optional(),
});
export type UpdateProfileNameAndAvatarInput = z.infer<typeof updateProfileNameAndAvatarInputSchema>;

export const createProfileAvatarUploadUrlInputSchema = z.object({
  fileName: z.string().min(1).max(200),
  contentType: z.enum(allowedAvatarImageContentTypes),
  contentLength: z.number().int().positive().max(maxAvatarImageContentLengthBytes),
});
export type CreateProfileAvatarUploadUrlInput = z.infer<
  typeof createProfileAvatarUploadUrlInputSchema
>;

export interface ProfileAvatarUploadUrlResult {
  uploadUrl: string;
  imageKey: string;
  imageUrl: string;
  formFields: ImageUploadFormFields;
}

export async function updateProfileNameAndAvatar(
  profileId: string,
  changes: UpdateProfileNameAndAvatarInput,
): Promise<SelectProfile | undefined> {
  const parsedChanges = updateProfileNameAndAvatarInputSchema.parse(changes);
  const { avatarKey, ...otherChanges } = parsedChanges;

  if (avatarKey === undefined) {
    return updateProfile(profileId, otherChanges);
  }

  if (!avatarKey.startsWith(`${avatarImageFolderName}/${profileId}/`)) {
    throw screenRefusal("photo_upload_invalid", "This avatar image does not belong to you");
  }

  const existingProfile = await getProfileById(profileId);
  const updatedProfile = await updateProfile(profileId, {
    ...otherChanges,
    avatarKey,
    avatarUrl: buildPublicUrl(avatarKey),
  });

  if (existingProfile?.avatarKey && existingProfile.avatarKey !== avatarKey) {
    await deleteObject(existingProfile.avatarKey);
  }

  return updatedProfile;
}

// The Admin uploads a salesman's photo through the Admin's own avatar upload URL, so the key sits in
// the Admin's folder; any other key did not come from that upload.
export function adminUploadedAvatar(
  avatarKey: string,
  adminProfileId: string,
): { avatarKey: string; avatarUrl: string } {
  if (!avatarKey.startsWith(`${avatarImageFolderName}/${adminProfileId}/`)) {
    throw screenRefusal("photo_upload_invalid", "This avatar image was not uploaded by this Admin");
  }
  return { avatarKey, avatarUrl: buildPublicUrl(avatarKey) };
}

export async function deleteProfileAvatar(profileId: string): Promise<SelectProfile | undefined> {
  const existingProfile = await getProfileById(profileId);
  const updatedProfile = await updateProfile(profileId, { avatarKey: null, avatarUrl: null });

  if (existingProfile?.avatarKey) {
    await deleteObject(existingProfile.avatarKey);
  }

  return updatedProfile;
}

export async function createProfileAvatarUploadUrl(
  profileId: string,
  input: CreateProfileAvatarUploadUrlInput,
): Promise<ProfileAvatarUploadUrlResult> {
  const parsedInput = createProfileAvatarUploadUrlInputSchema.parse(input);
  const imageKey = buildObjectKey(avatarImageFolderName, profileId, parsedInput.fileName);
  return createClientUpload(imageKey);
}
