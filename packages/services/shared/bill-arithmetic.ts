import type { SelectNote } from "@repo/database/schema";

import type { LedgerRefusalReason } from "../errors";
import {
  computeBillTax,
  type BillTax,
  type LineTax,
  type PlaceOfSupply,
  type TaxLineInput,
} from "./tax-engine";

// Bill arithmetic for the Admin Bill paper (Spec G). Pure: no database, no floats. Remaining
// uncredited qty and value per line, Correct classification, independent Note lines and the
// Cancel Credit Note. Line tax and Bill totals come from Spec F's tax engine.
//
// Note line amounts follow the Note PDF (Spec L): on a GST Credit Note or Debit Note a line's
// `amountPaise` is its taxable value and the tax sits in cgst / sgst / igst; on a Commercial
// Credit Note `amountPaise` is the tax-inclusive value and the tax columns are 0. Either way a
// line's value is amount + cgst + sgst + igst.

export type NoteKind = SelectNote["kind"];
export type CreditNoteKind = Exclude<NoteKind, "debit_note">;

// One Bill line as stored on bill_items and in bill_versions.items: frozen price and tax facts
// plus its taxed paise.
export interface ArithmeticLine extends TaxLineInput, LineTax {
  id: string;
}

export interface ArithmeticNoteLine {
  snapshotLineId: string;
  quantity: number;
  amountPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
}

// A Note on the Bill with its lines; Notes are passed in the order they were raised.
export interface ArithmeticNote {
  kind: NoteKind;
  amountPaise: number;
  lines: ArithmeticNoteLine[];
}

export type LineComponents = LineTax;

export interface LineStanding {
  lineId: string;
  // On the live Bill; 0 once Correct removed the line.
  currentQty: number;
  // First-version qty + Debit Note qty − Credit Note qty on this line (every Note counts).
  remainingQty: number;
  // How far below the live qty is already credited: the Correct floor.
  creditedQty: number;
  remaining: LineComponents;
  remainingValuePaise: number;
}

export interface BillStanding {
  lines: LineStanding[];
  // Bill debit + Debit Notes − Credit Notes (header amounts, round-off included).
  netLedgerPaise: number;
  hasNotes: boolean;
}

export interface NoteLineDraft {
  lineId: string;
  quantity: number;
  amountPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
}

export interface NoteDraft {
  kind: NoteKind;
  // Positive Customer effect; may differ from the line sum by the Bill's round-off.
  amountPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  lines: NoteLineDraft[];
}

// Every arithmetic refusal is a Ledger refusal reason, checked here at the type level.
export const ARITHMETIC_REFUSAL_REASONS = [
  "unknown_line",
  "nothing_changed",
  "all_lines_zero",
  "below_credited_qty",
  "note_amount_zero",
  "no_lines",
  "credit_qty_above_remaining",
  "nothing_to_cancel",
] as const satisfies readonly LedgerRefusalReason[];
export type ArithmeticRefusalReason = (typeof ARITHMETIC_REFUSAL_REASONS)[number];

export interface ArithmeticRefusal {
  ok: false;
  reason: ArithmeticRefusalReason;
  details: Record<string, unknown> | null;
}

const ZERO: LineComponents = { taxablePaise: 0, cgstPaise: 0, sgstPaise: 0, igstPaise: 0 };

export function valueOf(components: LineComponents): number {
  return (
    components.taxablePaise + components.cgstPaise + components.sgstPaise + components.igstPaise
  );
}

function add(first: LineComponents, second: LineComponents, sign: 1 | -1): LineComponents {
  return {
    taxablePaise: first.taxablePaise + sign * second.taxablePaise,
    cgstPaise: first.cgstPaise + sign * second.cgstPaise,
    sgstPaise: first.sgstPaise + sign * second.sgstPaise,
    igstPaise: first.igstPaise + sign * second.igstPaise,
  };
}

function componentsOf(line: LineComponents): LineComponents {
  return {
    taxablePaise: line.taxablePaise,
    cgstPaise: line.cgstPaise,
    sgstPaise: line.sgstPaise,
    igstPaise: line.igstPaise,
  };
}

