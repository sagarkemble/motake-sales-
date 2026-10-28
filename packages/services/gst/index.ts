import { db } from "@repo/database";
import {
  getBillById,
  getLatestBillVersion,
  listBillItemsByBillId,
  lockBillRow,
  type BillLetterhead,
  type BillLineStamp,
} from "@repo/database/queries/bills";
import {
  countBillsInMonth,
  countIrnPendingBills,
  getBillGstFacts,
  getGstr1FilingByMonth,
  getOtherBillByIrn,
  insertGstr1Filing,
  listGstr1Filings,
  listIrnPendingBills,
  lockFilingMonth,
  lockGstr1FilingRow,
  setBillIrn,
  setBillPortalCancelAck,
  updateGstr1Filing,
  type BillGstFacts,
} from "@repo/database/queries/gst";
import { businessDateOf } from "@repo/database/queries/shared/business-date";
import { runInTransaction, type DbExecutor } from "@repo/database/queries/shared/executor";
import { violatedUniqueConstraint } from "@repo/database/queries/shared/pg-errors";
import type { SelectBill, SelectGstr1Filing } from "@repo/database/schema";
import { draftBillFileName } from "@repo/pdf";

import AdminBillService from "../admin-bills";
import DocumentService from "../documents";
import {
  badRequest,
  checkoutRefusal,
  conflict,
  documentRefused,
  internalError,
  ledgerRefusal,
  notFound,
} from "../errors";
import { changedFields, oldNewPayload, recordAudit } from "../shared/audit";
import {
  noAdminBillListener,
  notifyAdminBillOutcome,
  type AdminBillListener,
} from "../shared/bill-events";
import {
  noGstListener,
  notifyGstOutcome,
  type GstListener,
  type GstOutcome,
} from "../shared/gst-events";
import {
  gstDecisionOf,
  gstGatesOf,
  irnStatusOf,
  monthLabelOf,
  periodMonthOf,
  readBillGstFacts,
} from "../shared/gst-gates";
import { INDIAN_STATES } from "../shared/indian-states";
import {
  billIdInputSchema,
  correctGstr1FilingInputSchema,
  correctIrnInputSchema,
  enterIrnInputSchema,
  listIrnPendingInputSchema,
  previewGstr1FilingInputSchema,
  recordGstr1FilingInputSchema,
  recordPortalCancellationInputSchema,
  type BillGstState,
  type BillIdInput,
  type CorrectGstr1FilingInput,
  type CorrectIrnInput,
  type DraftPdf,
  type EnterIrnInput,
  type Gstr1FilingListRow,
  type Gstr1FilingPreview,
  type IrnPendingPage,
  type IrnResult,
  type ListIrnPendingInput,
  type PortalCancellationResult,
  type PortalItem,
  type PortalJsonDraft,
  type PreviewGstr1FilingInput,
  type RecordGstr1FilingInput,
  type RecordGstr1FilingResult,
  type RecordPortalCancellationInput,
} from "./model";

const filingMonthConstraint = "gstr1_filings_period_month_unique";
const billIrnConstraint = "bills_irn_unique";

const irnAuditedFields = [
  "irn",
  "irnAckNumber",
  "irnAckDate",
  "signedQrText",
  "signedQrImageKey",
] as const;

// Unit codes need a CA pick (PAC vs NOS); the draft says OTH and lists it for the portal.
const PORTAL_UNIT_PLACEHOLDER = "OTH";

const COMPLETE_ON_PORTAL = [
  "SellerDtls.Loc",
  "SellerDtls.Pin",
  "BuyerDtls.Loc",
  "BuyerDtls.Pin",
  "ItemList[].Unit",
];

interface DecodedImage {
  contentType: "image/png" | "image/jpeg";
  bytes: Uint8Array<ArrayBuffer>;
}

type IrnFields = Pick<SelectBill, (typeof irnAuditedFields)[number]>;

// A transaction's result plus what it tells Spec J after commit; a replay tells nothing.
type IrnRun = { result: IrnResult; outcome: GstOutcome } | { replay: IrnResult };

