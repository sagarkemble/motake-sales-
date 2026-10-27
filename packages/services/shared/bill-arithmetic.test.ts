import { describe, expect, it } from "vitest";

import {
  billPlaceOfSupply,
  billStanding,
  gstSummaryOf,
  lineTaxOf,
  planCancelNote,
  planCorrect,
  planRaisedNote,
  valueOf,
  type ArithmeticLine,
  type ArithmeticNote,
  type BillStanding,
  type CorrectPlan,
  type NoteDraft,
} from "./bill-arithmetic";
import { computeBillTax, type PlaceOfSupply, type TaxLineInput } from "./tax-engine";

const intra: PlaceOfSupply = "intra_state";

function line(id: string, facts: TaxLineInput, placeOfSupply = intra): ArithmeticLine {
  return { id, ...facts, ...lineTaxOf(facts, facts.quantity, placeOfSupply) };
}

// 3 × ₹24.99 at 5% intra: taxable 7,497, CGST 187, SGST 187 (value 7,871).
const milk = (quantity = 3) =>
  line("milk", { quantity, routePricePaise: 2_499, exempt: false, gstRateBps: 500 });
// 1 × ₹40.00 exempt.
const curd = (quantity = 1) =>
  line("curd", { quantity, routePricePaise: 4_000, exempt: true, gstRateBps: 0 });

function totalOf(items: ArithmeticLine[]): number {
  return computeBillTax(items, intra).totalPaise;
}

function standingOf(items: ArithmeticLine[], notes: ArithmeticNote[] = []): BillStanding {
  return billStanding({
    firstItems: items,
    currentItems: items,
    notes,
    billDebitPaise: totalOf(items),
    placeOfSupply: intra,
  });
}

function asNote(draft: NoteDraft): ArithmeticNote {
  return {
    kind: draft.kind,
    amountPaise: draft.amountPaise,
    lines: draft.lines.map((noteLine) => ({ ...noteLine, snapshotLineId: noteLine.lineId })),
  };
}

function correct(
  items: ArithmeticLine[],
  newQuantities: Record<string, number>,
  options: { notes?: ArithmeticNote[]; buyerChanged?: boolean; commercial?: boolean } = {},
) {
  return planCorrect({
    currentItems: items,
    standing: standingOf(items, options.notes),
    newQuantities: new Map(Object.entries(newQuantities)),
    buyerChanged: options.buyerChanged ?? false,
    placeOfSupply: intra,
    creditNoteKind: options.commercial ? "commercial_credit_note" : "gst_credit_note",
    oldTotalPaise: totalOf(items),
  });
}

function planned(result: ReturnType<typeof correct>): CorrectPlan {
  if (!result.ok) throw new Error(`Refused: ${result.reason}`);
  return result;
}

