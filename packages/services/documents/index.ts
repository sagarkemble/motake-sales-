import { getProfileById } from "@repo/database/queries/auth";
import { getCustomerById, getCustomerWithRouteById } from "@repo/database/queries/customers";
import {
  getBillDocumentState,
  getBillVersionSnapshot,
  getLatestBillVersionNumber,
  getLatestBillVersionSnapshot,
  getNoteById,
  getPaymentById,
  getPaymentEventById,
  listBillVersionSnapshots,
  listNoteLines,
  replaceBillVersionPdfKey,
  setBillVersionPdfKeyIfUnset,
  setNotePdfKeyIfUnset,
  type BillDocumentState,
  type BillVersionSnapshot,
} from "@repo/database/queries/documents";
import { businessDateOf, businessTimeOf } from "@repo/database/queries/shared/business-date";
import type { SelectNote, SelectNoteLine } from "@repo/database/schema";
import {
  documentFileName,
  draftBillFileName,
  type IrnValues,
  type LayoutName,
  type LayoutValues,
  type PartyBlocks,
  type SellerValues,
  type SupplyType,
} from "@repo/pdf";
import { R2DocumentStore, type DocumentStore } from "@repo/pdf/store";

import { env } from "../env";
import { documentRefused, internalError } from "../errors";
import SettingsService from "../settings";
import { INDIAN_STATES } from "../shared/indian-states";
import {
  billIdSchema,
  billVersionIdSchema,
  downloadLinkTargetSchema,
  drawOptionsSchema,
  drawPaymentReceiptInputSchema,
  noteIdSchema,
  putSignedQrImageInputSchema,
  type DocumentResult,
  type DownloadLink,
  type DownloadLinkTarget,
  type DraftBillResult,
  type DrawOptions,
  type DrawPaymentReceiptInput,
  type PutSignedQrImageInput,
  type SignedQrImageLink,
} from "./model";

const PDF_CONTENT_TYPE = "application/pdf";
const MAX_SIGNED_QR_IMAGE_BYTES = 1024 * 1024;
const SIGNED_QR_IMAGE_TYPES = {
  "image/png": { extension: "png", magic: [0x89, 0x50, 0x4e, 0x47] },
  "image/jpeg": { extension: "jpg", magic: [0xff, 0xd8, 0xff] },
} as const;
type SignedQrImageType = keyof typeof SIGNED_QR_IMAGE_TYPES;

// Deterministic keys: a retried draw overwrites the same object instead of leaving an orphan.
// Enter IRN and Correct IRN each set a new irn_recorded_at, so an IRN-stamped object is never
// overwritten by a later correction.
export const documentKeys = {
  billVersion: (billId: string, versionNumber: number) =>
    `documents/bills/${billId}/v${versionNumber}.pdf`,
  billVersionWithIrn: (billId: string, versionNumber: number, irnRecordedAt: Date) =>
    `documents/bills/${billId}/v${versionNumber}-irn-${irnRecordedAt.getTime()}.pdf`,
  note: (noteId: string) => `documents/notes/${noteId}.pdf`,
  receipt: (paymentId: string, postedPaymentEventId: string) =>
    `documents/receipts/${paymentId}/${postedPaymentEventId}.pdf`,
  signedQrImage: (billId: string, irnRecordedAt: Date, extension: "png" | "jpg") =>
    `documents/bills/${billId}/signed-qr-${irnRecordedAt.getTime()}.${extension}`,
};

const IRN_MISSING_MESSAGE =
  "This Tax Invoice is waiting for its IRN. Use the Draft PDF to check it until the IRN is recorded.";

type PaperFor<L extends LayoutName = LayoutName> = {
  [K in L]: { layout: K; values: LayoutValues[K] };
}[L];

function defaultDocumentStore(): DocumentStore {
  return new R2DocumentStore({
    accountId: env.R2_ACCOUNT_ID,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    bucketName: env.R2_DOCUMENTS_BUCKET_NAME,
  });
}

// react-pdf is ESM-only. @repo/pdf is "type": "module" so the drawing half loads as ESM, and this
// lazy import keeps the CommonJS API booting: a static import makes tsx require react-pdf and fail.
async function draw(paper: PaperFor): Promise<Uint8Array> {
  const { renderDocument } = await import("@repo/pdf/render");
  return renderDocument(paper.layout, paper.values as never);
}