function alreadyFiled(month: string) {
  return conflict(`GSTR-1 for ${monthLabelOf(`${month}-01`)} is already filed — Correct it.`);
}

function irnTaken(irn: string, otherBillNumber: string | undefined) {
  return conflict(
    `IRN ${irn} is already recorded on Bill ${otherBillNumber ?? "another Bill"}. One IRN belongs to one Bill.`,
  );
}

// Money leaves the app as rupees with two decimals only at this export boundary.
function rupees(paise: number): number {
  return paise / 100;
}

// `2026-10-25` → `25/10/2026`.
function portalDate(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
}

function stateCodeOf(stateName: string): string {
  const state = INDIAN_STATES.find((candidate) => candidate.name === stateName);
  if (!state) throw internalError(`${stateName} is not in the list of Indian states`);
  return state.gstStateCode;
}

function decodeImage(image: { contentType: "image/png" | "image/jpeg"; base64: string }) {
  return {
    contentType: image.contentType,
    bytes: Uint8Array.from(Buffer.from(image.base64, "base64")),
  } satisfies DecodedImage;
}

function irnResultOf(bill: SelectBill | BillGstFacts): IrnResult {
  if (
    !bill.irn ||
    !bill.irnAckNumber ||
    !bill.irnAckDate ||
    !bill.signedQrText ||
    !bill.irnRecordedAt ||
    !bill.irnRecordedBy
  ) {
    throw internalError(`Bill ${bill.number} has an incomplete IRN`);
  }
  return {
    billId: bill.id,
    irn: bill.irn,
    ackNumber: bill.irnAckNumber,
    ackDate: bill.irnAckDate,
    signedQrText: bill.signedQrText,
    hasSignedQrImage: bill.signedQrImageKey !== null,
    irnRecordedAt: bill.irnRecordedAt,
    irnRecordedBy: bill.irnRecordedBy,
    irnCorrectReason: bill.irnCorrectReason,
  };
}

// GSTR-1 month lock and IRN capture (Spec I). Admin only (checked at the router); every write
// takes the actor and runs in one transaction. Lock order on a Bill: the bills row, the shared
// month lock, then (portal cancellation) Spec G's Cancel core. Record filing takes the exclusive
// month lock. Nothing is stamped on a Bill: Filed month is derived from gstr1_filings + bill_date.
class GstService {
  private readonly adminBillService = new AdminBillService();

  // Spec L's documents for the signed QR image and the Draft PDF; Spec J's IRN listener; Spec G's
  // listener for the Bill cancelled outcome of a portal cancellation.
  public constructor(
    private readonly documentService: DocumentService = new DocumentService(),
    private readonly afterCommit: GstListener = noGstListener,
    private readonly adminBillListener: AdminBillListener = noAdminBillListener,
  ) {}

  // --- GSTR-1 filing.

  public async listGstr1Filings(): Promise<Gstr1FilingListRow[]> {
    return listGstr1Filings();
  }

  // Shown in the confirm step before the first lock of a month.
  public async previewGstr1Filing(input: PreviewGstr1FilingInput): Promise<Gstr1FilingPreview> {
    const parsedInput = previewGstr1FilingInputSchema.parse(input);
    const periodMonth = `${parsedInput.month}-01`;
    this.assertMonthStarted(periodMonth, businessDateOf(new Date()));
    const [filing, counts] = await Promise.all([
      getGstr1FilingByMonth(periodMonth),
      countBillsInMonth(periodMonth),
    ]);
    return { month: parsedInput.month, alreadyFiled: Boolean(filing), ...counts };
  }

