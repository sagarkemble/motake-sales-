import { cityService } from "../../services";
import { z, zodUndefinedModel } from "../../schema";
import { adminOrSalesmanProcedure, router } from "../../trpc";
import { apiResponse, apiResponseSchema } from "../../utils/api-response";
import { generatePath } from "../../utils/path-generator";
import { citySchema, createCityInputSchema } from "./model";

const path = generatePath("/cities");

// Admin manages cities in Settings; Admin and salesmen both pick one, or add a missing one, on
// the Customer forms.
export const citiesRouter = router({
  list: adminOrSalesmanProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("/"),
        tags: ["Cities"],
        protect: true,
        summary: "List cities",
        description: "Return every city, by state and then name, for the Customer city picker.",
      },
    })
    .input(zodUndefinedModel)
    .output(apiResponseSchema(z.array(citySchema)))
    .query(async () => apiResponse(await cityService.listCities())),

  create: adminOrSalesmanProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path("/"),
        tags: ["Cities"],
        protect: true,
        summary: "Add a city",
        description:
          "Add a city under an Indian state. Refused as city_name_taken when that state already has a city of the same name in any letter case.",
      },
    })
    .input(createCityInputSchema)
    .output(apiResponseSchema(citySchema))
    .mutation(async ({ ctx, input }) =>
      apiResponse(await cityService.createCity(input, ctx.user.id)),
    ),
});
