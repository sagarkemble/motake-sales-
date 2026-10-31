import { AMOUNT_TOO_LARGE, MAX_AMOUNT_PAISE } from "@repo/services/limits";
import { INDIAN_STATES, routeNameSchema, type IndianStateName } from "@repo/services/routes";

import { z } from "../../schema";

const indianStateNames = INDIAN_STATES.map((state) => state.name) as [
  IndianStateName,
  ...IndianStateName[],
];

export const routeStatusSchema = z.enum(["active", "inactive"]);
export const deliveryStateSchema = z.enum(indianStateNames);

export const routeSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string(),
  deliveryState: z.string(),
  status: routeStatusSchema,
  deletedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const routeListRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string(),
  deliveryState: z.string(),
  status: routeStatusSchema,
  hidden: z.boolean(),
  pricedVarietyCount: z.number().int(),
});

export const routeChoiceSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string(),
  status: routeStatusSchema,
});

export const routePriceFormRowSchema = z.object({
  varietyId: z.string(),
  productName: z.string(),
  varietyName: z.string(),
  sku: z.string(),
  varietyActive: z.boolean(),
  // Tax-exclusive integer paise; null = Unsellable on this Route.
  pricePaise: z.number().int().nullable(),
  pricedOnAnyRoute: z.boolean(),
});

export const routeWithPriceFormSchema = z.object({
  route: routeSchema,
  varieties: z.array(routePriceFormRowSchema),
});

export const routePriceSchema = z.object({
  id: z.string(),
  routeId: z.string(),
  varietyId: z.string(),
  pricePaise: z.number().int(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const listRoutesInputSchema = z.object({
  search: z.string().optional(),
  includeHidden: z.boolean().optional().default(false),
});

export const routeChoicesInputSchema = z.object({
  excludeRouteId: z.string().uuid().optional(),
});

export const routeIdInputSchema = z.object({ id: z.string().uuid() });

// Same rule as the service: trimmed, inner whitespace collapsed, then 1–120 characters.
export const createRouteInputSchema = z.object({
  name: routeNameSchema,
  deliveryState: deliveryStateSchema,
});

export const updateRouteInputSchema = routeIdInputSchema.extend({
  name: routeNameSchema.optional(),
  deliveryState: deliveryStateSchema.optional(),
});

export const setRouteStatusInputSchema = routeIdInputSchema.extend({
  status: routeStatusSchema,
});

export const setRoutePriceInputSchema = z.object({
  routeId: z.string().uuid(),
  varietyId: z.string().uuid(),
  pricePaise: z.number().int().positive().max(MAX_AMOUNT_PAISE, AMOUNT_TOO_LARGE),
});

export const clearRoutePriceInputSchema = z.object({
  routeId: z.string().uuid(),
  varietyId: z.string().uuid(),
});

export const clearRoutePriceOutputSchema = z.object({ cleared: z.literal(true) });
