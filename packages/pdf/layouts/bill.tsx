// @jsxRuntime automatic
import { Image, Text, View } from "@react-pdf/renderer";

import { DRAFT_MARK, formatDate, formatPaise, formatRateBps } from "../format";
import type {
  BillHeaderValues,
  BillOfSupplyValues,
  IrnValues,
  TaxInvoiceLine,
  TaxInvoiceValues,
} from "../types";
import {
  GstSummary,
  HeaderBox,
  LinesTable,
  PaperDocument,
  PaperPage,
  PartyBox,
  TermsFooter,
  TotalsBox,
  joined,
  stateWithCode,
  styles,
  totalQuantityText,
  type Column,
  type KeyRow,
} from "./parts";

function invoiceRows(values: BillHeaderValues): KeyRow[] {
  const rows: KeyRow[] = [
    ["Invoice No.", values.billNumber],
    ["Dated", formatDate(values.billDate)],
  ];
  if (values.versionNumber > 1) rows.push(["Version", String(values.versionNumber)]);
  rows.push(
    ["Dispatched through", values.salesmanName ? `Salesman: ${values.salesmanName}` : "Office"],
    ["Destination / Route", values.route.name],
  );
  return rows;
}

function BuyerBox({ values }: { values: BillHeaderValues }) {
  const { buyer, placeOfSupply } = values;
  return (
    <PartyBox
      heading="Buyer (Bill to)"
      name={buyer.shopName}
      details={[
        buyer.address,
        `GSTIN/UIN: ${buyer.gstin ?? "Unregistered"}`,
        joined([
          `State Name: ${placeOfSupply.stateName}, Code: ${placeOfSupply.stateCode}`,
          `Mobile: ${buyer.phone}`,
        ]),
      ]}
      rows={[
        ["Place of Supply", stateWithCode(placeOfSupply)],
        ["Route", values.route.name],
        ["Contact", buyer.phone],
        ["Delivery Note Date", formatDate(values.billDate)],
      ]}
    />
  );
}

function lineTotal(line: TaxInvoiceLine): number {
  return line.taxablePaise + line.cgstPaise + line.sgstPaise + line.igstPaise;
}

// The Route price with its GST added, to the paisa; the line Amount stays the exact taxed value.
function rateWithGst(line: TaxInvoiceLine): number {
  return Math.round((line.ratePaise * (10_000 + line.gstRateBps)) / 10_000);
}

const taxInvoiceColumns: Column[] = [
  { header: "Sl.", width: 4, align: "center" },
  { header: "Description of Product", width: 28 },
  { header: "HSN", width: 7 },
  { header: "Rate (Excl. GST)", width: 11, align: "right" },
  { header: "GST %", width: 6, align: "center" },
  { header: "Rate (Incl. GST)", width: 11, align: "right" },
  { header: "Qty", width: 7, align: "right" },
  { header: "Unit", width: 9 },
  { header: "Amount", width: 17, align: "right" },
];

function IrnBlock({ irn, qrDataUrl }: { irn: IrnValues; qrDataUrl: string }) {
  return (
    <View wrap={false} style={styles.box}>
      <View style={styles.cellBlock}>
        <Text style={styles.heading}>E-invoice</Text>
        <Text style={styles.label}>IRN</Text>
        <Text style={[styles.bold, { marginBottom: 3 }]}>{irn.irn}</Text>
        <View style={{ flexDirection: "row" }}>
          <Text style={styles.label}>Ack No.</Text>
          <Text style={[styles.bold, { marginRight: 14 }]}>{irn.ackNumber}</Text>
          <Text style={styles.label}>Ack date</Text>
          <Text style={styles.bold}>{formatDate(irn.ackDate)}</Text>
        </View>
      </View>
      <View style={[{ padding: 6 }, styles.dividerLeft]}>
        <Image src={qrDataUrl} style={{ width: 96, height: 96 }} />
      </View>
    </View>
  );
}

export function TaxInvoicePaper(props: { values: TaxInvoiceValues; qrDataUrl: string | null }) {
  const { values } = props;
  const rows = values.lines.map((line, index) => [
    String(index + 1),
    line.name,
    line.hsn,
    formatPaise(line.ratePaise),
    formatRateBps(line.gstRateBps),
    formatPaise(rateWithGst(line)),
    String(line.quantity),
    line.unit,
    formatPaise(lineTotal(line)),
  ]);
  return (
    <PaperDocument title={`Tax Invoice ${values.billNumber}`} seller={values.seller}>
      <PaperPage paperName="Tax Invoice" documentNumber={values.billNumber} draft={values.draft}>
        {values.draft ? (
          <Text style={styles.draftBanner} fixed>
            {DRAFT_MARK}
          </Text>
        ) : null}
        <HeaderBox seller={values.seller} rows={invoiceRows(values)} />
        <BuyerBox values={values} />
        <LinesTable columns={taxInvoiceColumns} rows={rows} />
        <TotalsBox
          totalLabel="Grand Total"
          totalPaise={values.totals.totalPaise}
          roundOffPaise={values.totals.roundOffPaise}
          quantityText={totalQuantityText(values.lines)}
        />
        <GstSummary supplyType={values.supplyType} lines={values.lines} />
        {values.irn && props.qrDataUrl ? (
          <IrnBlock irn={values.irn} qrDataUrl={props.qrDataUrl} />
        ) : null}
        <TermsFooter seller={values.seller} />
      </PaperPage>
    </PaperDocument>
  );
}

const billOfSupplyColumns: Column[] = [
  { header: "Sl.", width: 5, align: "center" },
  { header: "Description of Product", width: 40 },
  { header: "HSN", width: 9 },
  { header: "Rate", width: 13, align: "right" },
  { header: "Qty", width: 8, align: "right" },
  { header: "Unit", width: 10 },
  { header: "Amount", width: 15, align: "right" },
];

export function BillOfSupplyPaper({ values }: { values: BillOfSupplyValues }) {
  const rows = values.lines.map((line, index) => [
    String(index + 1),
    line.name,
    line.hsn,
    formatPaise(line.ratePaise),
    String(line.quantity),
    line.unit,
    formatPaise(line.valuePaise),
  ]);
  return (
    <PaperDocument title={`Bill of Supply ${values.billNumber}`} seller={values.seller}>
      <PaperPage paperName="Bill of Supply" documentNumber={values.billNumber}>
        <HeaderBox seller={values.seller} rows={invoiceRows(values)} />
        <BuyerBox values={values} />
        <LinesTable columns={billOfSupplyColumns} rows={rows} />
        <TotalsBox
          totalLabel="Grand Total"
          totalPaise={values.totals.totalPaise}
          roundOffPaise={values.totals.roundOffPaise}
          quantityText={totalQuantityText(values.lines)}
        />
        <Text style={styles.notice}>Exempt supply. No tax charged.</Text>
        <TermsFooter seller={values.seller} />
      </PaperPage>
    </PaperDocument>
  );
}