function stateByCode(stateCode: string) {
  const state = INDIAN_STATES.find((candidate) => candidate.gstStateCode === stateCode);
  if (!state) throw internalError(`No Indian state has GST state code ${stateCode}`);
  return { stateName: state.name, stateCode: state.gstStateCode };
}

function stateByName(stateName: string) {
  const state = INDIAN_STATES.find((candidate) => candidate.name === stateName);
  if (!state) throw internalError(`${stateName} is not in the list of Indian states`);
  return { stateName: state.name, stateCode: state.gstStateCode };
}

// The seller stamp has no state: on every layout it comes from the GSTIN's first two digits
// (Settings only accepts a GSTIN whose prefix is the selected state's GST code).
function sellerFromStamp(stamp: {
  legalName: string;
  address: string;
  gstin: string;
}): SellerValues {
  return { ...stamp, ...stateByCode(stamp.gstin.slice(0, 2)) };
}

function partyBlocksOf(version: BillVersionSnapshot, seller: SellerValues): PartyBlocks {
  const { buyer, route } = version.header.letterhead;
  return {
    seller,
    buyer: {
      shopName: buyer.shop_name,
      phone: buyer.phone,
      address: buyer.address,
      gstin: buyer.gstin || null,
    },
    route: { name: route.name, code: route.code },
    placeOfSupply: stateByName(route.delivery_state),
  };
}

// Exactly as the paper was taxed; with no tax at all, the seller and delivery states decide.
function supplyTypeOf(
  tax: { cgstPaise: number; sgstPaise: number; igstPaise: number },
  blocks: PartyBlocks,
): SupplyType {
  if (tax.igstPaise > 0) return "inter_state";
  if (tax.cgstPaise + tax.sgstPaise > 0) return "intra_state";
  return blocks.seller.stateCode === blocks.placeOfSupply.stateCode ? "intra_state" : "inter_state";
}

function sum<T>(rows: T[], pick: (row: T) => number): number {
  return rows.reduce((total, row) => total + pick(row), 0);
}

function irnValuesOf(bill: BillDocumentState): IrnValues | null {
  if (!bill.irn) return null;
  if (!bill.irnAckNumber || !bill.irnAckDate || !bill.signedQrText) {
    throw internalError(`Bill ${bill.number} has an IRN without its ack number, date or signed QR`);
  }
  return {
    irn: bill.irn,
    ackNumber: bill.irnAckNumber,
    ackDate: bill.irnAckDate,
    signedQrText: bill.signedQrText,
  };
}

// Bill values come only from the version snapshot; the IRN block from the live Bill.
function billPaper(
  version: BillVersionSnapshot,
  irn: { draft: true } | { draft: false; irn: IrnValues | null },
): PaperFor<"tax_invoice" | "bill_of_supply"> {
  const { header } = version;
  const seller = sellerFromStamp({
    legalName: header.letterhead.seller.legal_name,
    address: header.letterhead.seller.address,
    gstin: header.letterhead.seller.gstin,
  });
  const blocks = partyBlocksOf(version, seller);
  const billHeader = {
    ...blocks,
    billNumber: header.number,
    billDate: header.billDate,
    versionNumber: version.versionNumber,
  };
  if (header.legalType === "bill_of_supply" && !irn.draft) {
    return {
      layout: "bill_of_supply",
      values: {
        ...billHeader,
        lines: version.items.map((item) => ({
          name: item.stamp.name,
          unit: item.stamp.unit,
          hsn: item.stamp.hsn,
          quantity: item.quantity,
          ratePaise: item.routePricePaise,
          valuePaise: item.taxablePaise,
        })),
        totals: { roundOffPaise: header.roundOffPaise, totalPaise: header.totalPaise },
      },
    };
  }
  return {
    layout: "tax_invoice",
    values: {
      ...billHeader,
      supplyType: supplyTypeOf(header, blocks),
      lines: version.items.map((item) => ({
        name: item.stamp.name,
        unit: item.stamp.unit,
        hsn: item.stamp.hsn,
        quantity: item.quantity,
        ratePaise: item.routePricePaise,
        taxablePaise: item.taxablePaise,
        gstRateBps: item.gstRateBps,
        cgstPaise: item.cgstPaise,
        sgstPaise: item.sgstPaise,
        igstPaise: item.igstPaise,
      })),
      totals: {
        taxablePaise: header.taxablePaise,
        cgstPaise: header.cgstPaise,
        sgstPaise: header.sgstPaise,
        igstPaise: header.igstPaise,
        roundOffPaise: header.roundOffPaise,
        totalPaise: header.totalPaise,
      },
      ...(irn.draft ? { draft: true, irn: null } : { draft: false, irn: irn.irn }),
    },
  };
}

