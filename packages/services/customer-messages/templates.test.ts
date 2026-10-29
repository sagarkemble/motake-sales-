import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { customerMessageTemplates } from "./model";

// The hand-inserted template rows (scripts/notification-templates-v2.sql) must match the code
// constants exactly, or K refuses every instruction as template_values_mismatch.

const sql = readFileSync(
  resolve(__dirname, "../../../scripts/notification-templates-v2.sql"),
  "utf8",
);
const rowPattern =
  /\('whatsapp', '([a-z0-9_]+)', '(en|mr|hi)', 1, '(\[[^']*\])'::jsonb, '(pdf|none)', true\)/g;

describe("notification-templates-v2.sql", () => {
  it("inserts every template in en, mr and hi with the code's value names, in order, and its document type", () => {
    const rows = [...sql.matchAll(rowPattern)].map(
      ([, templateId, language, values, documentType]) => ({
        templateId,
        language,
        values: JSON.parse(values!) as string[],
        documentType,
      }),
    );

    const expected = Object.values(customerMessageTemplates).flatMap((template) =>
      (["en", "mr", "hi"] as const).map((language) => ({
        templateId: template.templateId,
        language,
        values: [...template.values],
        documentType: template.pdf ? "pdf" : "none",
      })),
    );
    expect(rows).toHaveLength(27);
    expect(rows).toEqual(expected);
  });
});