describe("billStanding", () => {
  it("starts every line at its first-version qty and paise, net = the Bill debit", () => {
    const standing = standingOf([milk(), curd()]);
    expect(standing.netLedgerPaise).toBe(11_900);
    expect(standing.hasNotes).toBe(false);
    expect(standing.lines).toEqual([
      {
        lineId: "milk",
        currentQty: 3,
        remainingQty: 3,
        creditedQty: 0,
        remaining: { taxablePaise: 7_497, cgstPaise: 187, sgstPaise: 187, igstPaise: 0 },
        remainingValuePaise: 7_871,
      },
      {
        lineId: "curd",
        currentQty: 1,
        remainingQty: 1,
        creditedQty: 0,
        remaining: { taxablePaise: 4_000, cgstPaise: 0, sgstPaise: 0, igstPaise: 0 },
        remainingValuePaise: 4_000,
      },
    ]);
  });

  it("adds Debit Note qty and takes away Credit Note qty on the same line id, net by headers", () => {
    const notes: ArithmeticNote[] = [
      {
        kind: "gst_credit_note",
        amountPaise: 2_624,
        lines: [
          {
            snapshotLineId: "milk",
            quantity: 1,
            amountPaise: 2_499,
            cgstPaise: 62,
            sgstPaise: 62,
            igstPaise: 0,
          },
        ],
      },
      {
        kind: "debit_note",
        amountPaise: 4_000,
        lines: [
          {
            snapshotLineId: "curd",
            quantity: 1,
            amountPaise: 4_000,
            cgstPaise: 0,
            sgstPaise: 0,
            igstPaise: 0,
          },
        ],
      },
    ];
    const standing = standingOf([milk(), curd()], notes);
    expect(standing.netLedgerPaise).toBe(11_900 - 2_624 + 4_000);
    expect(standing.lines[0]).toMatchObject({ remainingQty: 2, creditedQty: 1 });
    expect(standing.lines[0]!.remaining).toEqual({
      taxablePaise: 4_998,
      cgstPaise: 125,
      sgstPaise: 125,
      igstPaise: 0,
    });
    // A Debit Note lifts remaining above the live qty; nothing is credited.
    expect(standing.lines[1]).toMatchObject({ remainingQty: 2, creditedQty: 0 });
  });

  it("keeps a Commercial Credit Note's value exact when deriving its tax share", () => {
    const notes: ArithmeticNote[] = [
      {
        kind: "commercial_credit_note",
        amountPaise: 2_624,
        lines: [
          {
            snapshotLineId: "milk",
            quantity: 1,
            amountPaise: 2_624,
            cgstPaise: 0,
            sgstPaise: 0,
            igstPaise: 0,
          },
        ],
      },
    ];
    const [milkStanding] = standingOf([milk()], notes).lines;
    expect(milkStanding).toMatchObject({ remainingQty: 2, remainingValuePaise: 7_871 - 2_624 });
  });
});

describe("planCorrect", () => {
  it("is text-only when only the buyer text changed", () => {
    const plan = planned(correct([milk(), curd()], {}, { buyerChanged: true }));
    expect(plan).toMatchObject({
      classification: "text_only",
      debitNote: null,
      creditNote: null,
      netDifferencePaise: 0,
    });
  });

  it.each([
    ["nothing changed", {}, "nothing_changed"],
    ["the same qty sent back", { milk: 3 }, "nothing_changed"],
    ["every line 0", { milk: 0, curd: 0 }, "all_lines_zero"],
    ["a line not on the Bill", { ghost: 1 }, "unknown_line"],
  ] as const)("refuses %s", (_label, quantities, reason) => {
    expect(correct([milk(), curd()], quantities)).toMatchObject({ ok: false, reason });
  });

  it("raises a Debit Note with the line's exact change and the round-off on its header", () => {
    const items = [milk(), curd()];
    const plan = planned(correct(items, { milk: 5 }));
    // 5 milk: taxable 12,495, tax 312 + 312; delta 4,998 + 125 + 125 = 5,248 of line paise.
    // Total 11,871 → 11,900 becomes 17,119 → 17,100: round-off moves from +29 to −19.
    expect(plan.classification).toBe("debit_note");
    expect(plan.creditNote).toBeNull();
    expect(plan.debitNote).toEqual({
      kind: "debit_note",
      amountPaise: 5_200,
      cgstPaise: 125,
      sgstPaise: 125,
      igstPaise: 0,
      lines: [
        {
          lineId: "milk",
          quantity: 2,
          amountPaise: 4_998,
          cgstPaise: 125,
          sgstPaise: 125,
          igstPaise: 0,
        },
      ],
    });
    expect(plan.netDifferencePaise).toBe(17_100 - 11_900);
    expect(plan.tax.totalPaise).toBe(17_100);
  });

  it("lowers through a GST Credit Note before the deadline and a Commercial one after", () => {
    const items = [milk(), curd()];
    const gst = planned(correct(items, { milk: 1 }));
    expect(gst.classification).toBe("credit_note");
    expect(gst.creditNote).toMatchObject({
      kind: "gst_credit_note",
      cgstPaise: 125,
      sgstPaise: 125,
      lines: [{ lineId: "milk", quantity: 2, amountPaise: 4_998, cgstPaise: 125, sgstPaise: 125 }],
    });

    const commercial = planned(correct(items, { milk: 1 }, { commercial: true }));
    expect(commercial.creditNote).toMatchObject({
      kind: "commercial_credit_note",
      cgstPaise: 0,
      sgstPaise: 0,
      igstPaise: 0,
      lines: [{ lineId: "milk", quantity: 2, amountPaise: 5_248, cgstPaise: 0, sgstPaise: 0 }],
    });
    // Same header either way: it carries the Bill total change.
    expect(commercial.creditNote!.amountPaise).toBe(gst.creditNote!.amountPaise);
    expect(-commercial.netDifferencePaise).toBe(commercial.creditNote!.amountPaise);
  });

  it("writes both Notes when one line goes up and another down, and removes a 0 line", () => {
    const plan = planned(correct([milk(), curd()], { milk: 4, curd: 0 }));
    expect(plan.classification).toBe("debit_and_credit_notes");
    expect(plan.lines.find((corrected) => corrected.id === "curd")).toMatchObject({
      removed: true,
      quantity: 0,
      previousQty: 1,
    });
    expect(plan.creditNote!.lines).toEqual([
      { lineId: "curd", quantity: 1, amountPaise: 4_000, cgstPaise: 0, sgstPaise: 0, igstPaise: 0 },
    ]);
    // Debit Notes − Credit Notes of this Correct = the change in the Bill total.
    expect(plan.debitNote!.amountPaise - plan.creditNote!.amountPaise).toBe(
      plan.netDifferencePaise,
    );
  });

  it("never lowers a line below what independent Credit Notes already credited", () => {
    const items = [milk(), curd()];
    const credited = planRaisedNote({
      kind: "gst_credit_note",
      picks: [{ lineId: "milk", quantity: 2 }],
      currentItems: items,
      standing: standingOf(items),
      placeOfSupply: intra,
    });
    if (!credited.ok) throw new Error("expected a Note");
    const notes = [asNote(credited.note)];

    expect(correct(items, { milk: 1 }, { notes })).toMatchObject({
      ok: false,
      reason: "below_credited_qty",
      details: { lines: [{ lineId: "milk", quantity: 1, floorQty: 2 }] },
    });
    expect(correct(items, { milk: 2 }, { notes })).toMatchObject({ ok: true });
  });

  it("refuses a Note that would be ₹0.00 once the rupee round-off is applied", () => {
    // 1,000 × 10 paise exempt = ₹100.00; 1,001 is ₹100.10, still ₹100.00 after round-off.
    const tiny = line("tiny", {
      quantity: 1_000,
      routePricePaise: 10,
      exempt: true,
      gstRateBps: 0,
    });
    expect(correct([tiny], { tiny: 1_001 })).toMatchObject({
      ok: false,
      reason: "note_amount_zero",
    });
  });
});