function billLayoutOf(version: BillVersionSnapshot): LayoutName {
  return version.header.legalType === "tax_invoice" ? "tax_invoice" : "bill_of_supply";
}

interface PrintedNoteLine {
  line: SelectNoteLine;
  name: string;
  unit: string;
  hsn: string;
  position: number;
}

// Buyer, Route and place of supply come from the letterhead of the Bill version the Note lines
// point at (notes keep no buyer snapshot); a Note without lines uses the Bill's latest version.
function notePaper(
  note: SelectNote,
  letterheadVersion: BillVersionSnapshot,
  printedLines: PrintedNoteLine[],
): PaperFor<"gst_credit_note" | "commercial_credit_note" | "debit_note"> {
  const seller = sellerFromStamp({
    legalName: note.sellerLegalName,
    address: note.sellerAddress,
    gstin: note.sellerGstin,
  });
  const blocks = partyBlocksOf(letterheadVersion, seller);
  const noteHeader = {
    ...blocks,
    noteNumber: note.number,
    issuedOn: note.issuedOn,
    reason: note.reason,
    returnOrDamageOn: note.returnOrDamageOn,
    originalBill: {
      number: letterheadVersion.header.number,
      date: letterheadVersion.header.billDate,
    },
  };
  const lines = printedLines.map(({ line }) => line);
  if (note.kind === "commercial_credit_note") {
    return {
      layout: "commercial_credit_note",
      values: {
        ...noteHeader,
        lines: printedLines.map((printed) => ({
          name: printed.name,
          unit: printed.unit,
          hsn: printed.hsn,
          quantity: printed.line.quantity,
          amountPaise: printed.line.amountPaise,
        })),
        totals: {
          roundOffPaise: note.amountPaise - sum(lines, (line) => line.amountPaise),
          totalPaise: note.amountPaise,
        },
      },
    };
  }
  const tax = {
    cgstPaise: sum(lines, (line) => line.cgstPaise),
    sgstPaise: sum(lines, (line) => line.sgstPaise),
    igstPaise: sum(lines, (line) => line.igstPaise),
  };
  const taxablePaise = sum(lines, (line) => line.amountPaise);
  return {
    layout: note.kind,
    values: {
      ...noteHeader,
      supplyType: supplyTypeOf(tax, blocks),
      lines: printedLines.map((printed) => ({
        name: printed.name,
        unit: printed.unit,
        hsn: printed.hsn,
        quantity: printed.line.quantity,
        taxablePaise: printed.line.amountPaise,
        cgstPaise: printed.line.cgstPaise,
        sgstPaise: printed.line.sgstPaise,
        igstPaise: printed.line.igstPaise,
      })),
      totals: {
        taxablePaise,
        ...tax,
        roundOffPaise:
          note.amountPaise - taxablePaise - tax.cgstPaise - tax.sgstPaise - tax.igstPaise,
        totalPaise: note.amountPaise,
      },
    },
  };
}

function signedQrImageTypeOf(contentType: string, bytes: Uint8Array): SignedQrImageType | null {
  if (!(contentType in SIGNED_QR_IMAGE_TYPES)) return null;
  const type = contentType as SignedQrImageType;
  const { magic } = SIGNED_QR_IMAGE_TYPES[type];
  return magic.every((byte, index) => bytes[index] === byte) ? type : null;
}

// Draws, stores and records every Document; the only writer of bill_versions.pdf_key and
// notes.pdf_key. Runs after the domain transaction commits: a draw failure throws to the caller
// and never undoes a sale. Every draw is safe to retry and lands on the same key.
class DocumentService {
  private readonly settingsService = new SettingsService();

  // Tests pass an in-memory store; the API uses the private documents bucket.
  public constructor(private readonly store: DocumentStore = defaultDocumentStore()) {}

