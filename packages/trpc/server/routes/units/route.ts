import { unitOfMeasureService } from "../../services";
import { z, zodUndefinedModel } from "../../schema";
import { adminProcedure, router } from "../../trpc";
import { apiResponse, apiResponseSchema } from "../../utils/api-response";
import { generatePath } from "../../utils/path-generator";
import { createUnitOfMeasureInputSchema, unitOfMeasureSchema } from "./model";

const path = generatePath("/units");

// The units a Variety's size is measured in. Admin manages them in Settings and picks one, or adds
// a missing one, on the Variety form.
export const unitsRouter = router({
  list: adminProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("/"),
        tags: ["Units"],
        protect: true,
        summary: "List units",
        description:
          "Return every unit of measure: ml, L, g and kg first, then the ones Admin added.",
      },
    })
    .input(zodUndefinedModel)
    .output(apiResponseSchema(z.array(unitOfMeasureSchema)))
    .query(async () => apiResponse(await unitOfMeasureService.listUnits())),

  create: adminProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path("/"),
        tags: ["Units"],
        protect: true,
        summary: "Add a unit",
        description:
          "Add a unit of measure, one word like pcs. Refused as unit_taken when the unit is already there in any letter case. Units are never edited or removed.",
      },
    })
    .input(createUnitOfMeasureInputSchema)
    .output(apiResponseSchema(unitOfMeasureSchema))
    .mutation(async ({ ctx, input }) =>
      apiResponse(await unitOfMeasureService.createUnit(input, ctx.user.id)),
    ),
});
