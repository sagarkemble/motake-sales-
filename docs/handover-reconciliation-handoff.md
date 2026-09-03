# Handover Reconciliation — Engineering Handoff

> Audience: an AI agent (or engineer) picking up this feature next. Everything below reflects
> what is **actually in the codebase** as of this handoff, plus decisions and known gaps.

## 1. Feature summary

At end of day a salesman "hands over" their gatepass. Previously this was a one-click action that
auto-set `returnedQty = issued − sold` for every remaining item and flipped the gatepass to
`pending_verification`.

The new flow makes the salesman **declare and reconcile** what is actually coming back, and lets the
admin **approve** or **flag a discrepancy**:

- **Salesman** opens a 3-step wizard:
  1. **Confirm returns** — per item, adjust the quantity actually being returned (pre-filled to the
     amount due back = `issued − sold`).
  2. **Explain** — for every item where `returned < due back`, pick a **reason** (`damaged`,
     `expired`, `lost`, `leaked`, `other`) and optionally a note.
  3. **Review & send** — totals (Ideal / Returning / Short) + flagged list → **Send for Approval**.
- **Admin** sees the submitted handover (submitted-at, per-item Issued/Sold/Expected/Returned/Short +
  reason/note) and either:
  - **Approve & Close** → `closed`, `hasDiscrepancy = false`.
  - **Flag as Discrepancy** (requires a reason) → `closed`, `hasDiscrepancy = true`,
    `discrepancyReason` set, for follow-up.

### State machine

```
not_issued ──allot──▶ active ──salesman submitHandover──▶ pending_verification ──┬─ admin verify ─▶ closed (hasDiscrepancy=false)
                                                                                 └─ admin flag   ─▶ closed (hasDiscrepancy=true, discrepancyReason)
```

A salesman may hold **multiple gatepasses per business date**, but only **one `active` at a time**
(partial unique index on `(salesman_id, business_date) WHERE status = 'active'`). The flow is
sequential — get stock → sell → hand over → get re-allotted a fresh gatepass. Handover is one-shot:
a second submit on a non-`active` gatepass returns `409`. Re-allotment is rejected (`409`) while an
active gatepass exists, and allowed once the current one is handed over / closed. Book-now always
deducts from the single `active` gatepass.

## 2. Data model

Migrations: `packages/database/drizzle/0005_chilly_sauron.sql` (handover columns) and
`packages/database/drizzle/0006_open_gatepass_per_day.sql` (drops the full
`(salesman_id, business_date)` unique index; adds a **partial** unique index on the same columns
`WHERE status = 'active'`, so a salesman can have many gatepasses per day but only one active).

```sql
CREATE TYPE "public"."gatepass_short_reason" AS ENUM('damaged','expired','lost','leaked','other');
ALTER TABLE "gatepasses"     ADD COLUMN "discrepancy_reason" text;
ALTER TABLE "gatepasses"     ADD COLUMN "handover_submitted_at" timestamp with time zone;
ALTER TABLE "gatepass_items" ADD COLUMN "short_reason" "gatepass_short_reason";
ALTER TABLE "gatepass_items" ADD COLUMN "short_note" text;
```

Model files:
- `packages/database/models/enums.ts` — `gatepassShortReasonEnum`.
- `packages/database/models/gatepass.ts` — `discrepancyReason`, `handoverSubmittedAt`.
- `packages/database/models/gatepass-item.ts` — `shortReason`, `shortNote`.

Field semantics (per gatepass item):
- `issuedQty` — allotted for the day.
- `soldQty` — sold via orders (only orders deduct stock).
- `availableQty` — **generated column** `issued_qty − sold_qty` = the amount "due back".
- `returnedQty` — **salesman-declared good units returned** (step 1). Must satisfy
  `0 ≤ returnedQty ≤ issued − sold`.
- Shortfall (not stored) = `(issued − sold) − returnedQty`. When `> 0`, `shortReason` is required and
  `shortNote` is optional.