  // One filing per month; the current month is allowed, a future one is not. IRN pending Bills in
  // the month are a warning in the result, never a refusal.
  public async recordGstr1Filing(
    actorProfileId: string,
    input: RecordGstr1FilingInput,
  ): Promise<RecordGstr1FilingResult> {
    const parsedInput = recordGstr1FilingInputSchema.parse(input);
    const periodMonth = `${parsedInput.month}-01`;
    const today = businessDateOf(new Date());
    this.assertMonthStarted(periodMonth, today);
    this.assertFiledOn(parsedInput.filedOn, periodMonth, today);
    const notes = parsedInput.notes || null;
    try {
      return await runInTransaction(async (transaction) => {
        await lockFilingMonth(periodMonth, "exclusive", transaction);
        if (await getGstr1FilingByMonth(periodMonth, transaction)) {
          throw alreadyFiled(parsedInput.month);
        }
        const filing = await insertGstr1Filing(
          {
            periodMonth,
            filedOn: parsedInput.filedOn,
            reference: parsedInput.reference,
            notes,
            filerId: actorProfileId,
          },
          transaction,
        );
        await recordAudit(
          {
            actorId: actorProfileId,
            action: "filed",
            entityType: "gstr1_filing",
            entityId: filing.id,
            customerId: null,
            payload: {
              month: parsedInput.month,
              filedOn: filing.filedOn,
              reference: filing.reference,
              notes: filing.notes,
            },
          },
          transaction,
        );
        const { irnPendingInMonth } = await countBillsInMonth(periodMonth, transaction);
        return { filing, irnPendingInMonth };
      });
    } catch (recordError) {
      if (violatedUniqueConstraint(recordError) === filingMonthConstraint) {
        throw alreadyFiled(parsedInput.month);
      }
      throw recordError;
    }
  }

  // Fixes the filing date, reference and notes with a reason. Never the month or the filer, and
  // never unlocks the month. There is no delete.
  public async correctGstr1Filing(
    actorProfileId: string,
    input: CorrectGstr1FilingInput,
  ): Promise<SelectGstr1Filing> {
    const parsedInput = correctGstr1FilingInputSchema.parse(input);
    return runInTransaction(async (transaction) => {
      const before = await lockGstr1FilingRow(parsedInput.filingId, transaction);
      if (!before) throw notFound(`GSTR-1 filing ${parsedInput.filingId} not found`);
      this.assertFiledOn(parsedInput.filedOn, before.periodMonth, businessDateOf(new Date()));
      const after = {
        ...before,
        filedOn: parsedInput.filedOn,
        reference: parsedInput.reference,
        notes: parsedInput.notes === undefined ? before.notes : parsedInput.notes || null,
      };
      const changes = changedFields(before, after, ["filedOn", "reference", "notes"]);
      if (Object.keys(changes).length === 0) {
        throw badRequest("Nothing changed. Change the filing date, reference or notes.");
      }
      const updated = await updateGstr1Filing(
        before.id,
        { filedOn: after.filedOn, reference: after.reference, notes: after.notes },
        transaction,
      );
      await recordAudit(
        {
          actorId: actorProfileId,
          action: "corrected",
          entityType: "gstr1_filing",
          entityId: before.id,
          customerId: null,
          reason: parsedInput.reason,
          payload: oldNewPayload(changes),
        },
        transaction,
      );
      return updated;
    });
  }

  // --- Month lock and gates.

  public async isMonthFiled(billDate: string, executor: DbExecutor = db): Promise<boolean> {
    return Boolean(await getGstr1FilingByMonth(periodMonthOf(billDate), executor));
  }

  // The Bill paper's GST block: IRN status and fields and which GST and Correct/Cancel actions
  // apply, each refused one with its reason. The write paths check the same rule.
  public async getBillGstState(
    input: BillIdInput,
    executor: DbExecutor = db,
  ): Promise<BillGstState> {
    const parsedInput = billIdInputSchema.parse(input);
    const facts = await getBillGstFacts(parsedInput.billId, executor);
    if (!facts) throw notFound(`Bill ${parsedInput.billId} not found`);
    return {
      billId: facts.id,
      billNumber: facts.number,
      month: facts.billDate.slice(0, 7),
      filedMonth: facts.filedMonth,
      irnRecorded: facts.irn !== null,
      cancelled: facts.cancelled,
      einvoicingApplies: facts.einvoicingApplies,
      irnPending: facts.irnPending,
      irnStatus: irnStatusOf(facts),
      irn: facts.irn
        ? {
            irn: facts.irn,
            ackNumber: facts.irnAckNumber,
            ackDate: facts.irnAckDate,
            signedQrText: facts.signedQrText,
            hasSignedQrImage: facts.signedQrImageKey !== null,
            recordedAt: facts.irnRecordedAt,
            recordedByName: facts.irnRecordedByName,
            correctReason: facts.irnCorrectReason,
          }
        : null,
      portalCancellation: facts.portalCancelAckNumber
        ? {
            ackNumber: facts.portalCancelAckNumber,
            ackDate: facts.portalCancelAckDate,
            notes: facts.portalCancelNotes,
          }
        : null,
      ...gstGatesOf(facts),
    };
  }

