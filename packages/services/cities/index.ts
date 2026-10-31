import {
  createCity,
  findCityByNameIgnoringCase,
  getCityById,
  listCities,
} from "@repo/database/queries/cities";
import { db } from "@repo/database";
import { runInTransaction, type DbExecutor } from "@repo/database/queries/shared/executor";
import { violatedUniqueConstraint } from "@repo/database/queries/shared/pg-errors";
import type { SelectCity } from "@repo/database/schema";

import { notFound, screenRefusal } from "../errors";
import { createdFields, recordAudit } from "../shared/audit";
import { createCityInputSchema, type CreateCityInput } from "./model";

const cityNameConstraint = "cities_state_name_unique";

function cityNameTaken(name: string, state: string) {
  return screenRefusal("city_name_taken", `${name} is already a city in ${state}`, {
    name,
    state,
  });
}

// The cities a Customer can be in, each under one state. Added from Admin Settings or a Customer
// form (Admin or salesman); never edited or deleted.
class CityService {
  public async listCities(): Promise<SelectCity[]> {
    return listCities();
  }

  public async createCity(input: CreateCityInput, actorProfileId: string): Promise<SelectCity> {
    const parsedInput = createCityInputSchema.parse(input);
    try {
      return await runInTransaction(async (transaction) => {
        if (await findCityByNameIgnoringCase(parsedInput.state, parsedInput.name, transaction)) {
          throw cityNameTaken(parsedInput.name, parsedInput.state);
        }
        const newCity = { ...parsedInput, createdBy: actorProfileId };
        const city = await createCity(newCity, transaction);
        await recordAudit(
          {
            actorId: actorProfileId,
            action: "created",
            entityType: "city",
            entityId: city.id,
            payload: createdFields(parsedInput),
          },
          transaction,
        );
        return city;
      });
    } catch (error) {
      if (violatedUniqueConstraint(error) === cityNameConstraint) {
        throw cityNameTaken(parsedInput.name, parsedInput.state);
      }
      throw error;
    }
  }

  // For Customer writes: the picked city must exist.
  public async assertCityExists(cityId: string, executor: DbExecutor = db): Promise<void> {
    if (!(await getCityById(cityId, executor))) throw notFound(`City ${cityId} not found`);
  }
}

export default CityService;

export { cityNameSchema, createCityInputSchema, type CreateCityInput } from "./model";