function refusal(
  reason: ArithmeticRefusalReason,
  details: Record<string, unknown> | null = null,
): ArithmeticRefusal {
  return { ok: false, reason, details };
}

// The tax engine's half-up line tax at the line's frozen price and tax facts.
export function lineTaxOf(
  line: TaxLineInput,
  quantity: number,
  placeOfSupply: PlaceOfSupply,
): LineComponents {
  const [taxed] = computeBillTax([{ ...line, quantity }], placeOfSupply).lines;
  return componentsOf(taxed!);
}

// The Bill's own tax split: IGST on any line means inter-state, CGST means intra-state. A Bill
// with no tax on any line (all exempt) falls back to its Route stamp against the seller's state.
export function billPlaceOfSupply(items: LineComponents[], fallback: PlaceOfSupply): PlaceOfSupply {
  if (items.some((item) => item.igstPaise > 0)) return "inter_state";
  if (items.some((item) => item.cgstPaise > 0 || item.sgstPaise > 0)) return "intra_state";
  return fallback;
}

// A Note line as stored, in the shape a line's standing moves by. A Commercial Credit Note keeps
// only its tax-inclusive value, so its tax share is derived (the line's exact remaining tax when
// it credits the whole remaining qty, else the tax engine on its qty) and its taxable value is the
// rest, so the value always matches what was posted.
function noteLineComponents(
  kind: NoteKind,
  noteLine: ArithmeticNoteLine,
  base: ArithmeticLine | undefined,
  state: { qty: number; components: LineComponents },
  placeOfSupply: PlaceOfSupply,
): LineComponents {
  if (kind !== "commercial_credit_note") {
    return {
      taxablePaise: noteLine.amountPaise,
      cgstPaise: noteLine.cgstPaise,
      sgstPaise: noteLine.sgstPaise,
      igstPaise: noteLine.igstPaise,
    };
  }
  const tax =
    noteLine.quantity === state.qty || !base
      ? state.components
      : lineTaxOf(base, noteLine.quantity, placeOfSupply);
  const cgstPaise = Math.min(tax.cgstPaise, state.components.cgstPaise);
  const sgstPaise = Math.min(tax.sgstPaise, state.components.sgstPaise);
  const igstPaise = Math.min(tax.igstPaise, state.components.igstPaise);
  return {
    taxablePaise: noteLine.amountPaise - cgstPaise - sgstPaise - igstPaise,
    cgstPaise,
    sgstPaise,
    igstPaise,
  };
}

// Per line: live qty, remaining uncredited qty and paise, and the Bill's net Ledger effect. Line
// ids are stable across versions, so Note lines from every version add up on one line.
export function billStanding(input: {
  firstItems: ArithmeticLine[];
  currentItems: ArithmeticLine[];
  notes: ArithmeticNote[];
  billDebitPaise: number;
  placeOfSupply: PlaceOfSupply;
}): BillStanding {
  const baseById = new Map(input.firstItems.map((item) => [item.id, item]));
  const state = new Map(
    input.firstItems.map((item) => [
      item.id,
      { qty: item.quantity, components: componentsOf(item) },
    ]),
  );
  let netLedgerPaise = input.billDebitPaise;
  for (const note of input.notes) {
    const sign = note.kind === "debit_note" ? 1 : -1;
    netLedgerPaise += sign * note.amountPaise;
    for (const noteLine of note.lines) {
      const lineState = state.get(noteLine.snapshotLineId) ?? { qty: 0, components: ZERO };
      const moved = noteLineComponents(
        note.kind,
        noteLine,
        baseById.get(noteLine.snapshotLineId),
        lineState,
        input.placeOfSupply,
      );
      state.set(noteLine.snapshotLineId, {
        qty: lineState.qty + sign * noteLine.quantity,
        components: add(lineState.components, moved, sign),
      });
    }
  }
  const currentQtyById = new Map(input.currentItems.map((item) => [item.id, item.quantity]));
  return {
    lines: input.firstItems.map((item) => {
      const lineState = state.get(item.id)!;
      const currentQty = currentQtyById.get(item.id) ?? 0;
      return {
        lineId: item.id,
        currentQty,
        remainingQty: lineState.qty,
        creditedQty: Math.max(0, currentQty - lineState.qty),
        remaining: lineState.components,
        remainingValuePaise: valueOf(lineState.components),
      };
    }),
    netLedgerPaise,
    hasNotes: input.notes.length > 0,
  };
}

