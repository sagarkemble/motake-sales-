import { z } from "zod";

export const k6CleanupInputSchema = z.object({
  dryRun: z.boolean().default(true),
  extraEmails: z.array(z.string().email()).optional(),
});

export const k6CleanupTargetsSchema = z.object({
  profiles: z.array(
    z.object({
      id: z.string().uuid(),
      email: z.string(),
      role: z.string(),
      name: z.string().nullable(),
    }),
  ),
  customers: z.array(
    z.object({
      id: z.string().uuid(),
      shop_name: z.string(),
      phone: z.string(),
      notes: z.string().nullable(),
    }),
  ),
  orders: z.array(
    z.object({
      id: z.string().uuid(),
      notes: z.string().nullable(),
      idempotency_key: z.string().nullable(),
    }),
  ),
  gatepasses: z.array(
    z.object({
      id: z.string().uuid(),
      business_date: z.string(),
      status: z.string(),
      notes: z.string().nullable(),
    }),
  ),
  auditLogs: z.array(z.object({ id: z.string().uuid() })),
  authUsers: z.array(z.object({ id: z.string().uuid(), email: z.string() })),
});

export const k6CleanupCountsSchema = z.object({
  orderItemsDeleted: z.number(),
  ordersDeleted: z.number(),
  gatepassItemsDeleted: z.number(),
  gatepassesDeleted: z.number(),
  auditDeleted: z.number(),
  customersDeleted: z.number(),
  profilesDeleted: z.number(),
  authDeleted: z.number(),
});

export const k6CleanupOutputSchema = z.object({
  dryRun: z.boolean(),
  targets: k6CleanupTargetsSchema,
  counts: k6CleanupCountsSchema.optional(),
});
