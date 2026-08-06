import { z } from "../../schema";

export const appRoleSchema = z.enum(["admin", "salesman"]);

export const createSessionInputSchema = z.object({
  accessToken: z.string().min(1),
});

export const sessionUserSchema = z.object({
  id: z.string(),
  role: appRoleSchema,
});

export const signedInUserSchema = z.object({
  id: z.string(),
  role: appRoleSchema,
  name: z.string().nullable(),
  avatarUrl: z.string().nullable(),
});

export const updatedPhoneSchema = z.object({
  id: z.string(),
  phone: z.string().nullable(),
});