function draftOf(kind: NoteKind, lines: NoteLineDraft[], amountPaise?: number): NoteDraft {
  const sum = (pick: (line: NoteLineDraft) => number) =>
    lines.reduce((total, line) => total + pick(line), 0);
  return {
    kind,
    amountPaise:
      amountPaise ??
      sum((line) => line.amountPaise + line.cgstPaise + line.sgstPaise + line.igstPaise),
    cgstPaise: sum((line) => line.cgstPaise),
    sgstPaise: sum((line) => line.sgstPaise),
    igstPaise: sum((line) => line.igstPaise),
    lines,
  };
}

// A Note line from components: GST kinds keep the split, a Commercial Credit Note keeps the
// tax-inclusive value with no tax.
function noteLineOf(
  kind: NoteKind,
  lineId: string,
  quantity: number,
  components: LineComponents,
): NoteLineDraft {
  if (kind === "commercial_credit_note") {
    return {
      lineId,
      quantity,
      amountPaise: valueOf(components),
      cgstPaise: 0,
      sgstPaise: 0,
      igstPaise: 0,
    };
  }
  return { lineId, quantity, amountPaise: components.taxablePaise, ...omitTaxable(components) };
}

function omitTaxable(components: LineComponents) {
  return {
    cgstPaise: components.cgstPaise,
    sgstPaise: components.sgstPaise,
    igstPaise: components.igstPaise,
  };
}

export type CorrectClassification = "debit_note" | "credit_note" | "debit_and_credit_notes";

export interface CorrectedLine extends ArithmeticLine {
  previousQty: number;
  removed: boolean;
}

export interface CorrectPlan {
  ok: true;
  classification: CorrectClassification;
  // Every live line with its new qty and paise; removed lines keep their old paise.
  lines: CorrectedLine[];
  // Totals of the surviving lines.
  tax: BillTax<ArithmeticLine>;
  debitNote: NoteDraft | null;
  creditNote: NoteDraft | null;
  // New total − old total.
  netDifferencePaise: number;
}