describe("planRaisedNote", () => {
  const items = [milk(), curd()];

  it("prices Credit Note lines with the tax engine and refuses qty above remaining", () => {
    const standing = standingOf(items);
    const partial = planRaisedNote({
      kind: "gst_credit_note",
      picks: [{ lineId: "milk", quantity: 1 }],
      currentItems: items,
      standing,
      placeOfSupply: intra,
    });
    expect(partial).toMatchObject({
      ok: true,
      note: {
        amountPaise: 2_499 + 62 + 62,
        lines: [{ lineId: "milk", quantity: 1, amountPaise: 2_499, cgstPaise: 62, sgstPaise: 62 }],
      },
    });
    expect(
      planRaisedNote({
        kind: "gst_credit_note",
        picks: [{ lineId: "milk", quantity: 4 }],
        currentItems: items,
        standing,
        placeOfSupply: intra,
      }),
    ).toMatchObject({ ok: false, reason: "credit_qty_above_remaining" });
  });

  it("credits the exact remaining paise with the last qty", () => {
    const first = planRaisedNote({
      kind: "gst_credit_note",
      picks: [{ lineId: "milk", quantity: 1 }],
      currentItems: items,
      standing: standingOf(items),
      placeOfSupply: intra,
    });
    if (!first.ok) throw new Error("expected a Note");
    const second = planRaisedNote({
      kind: "gst_credit_note",
      picks: [{ lineId: "milk", quantity: 2 }],
      currentItems: items,
      standing: standingOf(items, [asNote(first.note)]),
      placeOfSupply: intra,
    });
    if (!second.ok) throw new Error("expected a Note");
    // 7,871 of milk value in all: 2,623 then the exact 5,248 left.
    expect(
      valueOf({ ...second.note.lines[0]!, taxablePaise: second.note.lines[0]!.amountPaise }),
    ).toBe(7_871 - 2_623);
    expect(second.note.lines[0]).toMatchObject({ cgstPaise: 125, sgstPaise: 125 });
  });

  it("puts no cap on a Debit Note and no tax on a Commercial Credit Note", () => {
    const standing = standingOf(items);
    expect(
      planRaisedNote({
        kind: "debit_note",
        picks: [{ lineId: "curd", quantity: 9 }],
        currentItems: items,
        standing,
        placeOfSupply: intra,
      }),
    ).toMatchObject({ ok: true, note: { kind: "debit_note", amountPaise: 36_000 } });
    expect(
      planRaisedNote({
        kind: "commercial_credit_note",
        picks: [{ lineId: "milk", quantity: 1 }],
        currentItems: items,
        standing,
        placeOfSupply: intra,
      }),
    ).toMatchObject({
      ok: true,
      note: {
        amountPaise: 2_623,
        cgstPaise: 0,
        lines: [{ quantity: 1, amountPaise: 2_623, cgstPaise: 0, sgstPaise: 0, igstPaise: 0 }],
      },
    });
  });

  it("refuses no lines and a line not on the Bill", () => {
    const standing = standingOf(items);
    expect(
      planRaisedNote({
        kind: "debit_note",
        picks: [],
        currentItems: items,
        standing,
        placeOfSupply: intra,
      }),
    ).toMatchObject({ ok: false, reason: "no_lines" });
    expect(
      planRaisedNote({
        kind: "debit_note",
        picks: [{ lineId: "ghost", quantity: 1 }],
        currentItems: items,
        standing,
        placeOfSupply: intra,
      }),
    ).toMatchObject({ ok: false, reason: "unknown_line" });
  });
});