  // Spec J after Book Now, fulfil, Raise Bill, Correct and Enter IRN. A set key is returned as is.
  public async ensureBillVersionDocument(
    billVersionId: string,
    options: DrawOptions = {},
  ): Promise<DocumentResult> {
    const version = await getBillVersionSnapshot(billVersionIdSchema.parse(billVersionId));
    if (!version) throw documentRefused("not_found", `Bill version ${billVersionId} not found`);
    const filename = documentFileName(billLayoutOf(version), version.header.number);
    if (version.pdfKey) return this.toResult(version.pdfKey, filename, options);

    const bill = await this.requireBill(version.billId);
    if (version.header.legalType === "tax_invoice" && !bill.irn) {
      if (await this.einvoicingRequired(bill))
        throw documentRefused("irn_missing", IRN_MISSING_MESSAGE);
    }
    // An IRN belongs to the latest version only: line Correct is refused after IRN.
    const isLatest = version.versionNumber === (await getLatestBillVersionNumber(version.billId));
    const irn = isLatest ? irnValuesOf(bill) : null;
    const key =
      irn && bill.irnRecordedAt
        ? documentKeys.billVersionWithIrn(bill.id, version.versionNumber, bill.irnRecordedAt)
        : documentKeys.billVersion(bill.id, version.versionNumber);

    const bytes = await draw(billPaper(version, { draft: false, irn }));
    await this.store.put(key, bytes, PDF_CONTENT_TYPE);
    const storedKey = await setBillVersionPdfKeyIfUnset(version.id, key);
    if (!storedKey) throw internalError(`Bill version ${version.id} lost its PDF key`);
    return this.toResult(storedKey, filename, options, storedKey === key ? bytes : undefined);
  }

  // Spec I after Correct IRN commits: the one path that replaces a set key. The old object stays.
  public async replaceBillDocumentAfterIrnCorrect(
    billId: string,
    options: DrawOptions = {},
  ): Promise<DocumentResult> {
    const bill = await this.requireBill(billIdSchema.parse(billId));
    const irn = irnValuesOf(bill);
    if (!irn || !bill.irnRecordedAt) {
      throw documentRefused("irn_not_recorded", `Bill ${bill.number} has no IRN recorded`);
    }
    const latest = await this.requireLatestVersion(bill.id);
    const filename = documentFileName(billLayoutOf(latest), latest.header.number);
    const key = documentKeys.billVersionWithIrn(bill.id, latest.versionNumber, bill.irnRecordedAt);
    if (latest.pdfKey === key) return this.toResult(key, filename, options);

    const bytes = await draw(billPaper(latest, { draft: false, irn }));
    await this.store.put(key, bytes, PDF_CONTENT_TYPE);
    await replaceBillVersionPdfKey(latest.id, key);
    return this.toResult(key, filename, options, bytes);
  }

  // Spec J for the statutory Note message; Admin download for every Note kind.
  public async ensureNoteDocument(
    noteId: string,
    options: DrawOptions = {},
  ): Promise<DocumentResult> {
    const note = await getNoteById(noteIdSchema.parse(noteId));
    if (!note) throw documentRefused("not_found", `Note ${noteId} not found`);
    const filename = documentFileName(note.kind, note.number);
    if (note.pdfKey) return this.toResult(note.pdfKey, filename, options);

    const lines = await listNoteLines(note.id);
    const versions = await listBillVersionSnapshots([
      ...new Set(lines.map((line) => line.billVersionId)),
    ]);
    const letterheadVersion =
      versions.find((version) => version.id === lines[0]?.billVersionId) ??
      (await this.requireLatestVersion(note.billId));
    const printedLines = lines
      .map((line) => {
        const version = versions.find((candidate) => candidate.id === line.billVersionId);
        const position = version?.items.findIndex((item) => item.id === line.snapshotLineId) ?? -1;
        const item = version?.items[position];
        if (!item) {
          throw internalError(
            `Note ${note.number} points at a missing Bill line ${line.snapshotLineId}`,
          );
        }
        return { line, ...item.stamp, position };
      })
      .sort((first, second) => first.position - second.position);

    const key = documentKeys.note(note.id);
    const bytes = await draw(notePaper(note, letterheadVersion, printedLines));
    await this.store.put(key, bytes, PDF_CONTENT_TYPE);
    const storedKey = await setNotePdfKeyIfUnset(note.id, key);
    if (!storedKey) throw internalError(`Note ${note.id} lost its PDF key`);
    return this.toResult(storedKey, filename, options, storedKey === key ? bytes : undefined);
  }