> ⚠️ Migration-hygiene note: migrations `0003`/`0004` (from a prior task) exist in the journal and are
> applied to the DB, but have **no snapshot files** under `drizzle/meta/`. drizzle-kit therefore
> diffs against the `0002` snapshot and will re-emit `0003`/`0004` statements into any newly generated
> migration. `0005` was hand-trimmed to only its gatepass statements. **If you generate a new
> migration, review the SQL and strip already-applied `0003`/`0004` statements** (shop_photo columns,
> orders `fulfilled_by` FK swap) before committing/running. The `0005_snapshot.json` is a correct full
> baseline, so future diffs off `0005` should be clean.

## 3. Backend

### 3.1 Queries — `packages/database/queries/gatepass/index.ts`

- `submitHandoverForGatepass(gatepassId, salesmanId, handoverItems)` — rewritten.
  - `handoverItems: { gatepassItemId, returnedQty, shortReason?, shortNote? }[]`.
  - Locks gatepass (`FOR UPDATE`); returns outcome union:
    `success | not_found | forbidden | not_active | invalid` (`invalid` carries a `message`).
  - **Atomic validation:** validates *every* item first (foreign id, bounds, reason-required),
    building a `plannedUpdates` list, and only then applies updates. This avoids committing a partial
    handover — earlier code validated inside the update loop, which could commit partial writes because
    returning from a Drizzle transaction **commits** (does not roll back). Do not reintroduce that.
  - Items with `remaining ≤ 0` are left untouched (already settled).
  - Items not present in `handoverItems` default to a full return (`returnedQty = remaining`).
  - Sets `status = pending_verification` and `handoverSubmittedAt = now()`.
- `updateGatepassStatus(...)` — the `changes` Pick now also allows `discrepancyReason` and
  `handoverSubmittedAt`.
- `AllotmentMatrixRow` / `getAllotmentMatrixForDate` — now also select `shortReason`, `shortNote`
  (so the admin review can show why each item is short).
- Exported type `GatepassShortReason` lives here (queries package has no dependency on services).

### 3.2 Service — `packages/services/gatepass/index.ts` + `model.ts`

- `model.ts` adds: `gatepassShortReasonSchema`, `handoverItemSchema`, `submitHandoverInputSchema`
  (now `{ gatepassId, salesmanId, items }`), and `flagGatepassInputSchema` (`{ closedBy, reason, notes? }`).
- `submitHandover(input)` — passes `items` through; maps `invalid → badRequest(400)`,
  `not_found → 404`, `forbidden → 403`, `not_active → 409`.
- `closeGatepass(id, { closedBy, notes? })` — **approve**. Now requires current status
  `pending_verification` (else `409`), and closes with `hasDiscrepancy = false`, `discrepancyReason = null`.
  (Removed the old auto-compute of `hasDiscrepancy` from item deltas.)
- `flagGatepassDiscrepancy(id, { closedBy, reason, notes? })` — **new**. Requires status
  `pending_verification` (else `409`), closes with `hasDiscrepancy = true`, `discrepancyReason = reason`.

### 3.3 tRPC — `packages/trpc/server/routes/gatepass/route.ts` + `model.ts`

Schema changes (`model.ts`):
- `gatepassSchema` += `discrepancyReason: string|null`, `handoverSubmittedAt: date|null`.
- `gatepassItemSchema` += `shortReason: enum|null`, `shortNote: string|null`.
- `allotmentMatrixRowSchema` += `shortReason: enum|null`, `shortNote: string|null`.
- `submitHandoverInputSchema` += `items: handoverItemInputSchema[]`.
- new `flagGatepassInputSchema` (`{ id, reason(min 1, max 500), notes? }`).

Endpoints (`route.ts`):
| Procedure | Method / path | Auth | Notes |
|---|---|---|---|
| `submitHandover` | `POST /api/gatepasses/{gatepassId}/handover` | salesman | body `{ items }`; `salesmanId` from `ctx.user.id` |
| `verify` | `PATCH /api/gatepasses/{id}/verify` | admin | approve & close (no discrepancy) |
| `flagDiscrepancy` | `PATCH /api/gatepasses/{id}/flag` | admin | **new**; body `{ reason, notes? }` |

Response shapes: `submitHandover` → `{ gatepass, items }` (`gatepassWithItemsSchema`); `verify`/`flag`
→ the gatepass (`gatepassSchema`).

## 4. Frontend (`apps/web`)

