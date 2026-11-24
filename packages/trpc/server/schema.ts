import { z } from "zod";

export const imageUploadFormFieldsSchema = z.object({
  publicKey: z.string(),
  signature: z.string(),
  expire: z.string(),
  token: z.string(),
  fileName: z.string(),
  folder: z.string(),
  useUniqueFileName: z.string(),
});

export const zodUndefinedModel = z
  .preprocess((rawInput) => {
    const isEmptyObject =
      rawInput !== null && typeof rawInput === "object" && Object.keys(rawInput).length === 0;
    return isEmptyObject ? undefined : rawInput;
  }, z.undefined())
  .describe("undefined") as unknown as z.ZodType<undefined, undefined>;
export { z };
