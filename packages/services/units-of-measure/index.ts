import { db } from "@repo/database";
import { runInTransaction, type DbExecutor } from "@repo/database/queries/shared/executor";
import { violatedUniqueConstraint } from "@repo/database/queries/shared/pg-errors";
import {
  createUnitOfMeasure,
  findUnitOfMeasureIgnoringCase,
  getUnitOfMeasureByCode,
  listUnitsOfMeasure,
} from "@repo/database/queries/units-of-measure";
import type { SelectUnitOfMeasure } from "@repo/database/schema";

import { screenRefusal } from "../errors";
import { createdFields, recordAudit } from "../shared/audit";
import { createUnitOfMeasureInputSchema, type CreateUnitOfMeasureInput } from "./model";

const unitCodeConstraints = ["units_of_measure_code_unique", "units_of_measure_code_lower_unique"];

function unitTaken(code: string) {
  return screenRefusal("unit_taken", `${code} is already a unit`, { code });
}

// The units a Variety's size is measured in. Added from Admin Settings or the Variety form; never
// edited or deleted.
class UnitOfMeasureService {
  public async listUnits(): Promise<SelectUnitOfMeasure[]> {
    return listUnitsOfMeasure();
  }

  public async createUnit(
    input: CreateUnitOfMeasureInput,
    actorProfileId: string,
  ): Promise<SelectUnitOfMeasure> {
    const parsedInput = createUnitOfMeasureInputSchema.parse(input);
    try {
      return await runInTransaction(async (transaction) => {
        if (await findUnitOfMeasureIgnoringCase(parsedInput.code, transaction)) {
          throw unitTaken(parsedInput.code);
        }
        const unit = await createUnitOfMeasure(
          { code: parsedInput.code, createdBy: actorProfileId },
          transaction,
        );
        await recordAudit(
          {
            actorId: actorProfileId,
            action: "created",
            entityType: "unit_of_measure",
            entityId: unit.id,
            payload: createdFields(parsedInput),
          },
          transaction,
        );
        return unit;
      });
    } catch (error) {
      const constraint = violatedUniqueConstraint(error);
      if (constraint && unitCodeConstraints.includes(constraint)) throw unitTaken(parsedInput.code);
      throw error;
    }
  }

  // For Variety writes: the picked unit must exist.
  public async assertUnitExists(code: string, executor: DbExecutor = db): Promise<void> {
    if (!(await getUnitOfMeasureByCode(code, executor))) {
      throw screenRefusal("unit_not_found", `${code} is not a unit. Add it first.`, { code });
    }
  }
}

export default UnitOfMeasureService;

export {
  createUnitOfMeasureInputSchema,
  unitOfMeasureCodeSchema,
  type CreateUnitOfMeasureInput,
} from "./model";