### 4.1 Hook — `hooks/use-gatepasses.ts`
- Added `flagGatepassMutation` exposed as `flagGatepassDiscrepancy` / `flagGatepassDiscrepancyAsync` /
  `isFlaggingGatepass` / `flagGatepassError`.
- `submitHandoverAsync` now takes `{ gatepassId, items }` (types flow from tRPC).

### 4.2 Salesman wizard — `components/salesman/gatepass/handover-dialog.tsx`
- Export name kept as `HandoverDialog` (so `app/salesman/gatepass/page.tsx` is unchanged; it already
  passes `items` with `id, productName, varietyName, unit, issuedQty, soldQty, remainingQty`).
- 3-step `Dialog` with a `StepHeader`. State: `step`, `returnedByItem`, `reasonByItem`, `noteByItem`.
- Reasons: local `SHORT_REASONS` constant (must stay in sync with the enum).
- Step 2 → 3 is blocked until every short item has a reason (`allDifferencesExplained`).
- On submit builds the `items` payload (adds `shortReason`/`shortNote` only when short) and calls
  `submitHandoverAsync`, then toasts and resets. Confirmation via `AlertDialog`.
- Reuses `components/shared/quantity-stepper.tsx` (`QuantityStepper`: props `quantity`,
  `onQuantityChange`, `minQuantity`).

### 4.3 Admin review — `components/admin/salesman/verification-tab.tsx`
- Rewritten. Reads pending gatepass from `gatepasses` list + rows from `allotmentMatrix` (filtered by
  `salesmanId`).
- Shows submitted-at (from `handoverSubmittedAt`), Expected/Returned/Short summary, and a per-item
  table with a Reason column (`shortReason` + `shortNote`).
- Actions: **Approve & Close** (`verifyGatepassAsync`) and **Flag as Discrepancy** (opens an
  `AlertDialog` with a required reason `Textarea`, then `flagGatepassDiscrepancyAsync`).

Unchanged but related: `components/admin/salesman/gatepass-tab.tsx` still renders returned totals from
the matrix and works as-is.

## 5. Tests (k6) — `k6/`

Handover coverage was added to the two existing scenarios (no new scenario). See `k6/README.md`
("Handover reconciliation") for the full tables.

- Assertion helpers in `k6/lib/pricing.js`: `assertGatepassItemHandoverShape`,
  `assertHandoverSubmitted`, `assertHandoverItemsConsistent`, `assertGatepassApproved`,
  `assertGatepassFlagged`. `NIL_UUID` in `k6/lib/http.js`.
- **Salesman** (`k6/flows/salesman.js`) tags: `handover_full`, `handover_partial`,
  `handover_short_no_reason`, `handover_over_return`, `handover_foreign_item`, `handover_not_found`,
  `handover_verify_forbidden`, `handover_flag_forbidden`.
- **Admin** (`k6/flows/admin.js`) tags: `handover_approve`, `handover_flag`,
  `handover_approve_not_pending`, `handover_flag_no_reason`, `handover_verify_not_found`,
  `handover_flag_not_found`.
- Happy paths accept `[200, 409, 404]` (concurrent VUs share one gatepass/day) and only assert on
  `200`. Negative paths assert the rejection status via `http.expectedStatuses`.
- **Important interaction:** book-now throws "No active gatepass" (400) once a gatepass leaves
  `active`. Because handovers now flip state, the existing book-now branch is gated on
  `isActiveGatepass` and tolerates `[200, 400, 409]`. Keep that guard if you touch the salesman flow.

### Run

```bash
# short smoke (match VUs to seeded salesmen count to avoid stale-token 401s)
K6_SALESMAN_VUS=10 K6_ADMIN_VUS=2 K6_RAMP_UP=5s K6_HOLD_DURATION=50s K6_RAMP_DOWN=5s pnpm loadtest
```

Last smoke result: `http_req_failed 0.00%` (0/1177), all executed checks passed, thresholds held.
`pnpm loadtest` cleans prior k6 data and refreshes tokens automatically. Cleanup:
`CLEANUP_CONFIRM=1 pnpm cleanup:k6`.

## 6. Decisions (locked)

1. **One reason per short item** for v1 (splitting one item's shortfall across multiple reasons was
   deferred).
