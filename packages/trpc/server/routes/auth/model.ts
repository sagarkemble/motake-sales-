import { z } from "../../schema";

export const appRoleSchema = z.enum(["admin", "salesman"]);

export const createSessionInputSchema = z.object({
  accessToken: z.string().min(1),
});

export const sessionUserSchema = z.object({
  id: z.string(),
  role: appRoleSchema,
});
