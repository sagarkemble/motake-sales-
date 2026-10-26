import { z } from "zod";

import { INDIAN_STATES, type IndianStateName } from "../shared/indian-states";

const indianStateNames = INDIAN_STATES.map((state) => state.name) as [
  IndianStateName,
  ...IndianStateName[],
];

// Trimmed, inner whitespace collapsed to one space.
export const routeNameSchema = z
  .string()
  .transform((name) => name.trim().replace(/\s+/g, " "))
  .pipe(z.string().min(1).max(120));

export const deliveryStateSchema = z.enum(indianStateNames, {
  error: "Pick the delivery state from the list of Indian states and union territories",
});

export const listRoutesInputSchema = z.object({
  search: z.string().trim().optional(),
  includeHidden: z.boolean().default(false),
});
export type ListRoutesInput = z.input<typeof listRoutesInputSchema>;

export const listRouteChoicesInputSchema = z.object({
  excludeRouteId: z.string().uuid().optional(),
});
export type ListRouteChoicesInput = z.input<typeof listRouteChoicesInputSchema>;

export const routeIdSchema = z.string().uuid();
export const varietyIdSchema = z.string().uuid();

export const createRouteInputSchema = z.object({
  name: routeNameSchema,
  deliveryState: deliveryStateSchema,
});
export type CreateRouteInput = z.input<typeof createRouteInputSchema>;

export const updateRouteInputSchema = createRouteInputSchema.partial();
export type UpdateRouteInput = z.input<typeof updateRouteInputSchema>;

export const routeStatusSchema = z.enum(["active", "inactive"]);
export type RouteStatus = z.infer<typeof routeStatusSchema>;

export const setRoutePriceInputSchema = z.object({
  routeId: z.string().uuid(),
  varietyId: z.string().uuid(),
  // Tax-exclusive, integer paise, above zero.
  pricePaise: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});
export type SetRoutePriceInput = z.input<typeof setRoutePriceInputSchema>;

export const clearRoutePriceInputSchema = setRoutePriceInputSchema.omit({ pricePaise: true });
export type ClearRoutePriceInput = z.input<typeof clearRoutePriceInputSchema>;