  // Spec J for the Receipt. Writes no column: the key lives on the notification. The seller is
  // the Seller master at the first draw (Payments keep no seller snapshot); the stored PDF never
  // changes, so a retry after a Payment Correct or a Settings edit returns the stored object.
  public async drawPaymentReceipt(
    input: DrawPaymentReceiptInput,
    options: DrawOptions = {},
  ): Promise<DocumentResult> {
    const parsedInput = drawPaymentReceiptInputSchema.parse(input);
    const payment = await getPaymentById(parsedInput.paymentId);
    if (!payment) throw documentRefused("not_found", `Payment ${parsedInput.paymentId} not found`);
    const event = await getPaymentEventById(parsedInput.postedPaymentEventId);
    if (!event || event.paymentId !== payment.id || event.kind !== "posted") {
      throw documentRefused(
        "not_posted_event",
        `Payment event ${parsedInput.postedPaymentEventId} is not the posted event of Payment ${payment.number}`,
      );
    }
    if (event.amountKeptPaise === 0) {
      throw documentRefused("nothing_kept", `Payment ${payment.number} kept ₹0; it has no receipt`);
    }
    const key = documentKeys.receipt(payment.id, event.id);
    const filename = documentFileName("payment_receipt", payment.number);
    if (await this.store.exists(key)) return this.toResult(key, filename, options);

    const customer = await getCustomerWithRouteById(payment.customerId);
    if (!customer) throw documentRefused("not_found", `Customer ${payment.customerId} not found`);
    const settings = await this.settingsService.requireSellerSettings();
    const bytes = await draw({
      layout: "payment_receipt",
      values: {
        seller: sellerFromStamp({
          legalName: settings.legalName,
          address: settings.address,
          gstin: settings.gstin,
        }),
        customer: { shopName: customer.shopName, phone: customer.phone },
        route: { name: customer.routeName, code: customer.routeCode },
        receiptNumber: payment.number,
        paidOn: businessDateOf(event.occurredAt),
        paidAtTime: businessTimeOf(event.occurredAt),
        mode: event.mode,
        reference: event.reference,
        receivedPaise: payment.amountReceivedPaise,
        keptPaise: event.amountKeptPaise,
        returnedPaise: payment.amountReturnedPaise,
        balanceAfterPaise: parsedInput.balanceAfterPaise,
      },
    });
    await this.store.put(key, bytes, PDF_CONTENT_TYPE);
    return this.toResult(key, filename, options, bytes);
  }

  // Spec I's Draft PDF download. Bytes only: never stored, never a pdf_key, never sent.
  public async drawDraftBill(billId: string): Promise<DraftBillResult> {
    const bill = await this.requireBill(billIdSchema.parse(billId));
    await this.assertDraftAllowed(bill);
    const latest = await this.requireLatestVersion(bill.id);
    const bytes = await draw(billPaper(latest, { draft: true }));
    return { filename: draftBillFileName(bill.number), bytes };
  }

  // Spec I's Enter IRN and Correct IRN, inside its transaction. A server-side put only; Spec I
  // writes bills.signed_qr_image_key with the returned key.
  public async putSignedQrImage(input: PutSignedQrImageInput): Promise<{ key: string }> {
    const parsedInput = putSignedQrImageInputSchema.parse(input);
    const type = signedQrImageTypeOf(parsedInput.contentType, parsedInput.bytes);
    if (!type || parsedInput.bytes.length > MAX_SIGNED_QR_IMAGE_BYTES) {
      throw documentRefused("bad_image", "The signed QR image must be a PNG or JPEG up to 1 MB");
    }
    const key = documentKeys.signedQrImage(
      parsedInput.billId,
      parsedInput.irnRecordedAt,
      SIGNED_QR_IMAGE_TYPES[type].extension,
    );
    await this.store.put(key, parsedInput.bytes, type);
    return { key };
  }

