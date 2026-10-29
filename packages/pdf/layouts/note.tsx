// @jsxRuntime automatic
import { Text, View } from "@react-pdf/renderer";

import { formatDate, formatPaise, formatRateBps } from "../format";
import type {
  CommercialCreditNoteValues,
  GstNoteLine,
  GstNoteValues,
  NoteHeaderValues,
  SellerValues,
} from "../types";
import {
  BankDetails,
  GstSummary,
  HeaderBox,
  LinesTable,
  PaperDocument,
  PaperPage,
  PartyBox,
  TermsAndSignatory,
  TotalsBox,
  joined,
  stateWithCode,
  styles,
  supplyTypeLabel,
  termLines,
  totalQuantityText,
  type Column,
  type KeyRow,
} from "./parts";

function noteRows(values: NoteHeaderValues): KeyRow[] {
  const rows: KeyRow[] = [
    ["Document No.", values.noteNumber],
    ["Date", formatDate(values.issuedOn)],
  ];
  if (values.seller.place) rows.push(["Place", values.seller.place]);
  return rows;
}

function CustomerBox(props: { values: NoteHeaderValues; supplyFacts: KeyRow[] }) {
  const { buyer, placeOfSupply, route } = props.values;
  return (
    <PartyBox
      heading="Customer"
      name={buyer.shopName}
      details={[
        buyer.address,
        joined([`GSTIN: ${buyer.gstin ?? "Unregistered"}`, `Mobile: ${buyer.phone}`]),
      ]}
      rows={[
        ["Place of Supply", stateWithCode(placeOfSupply)],
        ["Route", route.name],
        ...props.supplyFacts,
      ]}
    />
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", width: "50%", paddingVertical: 2 }}>
      <Text style={[styles.bold, { width: 118 }]}>{label}</Text>
      <Text style={{ flex: 1 }}>{value}</Text>
    </View>
  );
}

// Original Invoice No. and Date, the return or damage date when set, and the reason in full.
function OriginalInvoiceBox(props: { values: NoteHeaderValues; paperName: string }) {
  const { values } = props;
  return (
    <View style={styles.boxColumn} wrap={false}>
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        <Fact label="Original Invoice No." value={values.originalBill.number} />
        <Fact label="Original Invoice Date" value={formatDate(values.originalBill.date)} />
        {values.returnOrDamageOn ? (
          <Fact label="Return / damage date" value={formatDate(values.returnOrDamageOn)} />
        ) : null}
      </View>
      <View style={{ flexDirection: "row", paddingTop: 2 }}>
        <Text style={[styles.bold, { width: 118 }]}>Reason for {props.paperName}</Text>
        <Text style={{ flex: 1 }}>{values.reason}</Text>
      </View>
    </View>
  );
}

function NoteFooter({ seller }: { seller: SellerValues }) {
  return (
    <>
      <BankDetails bank={seller.bank} />
      <TermsAndSignatory
        seller={seller}
        title="Terms and Conditions"
        lines={termLines(seller.terms)}
      />
    </>
  );
}

// The Note line's own value per unit, to the paisa (a rate difference is not the Bill's rate).
function rateOf(line: GstNoteLine): number {
  return Math.round(line.taxablePaise / line.quantity);
}

const gstNoteColumns: Column[] = [
  { header: "Sl.", width: 4, align: "center" },
  { header: "Description of Product", width: 28 },
  { header: "HSN", width: 7 },
  { header: "Rate (Excl. GST)", width: 11, align: "right" },
  { header: "GST %", width: 6, align: "center" },
  { header: "Qty", width: 7, align: "right" },
  { header: "Unit", width: 9 },
  { header: "Taxable Value", width: 13, align: "right" },
  { header: "Total Amount", width: 15, align: "right" },
];

// GST Credit Note and Debit Note: same paper, different title.
export function GstNotePaper(props: { values: GstNoteValues; kind: "credit" | "debit" }) {
  const { values } = props;
  const title = props.kind === "credit" ? "Credit Note" : "Debit Note";
  const rows = values.lines.map((line, index) => [
    String(index + 1),
    line.name,
    line.hsn,
    formatPaise(rateOf(line)),
    formatRateBps(line.gstRateBps),
    String(line.quantity),
    line.unit,
    formatPaise(line.taxablePaise),
    formatPaise(line.taxablePaise + line.cgstPaise + line.sgstPaise + line.igstPaise),
  ]);
  return (
    <PaperDocument title={`${title} ${values.noteNumber}`} seller={values.seller}>
      <PaperPage paperName={title} documentNumber={values.noteNumber}>
        <HeaderBox seller={values.seller} rows={noteRows(values)} />
        <CustomerBox
          values={values}
          supplyFacts={[
            ["Supply", supplyTypeLabel(values.supplyType)],
            ["Reverse Charge", "No"],
          ]}
        />
        <OriginalInvoiceBox values={values} paperName={title} />
        <LinesTable columns={gstNoteColumns} rows={rows} />
        <TotalsBox
          totalLabel={`${title} Total`}
          totalPaise={values.totals.totalPaise}
          roundOffPaise={values.totals.roundOffPaise}
          quantityText={totalQuantityText(values.lines)}
          wordsLabel="Amount in words"
        />
        <GstSummary supplyType={values.supplyType} lines={values.lines} />
        <NoteFooter seller={values.seller} />
      </PaperPage>
    </PaperDocument>
  );
}

const commercialColumns: Column[] = [
  { header: "Sl.", width: 5, align: "center" },
  { header: "Description of Product", width: 45 },
  { header: "HSN", width: 10 },
  { header: "Qty", width: 10, align: "right" },
  { header: "Unit", width: 12 },
  { header: "Amount", width: 18, align: "right" },
];

export function CommercialCreditNotePaper({ values }: { values: CommercialCreditNoteValues }) {
  const rows = values.lines.map((line, index) => [
    String(index + 1),
    line.name,
    line.hsn,
    String(line.quantity),
    line.unit,
    formatPaise(line.amountPaise),
  ]);
  return (
    <PaperDocument title={`Credit Note ${values.noteNumber}`} seller={values.seller}>
      <PaperPage paperName="Credit Note (Commercial)" documentNumber={values.noteNumber}>
        <HeaderBox seller={values.seller} rows={noteRows(values)} />
        <CustomerBox values={values} supplyFacts={[]} />
        <OriginalInvoiceBox values={values} paperName="Credit Note" />
        <LinesTable columns={commercialColumns} rows={rows} />
        <TotalsBox
          totalLabel="Credit Note Total"
          totalPaise={values.totals.totalPaise}
          roundOffPaise={values.totals.roundOffPaise}
          quantityText={totalQuantityText(values.lines)}
          wordsLabel="Amount in words"
        />
        <Text style={styles.notice}>
          This Credit Note does not reduce GST. Not a GST Credit Note.
        </Text>
        <NoteFooter seller={values.seller} />
      </PaperPage>
    </PaperDocument>
  );
}