  // --- IRN pending.

  public async listIrnPending(input: ListIrnPendingInput = {}): Promise<IrnPendingPage> {
    return listIrnPendingBills(listIrnPendingInputSchema.parse(input));
  }

  public async countIrnPending(): Promise<number> {
    return countIrnPendingBills();
  }

  // --- Enter IRN and Correct IRN.

  // Makes an IRN pending Bill a final Tax Invoice. First writer wins; an identical retry returns
  // the stored result and tells nothing. Allowed in a Filed month.
  public async enterIrn(actorProfileId: string, input: EnterIrnInput): Promise<IrnResult> {
    const parsedInput = enterIrnInputSchema.parse(input);
    const image = parsedInput.signedQrImage && decodeImage(parsedInput.signedQrImage);
    let run: IrnRun;
    try {
      run = await runInTransaction(async (transaction): Promise<IrnRun> => {
        const bill = await this.lockBill(parsedInput.billId, transaction);
        const facts = await this.requireFacts(bill.id, transaction);
        if (
          facts.irn === parsedInput.irn &&
          facts.irnAckNumber === parsedInput.ackNumber &&
          facts.irnAckDate === parsedInput.ackDate &&
          facts.signedQrText === parsedInput.signedQrText
        ) {
          return { replay: irnResultOf(facts) };
        }
        this.assertGate(facts, "enterIrn");
        await this.assertIrnUnused(parsedInput.irn, bill.id, transaction);
        const irnRecordedAt = new Date();
        const updated = await setBillIrn(
          bill.id,
          {
            irn: parsedInput.irn,
            irnAckNumber: parsedInput.ackNumber,
            irnAckDate: parsedInput.ackDate,
            signedQrText: parsedInput.signedQrText,
            signedQrImageKey: await this.storeImage(bill.id, irnRecordedAt, image),
            irnRecordedAt,
            irnRecordedBy: actorProfileId,
            irnCorrectReason: null,
          },
          transaction,
        );
        const customerId = this.customerOf(facts);
        await recordAudit(
          {
            actorId: actorProfileId,
            action: "irn_recorded",
            entityType: "bill",
            entityId: bill.id,
            customerId,
            payload: {
              irn: updated.irn,
              irnAckNumber: updated.irnAckNumber,
              irnAckDate: updated.irnAckDate,
              signedQrText: updated.signedQrText,
              signedQrImageKey: updated.signedQrImageKey,
            },
          },
          transaction,
        );
        return {
          result: irnResultOf(updated),
          outcome: {
            kind: "irn_recorded",
            billId: bill.id,
            billNumber: bill.number,
            customerId,
            versionNumber: await this.latestVersionNumber(bill.id, transaction),
            irnRecordedAt,
          },
        };
      });
    } catch (enterError) {
      return this.rethrowIrnTaken(enterError, parsedInput.irn, parsedInput.billId);
    }
    if ("replay" in run) return run.replay;
    await notifyGstOutcome(this.afterCommit, run.outcome);
    return run.result;
  }