2. **Approve = clean close; Flag = discrepancy.** A short-but-approved handover is **not** auto-counted
   as a discrepancy anymore — it only counts when the admin explicitly flags it. This changed the old
   auto-compute behavior feeding the end-of-day discrepancy KPI (`getEndOfDayTotalsForDate` counts
   `hasDiscrepancy = true`).
3. Handover kept on a `Dialog` (not a bottom sheet) to match the existing pattern.
4. `returnedQty` semantics = good units returned; shortfall is derived, never stored.
5. **Multiple gatepasses per salesman per day, at most one `active`.** Allotment only blocks on an
   existing *active* gatepass (not any gatepass), so a salesman can be re-stocked after a handover.
   `allotGatepass` checks `getActiveGatepassBySalesmanAndDate`; `getGatepassBySalesmanAndDate`
   (feeds `getMine`) now returns the `active` gatepass first, else the most recent; book-now selects
   and locks the `active` gatepass explicitly. The alternative (many *concurrent* active gatepasses)
   was rejected because it makes book-now/handover ambiguous.

## 7. Known gaps / suggested follow-ups

- **No global admin "pending approvals" queue page.** Approvals happen per-salesman in the Verification
  tab. A dashboard queue (all salesmen with a pending handover today) would help owners.
- **Discrepancy data is now surfaced** on the admin dashboard. `GET /api/gatepasses/discrepancies?businessDate=`
  (query `getDiscrepancyGatepassesForDate` → service `getDiscrepancies` → tRPC `gatepasses.getDiscrepancies`)
  returns each flagged gatepass with salesman, `discrepancyReason`, who closed it, and per-gatepass
  issued/sold/returned/**short** totals (short = `Σ max((issued−sold)−returned, 0)`, scoped to that
  gatepass — never summed across the salesman's other gatepasses). Rendered by
  `components/admin/dashboard/discrepancy-panel.tsx` under the dashboard's gate-pass KPIs. The
  `discrepancyGatepassCount` KPI still counts flagged gatepass rows for the date.
- **DB check constraint not added** for `returnedQty ≤ issued − sold`; enforced only in the service.
  Consider adding a CHECK if you want a hard DB guarantee (note `sold` can change before handover).
- **No unit/integration tests** for the service (`submitHandover` invalid/atomic paths,
  `closeGatepass`/`flag` state guards) — only k6 e2e. Worth adding.
- **`SHORT_REASONS`** is duplicated across the wizard component and the zod enums; if reasons change,
  update `enums.ts`, both zod schemas, and the component.
- **Salesman 403-ownership** path (handing over another salesman's gatepass) is covered in the service
  (`forbidden`) but not exercised by k6 (a salesman can't easily obtain another's gatepass id).
- **Timezone:** `handoverSubmittedAt` is stored as `timestamptz`; the admin UI formats with
  `date-fns` `"d MMM, p"` in local time. Business date logic remains IST-based
  (`toIstBusinessDate`).

## 8. Quick file index

Backend
- `packages/database/models/{enums,gatepass,gatepass-item}.ts`
- `packages/database/drizzle/0005_chilly_sauron.sql` (+ `meta/0005_snapshot.json`, `meta/_journal.json`)
- `packages/database/queries/gatepass/index.ts`
- `packages/services/gatepass/{index,model}.ts`
- `packages/trpc/server/routes/gatepass/{route,model}.ts`

Frontend
- `apps/web/hooks/use-gatepasses.ts`
- `apps/web/components/salesman/gatepass/handover-dialog.tsx`
- `apps/web/components/admin/salesman/verification-tab.tsx`

Tests
- `k6/lib/{pricing,http}.js`, `k6/flows/{salesman,admin}.js`, `k6/README.md`

## 9. Verification checklist for the next agent

- [ ] `pnpm check-types` (root) is green; `npx tsc --noEmit` in `packages/{database,services,trpc}`.
- [ ] `pnpm db:migrate` reports no pending migration (0005 applied). If you generated a new migration,
      re-read §2 migration-hygiene note.
- [ ] Salesman wizard: full return, partial+reason, and the "can't advance without a reason" gate.
- [ ] Admin: approve (no discrepancy) and flag (discrepancy + reason); both blocked unless
      `pending_verification`.
- [ ] k6 smoke: `http_req_failed < 5%`, `checks > 90%`.
