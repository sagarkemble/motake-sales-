// @jsxRuntime automatic
import { Text, View } from "@react-pdf/renderer";

import { amountInWords, formatDate, formatPaise } from "../format";
import type { CommercialCreditNoteValues, GstNoteValues, NoteHeaderValues } from "../types";
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

function noteMeta(values: NoteHeaderValues): Array<[string, string]> {
  return [
    ["Note No.", values.noteNumber],
    ["Date", formatDate(values.issuedOn)],
  ];
}

function noteFacts(values: NoteHeaderValues): Array<[string, string]> {
  const facts: Array<[string, string]> = [
    ["Against Bill:", values.originalBill.number],
    ["Bill date:", formatDate(values.originalBill.date)],
  ];
  if (values.returnOrDamageOn) {
    facts.push(["Return / damage date:", formatDate(values.returnOrDamageOn)]);
  }
  return facts;
}

function Reason({ reason }: { reason: string }) {
  return (
    <View style={{ flexDirection: "row", marginBottom: 8 }}>
      <Text style={styles.label}>Reason:</Text>
      <Text style={[styles.bold, { flex: 1 }]}>{reason}</Text>
    </View>
  );
}

function gstNoteColumns(intraState: boolean): Column[] {
  const lead: Column[] = [
    { header: "#", width: 5, align: "center" },
    { header: "Item", width: intraState ? 27 : 37 },
    { header: "Unit", width: 9 },
    { header: "HSN", width: 9 },
    { header: "Qty", width: 7, align: "right" },
    { header: "Taxable", width: 13, align: "right" },
  ];
  const tax: Column[] = intraState
    ? [
        { header: "CGST", width: 10, align: "right" },
        { header: "SGST", width: 10, align: "right" },
      ]
    : [{ header: "IGST", width: 10, align: "right" }];
  return [...lead, ...tax, { header: "Total", width: 10, align: "right" }];
}

// GST Credit Note and Debit Note: same paper, different title and wording of the tax line.
export function GstNotePaper(props: { values: GstNoteValues; kind: "credit" | "debit" }) {
  const { values } = props;
  const title = props.kind === "credit" ? "Credit Note" : "Debit Note";
  const intraState = values.supplyType === "intra_state";
  const rows = values.lines.map((line, index) => [
    String(index + 1),
    line.name,
    line.unit,
    line.hsn,
    String(line.quantity),
    formatPaise(line.taxablePaise),
    ...(intraState
      ? [formatPaise(line.cgstPaise), formatPaise(line.sgstPaise)]
      : [formatPaise(line.igstPaise)]),
    formatPaise(line.taxablePaise + line.cgstPaise + line.sgstPaise + line.igstPaise),
  ]);
  const taxLines: TotalLine[] = intraState
    ? [
        ["CGST", values.totals.cgstPaise],
        ["SGST", values.totals.sgstPaise],
      ]
    : [["IGST", values.totals.igstPaise]];
  return (
    <PaperDocument title={`${title} ${values.noteNumber}`} seller={values.seller}>
      <PaperPage paperName={title} documentNumber={values.noteNumber} seller={values.seller}>
        <TitleRow
          title={title}
          subtitle={
            props.kind === "credit" ? "GST reversed on the lines below" : "Additional GST charged"
          }
          meta={noteMeta(values)}
        />
        <Parties blocks={values} />
        <FactsRow
          facts={[
            ...noteFacts(values),
            ...partyFacts(values),
            ["Supply:", supplyTypeLabel(values.supplyType)],
            ["Reverse charge:", "No"],
          ]}
        />
        <Reason reason={values.reason} />
        <LinesTable columns={gstNoteColumns(intraState)} rows={rows} />
        <View style={styles.summary} wrap={false}>
          <View style={styles.summaryLeft}>
            <Text style={styles.label}>Total in words</Text>
            <Text style={styles.words}>{amountInWords(values.totals.totalPaise)}</Text>
          </View>
          <TotalsBox
            lines={[
              ["Taxable value", values.totals.taxablePaise],
              ...taxLines,
              ["Round off", values.totals.roundOffPaise, "signed"],
            ]}
            totalLabel={props.kind === "credit" ? "Total credit" : "Total debit"}
            totalPaise={values.totals.totalPaise}
          />
        </View>
      </PaperPage>
    </PaperDocument>
  );
}

const commercialColumns: Column[] = [
  { header: "#", width: 5, align: "center" },
  { header: "Item", width: 45 },
  { header: "Unit", width: 12 },
  { header: "HSN", width: 12 },
  { header: "Qty", width: 9, align: "right" },
  { header: "Amount", width: 17, align: "right" },
];

export function CommercialCreditNotePaper({ values }: { values: CommercialCreditNoteValues }) {
  const rows = values.lines.map((line, index) => [
    String(index + 1),
    line.name,
    line.unit,
    line.hsn,
    String(line.quantity),
    formatPaise(line.amountPaise),
  ]);
  const linesAmount = values.lines.reduce((sum, line) => sum + line.amountPaise, 0);
  return (
    <PaperDocument title={`Credit Note ${values.noteNumber}`} seller={values.seller}>
      <PaperPage paperName="Credit Note" documentNumber={values.noteNumber} seller={values.seller}>
        <TitleRow title="Credit Note (Commercial)" meta={noteMeta(values)} />
        <Parties blocks={values} />
        <FactsRow facts={[...noteFacts(values), ...partyFacts(values)]} />
        <Reason reason={values.reason} />
        <LinesTable columns={commercialColumns} rows={rows} />
        <View style={styles.summary} wrap={false}>
          <View style={styles.summaryLeft}>
            <Text style={styles.label}>Total in words</Text>
            <Text style={styles.words}>{amountInWords(values.totals.totalPaise)}</Text>
            <Text style={styles.notice}>
              This Credit Note does not reduce GST. Not a GST Credit Note.
            </Text>
          </View>
          <TotalsBox
            lines={[
              ["Amount", linesAmount],
              ["Round off", values.totals.roundOffPaise, "signed"],
            ]}
            totalLabel="Total credit"
            totalPaise={values.totals.totalPaise}
          />
        </View>
      </PaperPage>
    </PaperDocument>
  );
}
