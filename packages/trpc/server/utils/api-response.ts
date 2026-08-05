import { z } from "../schema";

export function apiResponse<T>(data: T) {
  return {
    success: true as const,
    data,
  };
}

export function apiResponseSchema<T extends z.ZodType>(dataSchema: T) {
  return z.object({
    success: z.literal(true),
    data: dataSchema,
  });
}