// Correct: new qty per live line (0 removes it) at the frozen price and tax facts. Raised lines go
// on one Debit Note, lowered or removed lines on one Credit Note, each with the exact change in
// line paise. The rupee round-off change rides on the header of the Note whose direction matches
// it, so Debit Notes − Credit Notes of this Correct always equal the change in the Bill total.
export function planCorrect(input: {
  currentItems: ArithmeticLine[];
  standing: BillStanding;
  newQuantities: Map<string, number>;
  placeOfSupply: PlaceOfSupply;
  creditNoteKind: CreditNoteKind;
  oldTotalPaise: number;
}): CorrectPlan | ArithmeticRefusal {
  const liveIds = new Set(input.currentItems.map((item) => item.id));
  const unknownLineIds = [...input.newQuantities.keys()].filter((id) => !liveIds.has(id));
  if (unknownLineIds.length > 0) return refusal("unknown_line", { lineIds: unknownLineIds });

  const standingById = new Map(input.standing.lines.map((line) => [line.lineId, line]));
  const asked = input.currentItems.map((item) => ({
    item,
    quantity: input.newQuantities.get(item.id) ?? item.quantity,
  }));
  const qtyChanged = asked.some(({ item, quantity }) => quantity !== item.quantity);
  if (!qtyChanged) return refusal("nothing_changed");
  if (asked.every(({ quantity }) => quantity === 0)) return refusal("all_lines_zero");

  const belowCredited = asked
    .map(({ item, quantity }) => {
      const remainingQty = standingById.get(item.id)?.remainingQty ?? 0;
      const floorQty = Math.max(0, item.quantity - remainingQty);
      return { lineId: item.id, quantity, floorQty };
    })
    .filter((line) => line.quantity < line.floorQty);
  if (belowCredited.length > 0) return refusal("below_credited_qty", { lines: belowCredited });

  const surviving = asked.filter(({ quantity }) => quantity > 0);
  const tax = computeBillTax(
    surviving.map(({ item, quantity }) => ({ ...item, quantity })),
    input.placeOfSupply,
  );
  const taxedById = new Map(tax.lines.map((line) => [line.id, line]));

  const debitLines: NoteLineDraft[] = [];
  const creditLines: NoteLineDraft[] = [];
  const lines: CorrectedLine[] = asked.map(({ item, quantity }) => {
    const taxed = taxedById.get(item.id);
    const newComponents = taxed ? componentsOf(taxed) : ZERO;
    if (quantity > item.quantity) {
      debitLines.push(
        noteLineOf(
          "debit_note",
          item.id,
          quantity - item.quantity,
          add(newComponents, componentsOf(item), -1),
        ),
      );
    } else if (quantity < item.quantity) {
      creditLines.push(
        noteLineOf(
          input.creditNoteKind,
          item.id,
          item.quantity - quantity,
          add(componentsOf(item), newComponents, -1),
        ),
      );
    }
    return {
      ...item,
      ...(taxed ? newComponents : {}),
      quantity,
      previousQty: item.quantity,
      removed: quantity === 0,
    };
  });

  const netDifferencePaise = tax.totalPaise - input.oldTotalPaise;
  let debitNote = debitLines.length > 0 ? draftOf("debit_note", debitLines) : null;
  let creditNote = creditLines.length > 0 ? draftOf(input.creditNoteKind, creditLines) : null;
  const lineNet = (debitNote?.amountPaise ?? 0) - (creditNote?.amountPaise ?? 0);
  const roundOffChange = netDifferencePaise - lineNet;
  if (roundOffChange > 0) {
    if (debitNote)
      debitNote = { ...debitNote, amountPaise: debitNote.amountPaise + roundOffChange };
    else if (creditNote)
      creditNote = { ...creditNote, amountPaise: creditNote.amountPaise - roundOffChange };
  } else if (roundOffChange < 0) {
    if (creditNote)
      creditNote = { ...creditNote, amountPaise: creditNote.amountPaise - roundOffChange };
    else if (debitNote)
      debitNote = { ...debitNote, amountPaise: debitNote.amountPaise + roundOffChange };
  }
  // A qty change always needs a Note; none (a ₹0.00 price) would change the Bill for nothing.
  if (
    (!debitNote && !creditNote) ||
    (debitNote && debitNote.amountPaise <= 0) ||
    (creditNote && creditNote.amountPaise <= 0)
  ) {
    return refusal("note_amount_zero");
  }

  const classification: CorrectClassification =
    debitNote && creditNote ? "debit_and_credit_notes" : debitNote ? "debit_note" : "credit_note";
  return { ok: true, classification, lines, tax, debitNote, creditNote, netDifferencePaise };
}

