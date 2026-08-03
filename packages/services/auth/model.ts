import { z } from "zod";

export const appRoleSchema = z.enum(["admin", "salesman"]);
export type AppRole = z.infer<typeof appRoleSchema>;

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: AppRole;
}

export const createSalesmanAccountInputSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
  name: z.string().min(1).max(120),
  phone: z.string().min(1).max(20),
  salesmanCode: z.string().min(1).max(32),
});
export type CreateSalesmanAccountInput = z.infer<typeof createSalesmanAccountInputSchema>;