describe("planCancelNote", () => {
  const items = [milk(), curd()];

  it("credits each line's remaining paise and nets the Bill to zero, round-off on the header", () => {
    const plan = planCancelNote({ kind: "gst_credit_note", standing: standingOf(items) });
    expect(plan).toMatchObject({
      ok: true,
      note: {
        amountPaise: 11_900,
        cgstPaise: 187,
        sgstPaise: 187,
        lines: [
          { lineId: "milk", quantity: 3, amountPaise: 7_497, cgstPaise: 187, sgstPaise: 187 },
          { lineId: "curd", quantity: 1, amountPaise: 4_000 },
        ],
      },
    });
  });

  it("credits only what is left after earlier Notes, and refuses when nothing is", () => {
    const raised = planRaisedNote({
      kind: "gst_credit_note",
      picks: [{ lineId: "curd", quantity: 1 }],
      currentItems: items,
      standing: standingOf(items),
      placeOfSupply: intra,
    });
    if (!raised.ok) throw new Error("expected a Note");
    const afterNote = standingOf(items, [asNote(raised.note)]);
    const plan = planCancelNote({ kind: "commercial_credit_note", standing: afterNote });
    expect(plan).toMatchObject({
      ok: true,
      note: {
        kind: "commercial_credit_note",
        amountPaise: 7_900,
        lines: [{ lineId: "milk", quantity: 3, amountPaise: 7_871, cgstPaise: 0 }],
      },
    });
    if (!plan.ok) return;
    expect(
      planCancelNote({
        kind: "gst_credit_note",
        standing: standingOf(items, [asNote(raised.note), asNote(plan.note)]),
      }),
    ).toMatchObject({ ok: false, reason: "nothing_to_cancel" });
  });
});