  // Admin only: a 5-minute inline link to the stored signed QR image.
  public async getSignedQrImageLink(
    actorProfileId: string,
    billId: string,
  ): Promise<SignedQrImageLink> {
    await this.assertAdmin(actorProfileId);
    const bill = await this.requireBill(billIdSchema.parse(billId));
    if (!bill.signedQrImageKey) {
      throw documentRefused("not_found", `Bill ${bill.number} has no signed QR image`);
    }
    const contentType: SignedQrImageType = bill.signedQrImageKey.endsWith(".png")
      ? "image/png"
      : "image/jpeg";
    const { url, expiresAt } = await this.store.signedGetLink(bill.signedQrImageKey, {
      contentType,
    });
    return { url, expiresAt };
  }

  // Admin only: draws a missing PDF first, then a 5-minute attachment link. Old versions and a
  // cancelled Bill's versions print as issued. The browser never sees the key.
  public async getDownloadLink(
    actorProfileId: string,
    target: DownloadLinkTarget,
  ): Promise<DownloadLink> {
    await this.assertAdmin(actorProfileId);
    const parsedTarget = downloadLinkTargetSchema.parse(target);
    const result =
      "billVersionId" in parsedTarget
        ? await this.ensureBillVersionDocument(parsedTarget.billVersionId, { signedUrl: true })
        : await this.ensureNoteDocument(parsedTarget.noteId, { signedUrl: true });
    if (!result.signedUrl || !result.expiresAt) {
      throw internalError(`No signed link was made for ${result.key}`);
    }
    return { url: result.signedUrl, filename: result.filename, expiresAt: result.expiresAt };
  }

  private async toResult(
    key: string,
    filename: string,
    options: DrawOptions,
    drawnBytes?: Uint8Array,
  ): Promise<DocumentResult> {
    const parsedOptions = drawOptionsSchema.parse(options);
    const result: DocumentResult = { key, filename };
    if (parsedOptions.signedUrl) {
      const link = await this.store.signedGetLink(key, {
        contentType: PDF_CONTENT_TYPE,
        downloadFileName: filename,
      });
      result.signedUrl = link.url;
      result.expiresAt = link.expiresAt;
    }
    if (parsedOptions.bytes) result.bytes = drawnBytes ?? (await this.store.get(key)).bytes;
    return result;
  }

  private async requireBill(billId: string): Promise<BillDocumentState> {
    const bill = await getBillDocumentState(billId);
    if (!bill) throw documentRefused("not_found", `Bill ${billId} not found`);
    return bill;
  }

  private async requireLatestVersion(billId: string): Promise<BillVersionSnapshot> {
    const latest = await getLatestBillVersionSnapshot(billId);
    if (!latest) throw internalError(`Bill ${billId} has no version`);
    return latest;
  }

  // Spec I's rule: a Tax Invoice needs an IRN when the seller and its Customer both have
  // E-invoicing required. The seller flag defaults to on while the Seller master is not set up.
  private async einvoicingRequired(bill: BillDocumentState): Promise<boolean> {
    if (bill.legalType !== "tax_invoice" || !bill.customerId) return false;
    const [customer, settings] = await Promise.all([
      getCustomerById(bill.customerId),
      this.settingsService.getSellerSettings(),
    ]);
    return Boolean(customer?.einvoicingRequired) && (settings?.einvoicingRequired ?? true);
  }

  // Stand-in for Spec I's `assertDraftAllowed(billId)` until it lands: the Bill is IRN pending.
  private async assertDraftAllowed(bill: BillDocumentState): Promise<void> {
    const irnPending = !bill.irn && !bill.cancelled && (await this.einvoicingRequired(bill));
    if (!irnPending) {
      throw documentRefused(
        "irn_not_pending",
        `Bill ${bill.number} is not waiting for an IRN; download its PDF instead`,
      );
    }
  }

  private async assertAdmin(actorProfileId: string): Promise<void> {
    const actor = await getProfileById(actorProfileId);
    if (!actor || actor.role !== "admin" || actor.status !== "active") {
      throw documentRefused("forbidden", "Only an Admin can open Documents");
    }
  }
}

export default DocumentService;
export type {
  DocumentResult,
  DownloadLink,
  DownloadLinkTarget,
  DraftBillResult,
  DrawOptions,
  DrawPaymentReceiptInput,
  PutSignedQrImageInput,
  SignedQrImageLink,
};
