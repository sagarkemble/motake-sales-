import { collectK6CleanupTargets, executeK6Cleanup } from "@repo/services/k6-cleanup";
import { adminProcedure, router } from "../../trpc";
import { apiResponse, apiResponseSchema } from "../../utils/api-response";
import { generatePath } from "../../utils/path-generator";
import { k6CleanupInputSchema, k6CleanupOutputSchema } from "./model";

const path = generatePath("/admin");

export const adminRouter = router({
  k6Cleanup: adminProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path("/k6-cleanup"),
        tags: ["Admin"],
        protect: true,
        summary: "Remove K6 load-test data",
        description:
          "Delete load-test profiles, customers, orders, gatepasses, audit logs, and matching Supabase auth users. Defaults to dry-run.",
      },
    })
    .input(k6CleanupInputSchema)
    .output(apiResponseSchema(k6CleanupOutputSchema))
    .mutation(async ({ input }) => {
      const targets = await collectK6CleanupTargets(input.extraEmails ?? []);

      if (input.dryRun) {
        return apiResponse({ dryRun: true, targets });
      }

      const counts = await executeK6Cleanup(targets);
      return apiResponse({ dryRun: false, targets, counts });
    }),
});
