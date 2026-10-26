// @jsxRuntime automatic
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import QRCode from "qrcode";
import type { ReactElement } from "react";

import { BillOfSupplyPaper, TaxInvoicePaper } from "./layouts/bill";
import { CommercialCreditNotePaper, GstNotePaper } from "./layouts/note";
import { PaymentReceiptPaper } from "./layouts/receipt";
import type { LayoutName, LayoutValues, TaxInvoiceValues } from "./types";

type PaperElement = ReactElement<DocumentProps>;

async function taxInvoicePaper(values: TaxInvoiceValues): Promise<PaperElement> {
  if (values.draft && values.irn) throw new Error("A draft Tax Invoice cannot carry an IRN");
  // Drawn from the signed QR text; an uploaded QR image is never used.
  const qrDataUrl = values.irn
    ? await QRCode.toDataURL(values.irn.signedQrText, { errorCorrectionLevel: "M", margin: 1 })
    : null;
  return <TaxInvoicePaper values={values} qrDataUrl={qrDataUrl} />;
}

async function paperFor<L extends LayoutName>(
  layout: L,
  values: LayoutValues[L],
): Promise<PaperElement> {
  // Each branch narrows `values` through the layout name it was called with.
  const typed = { layout, values } as {
    [K in LayoutName]: { layout: K; values: LayoutValues[K] };
  }[LayoutName];
  switch (typed.layout) {
    case "tax_invoice":
      return taxInvoicePaper(typed.values);
    case "bill_of_supply":
      return <BillOfSupplyPaper values={typed.values} />;
    case "gst_credit_note":
      return <GstNotePaper values={typed.values} kind="credit" />;
    case "debit_note":
      return <GstNotePaper values={typed.values} kind="debit" />;
    case "commercial_credit_note":
      return <CommercialCreditNotePaper values={typed.values} />;
    case "payment_receipt":
      return <PaymentReceiptPaper values={typed.values} />;
  }
}

// Draws one Document from its fixed layout. Values only: no database, no storage, no clock.
// Callers in CommonJS code load this entry with `await import("@repo/pdf/render")`: react-pdf is
// ESM-only, and the automatic JSX runtime pragma on each layout keeps JSX working whichever
// tsconfig the runner picks up.
export async function renderDocument<L extends LayoutName>(
  layout: L,
  values: LayoutValues[L],
): Promise<Buffer> {
  return renderToBuffer(await paperFor(layout, values));
}