  // Overwrites the IRN fields with a reason; never unlocks line Correct or Cancel. Allowed in a
  // Filed month. A given image gets a new key; none clears the key. Old objects stay.
  public async correctIrn(actorProfileId: string, input: CorrectIrnInput): Promise<IrnResult> {
    const parsedInput = correctIrnInputSchema.parse(input);
    const image = parsedInput.signedQrImage && decodeImage(parsedInput.signedQrImage);
    let run: IrnRun;
    try {
      run = await runInTransaction(async (transaction): Promise<IrnRun> => {
        const bill = await this.lockBill(parsedInput.billId, transaction);
        const facts = await this.requireFacts(bill.id, transaction);
        this.assertGate(facts, "correctIrn");
        const textChanged = changedFields(
          bill,
          {
            ...bill,
            irn: parsedInput.irn,
            irnAckNumber: parsedInput.ackNumber,
            irnAckDate: parsedInput.ackDate,
            signedQrText: parsedInput.signedQrText,
          },
          irnAuditedFields,
        );
        if (Object.keys(textChanged).length === 0 && !image && bill.signedQrImageKey === null) {
          throw badRequest("Nothing changed. Change an IRN field or the signed QR image.");
        }
        await this.assertIrnUnused(parsedInput.irn, bill.id, transaction);
        const irnRecordedAt = new Date();
        const updated = await setBillIrn(
          bill.id,
          {
            irn: parsedInput.irn,
            irnAckNumber: parsedInput.ackNumber,
            irnAckDate: parsedInput.ackDate,
            signedQrText: parsedInput.signedQrText,
            signedQrImageKey: await this.storeImage(bill.id, irnRecordedAt, image),
            irnRecordedAt,
            irnRecordedBy: actorProfileId,
            irnCorrectReason: parsedInput.reason,
          },
          transaction,
        );
        const customerId = this.customerOf(facts);
        await recordAudit(
          {
            actorId: actorProfileId,
            action: "irn_recorded",
            entityType: "bill",
            entityId: bill.id,
            customerId,
            reason: parsedInput.reason,
            payload: oldNewPayload(changedFields<IrnFields>(bill, updated, irnAuditedFields)),
          },
          transaction,
        );
        return {
          result: irnResultOf(updated),
          outcome: {
            kind: "irn_corrected",
            billId: bill.id,
            billNumber: bill.number,
            customerId,
            versionNumber: await this.latestVersionNumber(bill.id, transaction),
            irnRecordedAt,
            reason: parsedInput.reason,
          },
        };
      });
    } catch (correctError) {
      return this.rethrowIrnTaken(correctError, parsedInput.irn, parsedInput.billId);
    }
    if ("replay" in run) return run.replay;
    await notifyGstOutcome(this.afterCommit, run.outcome);
    return run.result;
  }

  // --- Portal cancellation.

  // The Admin already cancelled this IRN Bill on the portal: writes the ack, then runs Spec G's
  // Cancel core in the same transaction (Credit Note, Payments kept, number kept, stock back only
  // to an active GatePass). A Cancel refusal rolls the ack back. The government window is not
  // checked.
  public async recordPortalCancellation(
    actorProfileId: string,
    input: RecordPortalCancellationInput,
  ): Promise<PortalCancellationResult> {
    const parsedInput = recordPortalCancellationInputSchema.parse(input);
    if (parsedInput.ackDate > businessDateOf(new Date())) {
      throw badRequest("The cancellation ack date cannot be in the future.");
    }
    const run = await runInTransaction(async (transaction) => {
      const bill = await this.lockBill(parsedInput.billId, transaction);
      const facts = await readBillGstFacts(bill.id, bill.billDate, transaction);
      this.assertGate(facts, "portalCancel");
      await setBillPortalCancelAck(
        bill.id,
        {
          portalCancelAckNumber: parsedInput.ackNumber,
          portalCancelAckDate: parsedInput.ackDate,
          portalCancelNotes: parsedInput.notes || null,
        },
        transaction,
      );
      await recordAudit(
        {
          actorId: actorProfileId,
          action: "portal_cancelled",
          entityType: "bill",
          entityId: bill.id,
          customerId: this.customerOf(facts),
          reason: parsedInput.reason,
          payload: {
            portalCancelAckNumber: parsedInput.ackNumber,
            portalCancelAckDate: parsedInput.ackDate,
            portalCancelNotes: parsedInput.notes || null,
          },
        },
        transaction,
      );
      return this.adminBillService.cancelBillInTransaction(
        actorProfileId,
        { billId: bill.id, reason: parsedInput.reason, action: "portal_cancel" },
        transaction,
      );
    });
    await notifyAdminBillOutcome(this.adminBillListener, run.outcome);
    return run.result;
  }