// An independent Note on chosen live lines and qty. Debit Note lines are the tax engine on the
// qty (no cap). Credit Note qty is capped at the line's remaining uncredited qty, and crediting
// all of it uses the line's exact remaining paise. Header = sum of lines.
export function planRaisedNote(input: {
  kind: NoteKind;
  picks: Array<{ lineId: string; quantity: number }>;
  currentItems: ArithmeticLine[];
  standing: BillStanding;
  placeOfSupply: PlaceOfSupply;
}): { ok: true; note: NoteDraft } | ArithmeticRefusal {
  if (input.picks.length === 0) return refusal("no_lines");
  const itemById = new Map(input.currentItems.map((item) => [item.id, item]));
  const unknownLineIds = input.picks
    .map((pick) => pick.lineId)
    .filter((lineId) => !itemById.has(lineId));
  if (unknownLineIds.length > 0) return refusal("unknown_line", { lineIds: unknownLineIds });

  const standingById = new Map(input.standing.lines.map((line) => [line.lineId, line]));
  if (input.kind !== "debit_note") {
    const tooMuch = input.picks
      .map((pick) => ({
        lineId: pick.lineId,
        quantity: pick.quantity,
        remainingQty: standingById.get(pick.lineId)?.remainingQty ?? 0,
      }))
      .filter((pick) => pick.quantity > pick.remainingQty);
    if (tooMuch.length > 0) return refusal("credit_qty_above_remaining", { lines: tooMuch });
  }

  const lines = input.picks.map((pick) => {
    const item = itemById.get(pick.lineId)!;
    const standing = standingById.get(pick.lineId);
    const exact =
      input.kind !== "debit_note" && standing && pick.quantity === standing.remainingQty;
    const components = exact
      ? standing.remaining
      : lineTaxOf(item, pick.quantity, input.placeOfSupply);
    return noteLineOf(input.kind, pick.lineId, pick.quantity, components);
  });
  if (input.kind === "debit_note") return { ok: true, note: draftOf(input.kind, lines) };

  // ADR-0002 #23: Credit Notes never credit more than the Bill's remaining value. Crediting all
  // that is left takes the remaining net (round-off included), as Cancel does; otherwise the
  // header is the line sum capped at the remaining net.
  const pickedQty = new Map(input.picks.map((pick) => [pick.lineId, pick.quantity]));
  const creditsEverything = input.standing.lines
    .filter((line) => line.remainingQty > 0)
    .every((line) => pickedQty.get(line.lineId) === line.remainingQty);
  const lineSum = draftOf(input.kind, lines).amountPaise;
  const amountPaise = creditsEverything
    ? input.standing.netLedgerPaise
    : Math.min(lineSum, input.standing.netLedgerPaise);
  if (amountPaise <= 0) {
    return refusal("note_amount_zero", { netLedgerPaise: input.standing.netLedgerPaise });
  }
  return { ok: true, note: draftOf(input.kind, lines, amountPaise) };
}

// Cancel: one Credit Note with each line's remaining uncredited qty at its exact remaining paise,
// whose header is the Bill's remaining net Ledger effect, so the Bill nets to zero.
export function planCancelNote(input: {
  kind: CreditNoteKind;
  standing: BillStanding;
}): { ok: true; note: NoteDraft } | ArithmeticRefusal {
  if (input.standing.netLedgerPaise <= 0) {
    return refusal("nothing_to_cancel", { netLedgerPaise: input.standing.netLedgerPaise });
  }
  const lines = input.standing.lines
    .filter((line) => line.remainingQty > 0)
    .map((line) => noteLineOf(input.kind, line.lineId, line.remainingQty, line.remaining));
  // Every line credited but a residual left in the net (only possible on Notes written before
  // Credit Notes were capped): refused rather than writing a statutory Note with no lines.
  if (lines.length === 0) {
    return refusal("nothing_to_cancel", { netLedgerPaise: input.standing.netLedgerPaise });
  }
  return { ok: true, note: draftOf(input.kind, lines, input.standing.netLedgerPaise) };
}

export interface GstSummaryRow {
  gstRateBps: number;
  exempt: boolean;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  taxPaise: number;
}

// The Bill paper's GST summary: one row per rate (exempt apart), lowest rate first.
export function gstSummaryOf(
  items: Array<LineComponents & { gstRateBps: number; exempt: boolean }>,
): GstSummaryRow[] {
  const rows = new Map<string, GstSummaryRow>();
  for (const item of items) {
    const key = `${item.exempt}:${item.gstRateBps}`;
    const row = rows.get(key) ?? {
      gstRateBps: item.gstRateBps,
      exempt: item.exempt,
      taxablePaise: 0,
      cgstPaise: 0,
      sgstPaise: 0,
      igstPaise: 0,
      taxPaise: 0,
    };
    row.taxablePaise += item.taxablePaise;
    row.cgstPaise += item.cgstPaise;
    row.sgstPaise += item.sgstPaise;
    row.igstPaise += item.igstPaise;
    row.taxPaise += item.cgstPaise + item.sgstPaise + item.igstPaise;
    rows.set(key, row);
  }
  return [...rows.values()].sort(
    (first, second) =>
      Number(second.exempt) - Number(first.exempt) || first.gstRateBps - second.gstRateBps,
  );
}