describe("billPlaceOfSupply and gstSummaryOf", () => {
  it("reads the split off the Bill's own lines, falling back for an all-exempt Bill", () => {
    const inter = line(
      "milk",
      { quantity: 3, routePricePaise: 2_499, exempt: false, gstRateBps: 500 },
      "inter_state",
    );
    expect(billPlaceOfSupply([inter], "intra_state")).toBe("inter_state");
    expect(billPlaceOfSupply([milk()], "inter_state")).toBe("intra_state");
    expect(billPlaceOfSupply([curd()], "inter_state")).toBe("inter_state");
  });

  it("sums one row per rate, exempt first", () => {
    expect(gstSummaryOf([milk(), curd(), milk(1)])).toEqual([
      {
        gstRateBps: 0,
        exempt: true,
        taxablePaise: 4_000,
        cgstPaise: 0,
        sgstPaise: 0,
        igstPaise: 0,
        taxPaise: 0,
      },
      {
        gstRateBps: 500,
        exempt: false,
        taxablePaise: 9_996,
        cgstPaise: 249,
        sgstPaise: 249,
        igstPaise: 0,
        taxPaise: 498,
      },
    ]);
  });
});

describe("Credit Notes never credit more than the Bill (ADR-0002 #23)", () => {
  // ₹21.02 + ₹21.02 + ₹0.01, all exempt: gross ₹42.05 rounds down to ₹42.00.
  const a = line("a", { quantity: 1, routePricePaise: 2_102, exempt: true, gstRateBps: 0 });
  const b = line("b", { quantity: 1, routePricePaise: 2_102, exempt: true, gstRateBps: 0 });
  const c = line("c", { quantity: 1, routePricePaise: 1, exempt: true, gstRateBps: 0 });
  const items = [a, b, c];
  const raise = (picks: string[], notes: ArithmeticNote[] = []) =>
    planRaisedNote({
      kind: "gst_credit_note",
      picks: picks.map((lineId) => ({ lineId, quantity: 1 })),
      currentItems: items,
      standing: standingOf(items, notes),
      placeOfSupply: intra,
    });

  it("crediting everything left takes the remaining net, round-off included", () => {
    expect(standingOf(items).netLedgerPaise).toBe(4_200);
    expect(raise(["a", "b", "c"])).toMatchObject({ ok: true, note: { amountPaise: 4_200 } });
  });

  it("caps a partial Credit Note at the remaining net, then refuses a ₹0.00 one", () => {
    const first = raise(["a"]);
    if (!first.ok) throw new Error("expected a Note");
    expect(first.note.amountPaise).toBe(2_102);
    const second = raise(["b"], [asNote(first.note)]);
    if (!second.ok) throw new Error("expected a Note");
    // Lines sum to ₹21.02 but only ₹20.98 is left.
    expect(second.note.amountPaise).toBe(2_098);
    expect(second.note.lines[0]!.amountPaise).toBe(2_102);
    const notes = [asNote(first.note), asNote(second.note)];
    expect(standingOf(items, notes).netLedgerPaise).toBe(0);
    expect(raise(["c"], notes)).toMatchObject({ ok: false, reason: "note_amount_zero" });
    expect(
      planCancelNote({ kind: "gst_credit_note", standing: standingOf(items, notes) }),
    ).toMatchObject({
      ok: false,
      reason: "nothing_to_cancel",
    });
  });
});

describe("planCancelNote never writes a Credit Note with no lines", () => {
  it("refuses when every line is credited but a round-off residual is left (Notes from before the cap)", () => {
    const items = [milk(), curd()];
    // An uncapped credit of every line at its line sum (₹118.71) on a ₹119.00 Bill leaves ₹0.29.
    const legacy: ArithmeticNote = {
      kind: "gst_credit_note",
      amountPaise: 11_871,
      lines: [
        {
          snapshotLineId: "milk",
          quantity: 3,
          amountPaise: 7_497,
          cgstPaise: 187,
          sgstPaise: 187,
          igstPaise: 0,
        },
        {
          snapshotLineId: "curd",
          quantity: 1,
          amountPaise: 4_000,
          cgstPaise: 0,
          sgstPaise: 0,
          igstPaise: 0,
        },
      ],
    };
    const standing = standingOf(items, [legacy]);
    expect(standing.netLedgerPaise).toBe(29);
    expect(planCancelNote({ kind: "gst_credit_note", standing })).toEqual({
      ok: false,
      reason: "nothing_to_cancel",
      details: { netLedgerPaise: 29 },
    });
  });
});