  // --- Drafts (never stored, only while IRN pending).

  public async assertDraftAllowed(billId: string, executor: DbExecutor = db): Promise<void> {
    const facts = await getBillGstFacts(billId, executor);
    if (!facts) throw notFound(`Bill ${billId} not found`);
    const decision = gstDecisionOf(facts, "draft");
    if (!decision.allowed) throw documentRefused("irn_not_pending", decision.message);
  }

  // The e-invoice portal JSON (INV-01) from the current Bill, with a Motake draft marker.
  public async buildPortalJsonDraft(input: BillIdInput): Promise<PortalJsonDraft> {
    const { billId } = billIdInputSchema.parse(input);
    await this.assertDraftAllowed(billId);
    const [bill, items, latest] = await Promise.all([
      getBillById(billId),
      listBillItemsByBillId(billId),
      getLatestBillVersion(billId),
    ]);
    if (!bill || !latest) throw internalError(`Bill ${billId} has no version`);
    const { seller, buyer, route } = bill.letterhead as BillLetterhead;
    const buyerStateCode = buyer.gstin
      ? buyer.gstin.slice(0, 2)
      : stateCodeOf(route.delivery_state);
    const itemList = items.map(
      (item, index): PortalItem => ({
        SlNo: String(index + 1),
        PrdDesc: (item.stamp as BillLineStamp).name,
        IsServc: "N",
        HsnCd: (item.stamp as BillLineStamp).hsn,
        Qty: item.quantity,
        Unit: PORTAL_UNIT_PLACEHOLDER,
        UnitPrice: rupees(item.routePricePaise),
        TotAmt: rupees(item.taxablePaise),
        AssAmt: rupees(item.taxablePaise),
        GstRt: item.gstRateBps / 100,
        CgstAmt: rupees(item.cgstPaise),
        SgstAmt: rupees(item.sgstPaise),
        IgstAmt: rupees(item.igstPaise),
        TotItemVal: rupees(item.taxablePaise + item.cgstPaise + item.sgstPaise + item.igstPaise),
      }),
    );
    return {
      filename: draftBillFileName(bill.number).replace(/\.pdf$/, ".json"),
      document: {
        MotakeDraft: {
          status: "DRAFT-IRN-PENDING",
          note: "Motake draft for the e-invoice portal. Not a submitted invoice; no IRN yet.",
          billId: bill.id,
          versionNumber: latest.versionNumber,
          completeOnPortal: buyer.gstin
            ? COMPLETE_ON_PORTAL
            : [...COMPLETE_ON_PORTAL, "BuyerDtls.Gstin"],
        },
        Version: "1.1",
        TranDtls: { TaxSch: "GST", SupTyp: "B2B", RegRev: "N", IgstOnIntra: "N" },
        DocDtls: { Typ: "INV", No: bill.number, Dt: portalDate(bill.billDate) },
        SellerDtls: {
          Gstin: seller.gstin,
          LglNm: seller.legal_name,
          Addr1: seller.address,
          Loc: "",
          Pin: null,
          Stcd: seller.gstin.slice(0, 2),
        },
        BuyerDtls: {
          Gstin: buyer.gstin ?? "",
          LglNm: buyer.shop_name,
          Pos: buyerStateCode,
          Addr1: buyer.address,
          Loc: "",
          Pin: null,
          Stcd: buyerStateCode,
          Ph: buyer.phone,
        },
        ItemList: itemList,
        ValDtls: {
          AssVal: rupees(bill.taxablePaise),
          CgstVal: rupees(bill.cgstPaise),
          SgstVal: rupees(bill.sgstPaise),
          IgstVal: rupees(bill.igstPaise),
          RndOffAmt: rupees(bill.roundOffPaise),
          TotInvVal: rupees(bill.totalPaise),
        },
      },
    };
  }

