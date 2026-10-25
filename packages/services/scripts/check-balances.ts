// Compares every Customer's stored Balance with its Ledger sum. Run after go-live Opening balances
// are inserted by hand, or whenever a Balance looks wrong.
//
//   pnpm money:check-balances
//   pnpm money:check-balances --rebuild --actor <profile id> --reason "<why>"
//
// --rebuild sets each mismatched stored Balance to its Ledger sum and audits it; the Ledger itself
// is never changed. Exits 1 while mismatches remain.
import { parseArgs } from "node:util";

import { LedgerService } from "../money";

const { values } = parseArgs({
  options: {
    rebuild: { type: "boolean", default: false },
    actor: { type: "string" },
    reason: { type: "string" },
  },
});

const ledger = new LedgerService();

async function main(): Promise<number> {
  const mismatches = await ledger.findBalanceMismatches();

  if (mismatches.length === 0) {
    console.log("Every stored Balance matches its Ledger.");
    return 0;
  }

  console.table(mismatches);

  if (!values.rebuild) return 1;
  if (!values.actor || !values.reason) {
    console.error("--rebuild needs --actor <profile id> and --reason <text>.");
    return 1;
  }

  for (const { customerId } of mismatches) {
    const result = await ledger.rebuildBalance({
      customerId,
      actorId: values.actor,
      reason: values.reason,
    });
    console.log(`${customerId}: ${result.beforePaise} → ${result.afterPaise} paise`);
  }
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
