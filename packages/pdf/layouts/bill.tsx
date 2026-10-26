// @jsxRuntime automatic
import { Image, Text, View } from "@react-pdf/renderer";

import { DRAFT_MARK, amountInWords, formatDate, formatPaise, formatRateBps } from "../format";
import type {
  BillHeaderValues,
  BillOfSupplyValues,
  IrnValues,
  TaxInvoiceLine,
  TaxInvoiceValues,
} from "../types";
import {
  FactsRow,
  LinesTable,
  PaperDocument,
  PaperPage,
  Parties,
  TitleRow,
  TotalsBox,
  partyFacts,
  styles,
  supplyTypeLabel,
  type Column,
  type TotalLine,
} from "./parts";

function billMeta(values: BillHeaderValues): Array<[string, string]> {
  const meta: Array<[string, string]> = [
    ["Bill No.", values.billNumber],
    ["Bill date", formatDate(values.billDate)],
  ];
  if (values.versionNumber > 1) meta.push(["Version", String(values.versionNumber)]);
  return meta;
}

function lineTotal(line: TaxInvoiceLine): number {
  return line.taxablePaise + line.cgstPaise + line.sgstPaise + line.igstPaise;
}

function taxInvoiceColumns(intraState: boolean): Column[] {
  const lead: Column[] = [
    { header: "#", width: 4, align: "center" },
    { header: "Item", width: intraState ? 21 : 29 },
    { header: "Unit", width: 7 },
    { header: "HSN", width: 8 },
    { header: "Qty", width: 6, align: "right" },
    { header: "Rate", width: 9, align: "right" },
    { header: "Taxable", width: 11, align: "right" },
    { header: "GST %", width: 6, align: "right" },
  ];
  const tax: Column[] = intraState
    ? [
        { header: "CGST", width: 9, align: "right" },
        { header: "SGST", width: 9, align: "right" },
      ]
    : [{ header: "IGST", width: 10, align: "right" }];
  return [...lead, ...tax, { header: "Total", width: 10, align: "right" }];
}

function IrnBlock({ irn, qrDataUrl }: { irn: IrnValues; qrDataUrl: string }) {
  return (
    <View
      wrap={false}
      style={{ flexDirection: "row", marginTop: 10, borderWidth: 0.75, borderColor: "#8c8c8c" }}
    >
      <View style={{ flex: 1, padding: 6 }}>
        <Text style={styles.partyLabel}>E-invoice</Text>
        <Text style={styles.label}>IRN</Text>
        <Text style={[styles.bold, { marginBottom: 3 }]}>{irn.irn}</Text>
        <View style={{ flexDirection: "row" }}>
          <Text style={styles.label}>Ack No.</Text>
          <Text style={[styles.bold, { marginRight: 14 }]}>{irn.ackNumber}</Text>
          <Text style={styles.label}>Ack date</Text>
          <Text style={styles.bold}>{formatDate(irn.ackDate)}</Text>
        </View>
      </View>
      <View style={{ padding: 6 }}>
        <Image src={qrDataUrl} style={{ width: 104, height: 104 }} />
      </View>
    </View>
  );
}

export function TaxInvoicePaper(props: { values: TaxInvoiceValues; qrDataUrl: string | null }) {
  const { values } = props;
  const intraState = values.supplyType === "intra_state";
  const rows = values.lines.map((line, index) => [
    String(index + 1),
    line.name,
    line.unit,
    line.hsn,
    String(line.quantity),
    formatPaise(line.ratePaise),
    formatPaise(line.taxablePaise),
    formatRateBps(line.gstRateBps),
    ...(intraState
      ? [formatPaise(line.cgstPaise), formatPaise(line.sgstPaise)]
      : [formatPaise(line.igstPaise)]),
    formatPaise(lineTotal(line)),
  ]);
  const totalLines: TotalLine[] = [
    ["Taxable value", values.totals.taxablePaise],
    ...(intraState
      ? ([
          ["CGST", values.totals.cgstPaise],
          ["SGST", values.totals.sgstPaise],
        ] satisfies TotalLine[])
      : ([["IGST", values.totals.igstPaise]] satisfies TotalLine[])),
    ["Round off", values.totals.roundOffPaise, "signed"],
  ];
  return (
    <PaperDocument title={`Tax Invoice ${values.billNumber}`} seller={values.seller}>
      <PaperPage
        paperName="Tax Invoice"
        documentNumber={values.billNumber}
        seller={values.seller}
        draft={values.draft}
      >
        {values.draft ? (
          <Text style={styles.draftBanner} fixed>
            {DRAFT_MARK}
          </Text>
        ) : null}
        <TitleRow title="Tax Invoice" meta={billMeta(values)} />
        <Parties blocks={values} />
        <FactsRow
          facts={[
            ...partyFacts(values),
            ["Supply:", supplyTypeLabel(values.supplyType)],
            ["Reverse charge:", "No"],
          ]}
        />
        <LinesTable columns={taxInvoiceColumns(intraState)} rows={rows} />
        <View style={styles.summary} wrap={false}>
          <View style={styles.summaryLeft}>
            <Text style={styles.label}>Total in words</Text>
            <Text style={styles.words}>{amountInWords(values.totals.totalPaise)}</Text>
          </View>
          <TotalsBox lines={totalLines} totalLabel="Total" totalPaise={values.totals.totalPaise} />
        </View>
        {values.irn && props.qrDataUrl ? (
          <IrnBlock irn={values.irn} qrDataUrl={props.qrDataUrl} />
        ) : null}
      </PaperPage>
    </PaperDocument>
  );
}

const billOfSupplyColumns: Column[] = [
  { header: "#", width: 5, align: "center" },
  { header: "Item", width: 37 },
  { header: "Unit", width: 10 },
  { header: "HSN", width: 10 },
  { header: "Qty", width: 8, align: "right" },
  { header: "Rate", width: 14, align: "right" },
  { header: "Value", width: 16, align: "right" },
];

export function BillOfSupplyPaper({ values }: { values: BillOfSupplyValues }) {
  const rows = values.lines.map((line, index) => [
    String(index + 1),
    line.name,
    line.unit,
    line.hsn,
    String(line.quantity),
    formatPaise(line.ratePaise),
    formatPaise(line.valuePaise),
  ]);
  const linesValue = values.lines.reduce((sum, line) => sum + line.valuePaise, 0);
  return (
    <PaperDocument title={`Bill of Supply ${values.billNumber}`} seller={values.seller}>
      <PaperPage
        paperName="Bill of Supply"
        documentNumber={values.billNumber}
        seller={values.seller}
      >
        <TitleRow title="Bill of Supply" meta={billMeta(values)} />
        <Parties blocks={values} />
        <FactsRow facts={partyFacts(values)} />
        <LinesTable columns={billOfSupplyColumns} rows={rows} />
        <View style={styles.summary} wrap={false}>
          <View style={styles.summaryLeft}>
            <Text style={styles.label}>Total in words</Text>
            <Text style={styles.words}>{amountInWords(values.totals.totalPaise)}</Text>
            <Text style={styles.notice}>Exempt supply. No tax charged.</Text>
          </View>
          <TotalsBox
            lines={[
              ["Value", linesValue],
              ["Round off", values.totals.roundOffPaise, "signed"],
            ]}
            totalLabel="Total"
            totalPaise={values.totals.totalPaise}
          />
        </View>
      </PaperPage>
    </PaperDocument>
  );
}