  // Spec L draws it; marked "Draft — IRN pending", never stored as a pdf_key, never sent.
  public async drawDraftPdf(input: BillIdInput): Promise<DraftPdf> {
    const { billId } = billIdInputSchema.parse(input);
    await this.assertDraftAllowed(billId);
    const draft = await this.documentService.drawDraftBill(billId);
    return {
      filename: draft.filename,
      contentType: "application/pdf",
      base64: Buffer.from(draft.bytes).toString("base64"),
    };
  }

  // --- Internals.

  private assertMonthStarted(periodMonth: string, today: string): void {
    if (periodMonth > periodMonthOf(today)) {
      throw badRequest(
        `${monthLabelOf(periodMonth)} has not started yet. A future month cannot be filed.`,
      );
    }
  }

  private assertFiledOn(filedOn: string, periodMonth: string, today: string): void {
    if (filedOn < periodMonth) {
      throw badRequest(
        `The filing date cannot be before ${monthLabelOf(periodMonth)} starts (${periodMonth}).`,
      );
    }
    if (filedOn > today) throw badRequest("The filing date cannot be after today.");
  }

  private async lockBill(billId: string, transaction: DbExecutor): Promise<SelectBill> {
    const bill = await lockBillRow(billId, transaction);
    if (!bill) throw notFound(`Bill ${billId} not found`);
    return bill;
  }

  private async requireFacts(billId: string, executor: DbExecutor): Promise<BillGstFacts> {
    const facts = await getBillGstFacts(billId, executor);
    if (!facts) throw notFound(`Bill ${billId} not found`);
    return facts;
  }

  // Refused like Spec G's gate: bill_cancelled, or bill_locked with the gate's lockReason. A
  // deactivated Customer is refused as Spec G refuses it (checkout's customer_inactive).
  private assertGate(
    facts: BillGstFacts,
    action: "enterIrn" | "correctIrn" | "portalCancel",
  ): void {
    const decision = gstDecisionOf(facts, action);
    if (decision.allowed) return;
    if (decision.reason === "bill_cancelled") {
      throw ledgerRefusal("bill_cancelled", decision.message);
    }
    if (decision.reason === "customer_inactive") {
      throw checkoutRefusal("customer_inactive", decision.message, {
        customerId: this.customerOf(facts),
      });
    }
    throw ledgerRefusal("bill_locked", decision.message, { lockReason: decision.reason });
  }

  private customerOf(facts: BillGstFacts): string {
    if (!facts.customerId) throw internalError(`Bill ${facts.number} has no Customer`);
    return facts.customerId;
  }

  private async assertIrnUnused(irn: string, billId: string, executor: DbExecutor) {
    const other = await getOtherBillByIrn(irn, billId, executor);
    if (other) throw irnTaken(irn, other.number);
  }

  // A concurrent writer took the IRN after this call's check: the unique constraint refuses it.
  private async rethrowIrnTaken(error: unknown, irn: string, billId: string): Promise<never> {
    if (violatedUniqueConstraint(error) === billIrnConstraint) {
      const other = await getOtherBillByIrn(irn, billId);
      throw irnTaken(irn, other?.number);
    }
    throw error;
  }

  // Stored last, after every other check, under the irn_recorded_at this call writes. A failed
  // put rolls the call back; an object left by a later rollback is never referenced.
  private async storeImage(
    billId: string,
    irnRecordedAt: Date,
    image: DecodedImage | undefined,
  ): Promise<string | null> {
    if (!image) return null;
    const { key } = await this.documentService.putSignedQrImage({
      billId,
      irnRecordedAt,
      contentType: image.contentType,
      bytes: image.bytes,
    });
    return key;
  }

  private async latestVersionNumber(billId: string, executor: DbExecutor): Promise<number> {
    const latest = await getLatestBillVersion(billId, executor);
    if (!latest) throw internalError(`Bill ${billId} has no version`);
    return latest.versionNumber;
  }
}

export default GstService;
export { isCalendarDate } from "./model";
export type {
  BillGstState,
  DraftPdf,
  Gstr1FilingListRow,
  Gstr1FilingPreview,
  IrnPendingPage,
  IrnResult,
  PortalCancellationResult,
  PortalJsonDraft,
  RecordGstr1FilingResult,
};
