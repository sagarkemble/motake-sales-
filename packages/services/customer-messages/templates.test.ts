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
  /\('whatsapp', '([a-z0-9_]+)', '(en|mr|hi)', (\d+), '(\[[^']*\])'::jsonb, '(pdf|none)', true\)/g;

describe("notification-templates-v2.sql", () => {
  it("inserts every template in en, mr and hi with the code's value names, in order, and its document type", () => {
    // The highest version of each template and language is the one in use.
    const latest = new Map<string, { version: number; row: Record<string, unknown> }>();
    for (const [, templateId, language, version, values, documentType] of sql.matchAll(
      rowPattern,
    )) {
      const key = `${templateId}|${language}`;
      if ((latest.get(key)?.version ?? 0) < Number(version)) {
        latest.set(key, {
          version: Number(version),
          row: { templateId, language, values: JSON.parse(values!) as string[], documentType },
        });
      }
    }
    const rows = [...latest.values()].map((entry) => entry.row);

    const expected = Object.values(customerMessageTemplates).flatMap((template) =>
      (["en", "mr"] as const).map((language) => ({
        templateId: template.templateId,
        language,
        values: [...template.values],
        documentType: template.pdf ? "pdf" : "none",
      })),
    );
    expect(rows).toHaveLength(18);
    expect(rows).toEqual(expected);
  });
});
