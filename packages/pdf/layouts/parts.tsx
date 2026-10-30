// @jsxRuntime automatic
import { Document, Font, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";

import { motakeLogoPngBase64 } from "../assets/motake-logo";
import { notoSansBoldBase64, notoSansRegularBase64 } from "../fonts/noto-sans";
import {
  notoSansDevanagariBoldBase64,
  notoSansDevanagariRegularBase64,
} from "../fonts/noto-sans-devanagari";
import {
  DRAFT_MARK,
  amountInWords,
  formatPaise,
  formatRateBps,
  formatSignedPaise,
} from "../format";
import type { BankValues, SellerValues, SupplyType } from "../types";

// Embedded fonts, so neither the ₹ sign nor Marathi text ever prints as a blank box. Noto Sans
// draws Latin and ₹; react-pdf falls back character by character to Noto Sans Devanagari for
// Marathi shop names, addresses and Customer names, shaping conjuncts and matras from its tables.
const FONT_FAMILY = "Noto Sans";
const DEVANAGARI_FONT_FAMILY = "Noto Sans Devanagari";
Font.register({
  family: FONT_FAMILY,
  fonts: [
    { src: `data:font/ttf;base64,${notoSansRegularBase64}`, fontWeight: 400 },
    { src: `data:font/ttf;base64,${notoSansBoldBase64}`, fontWeight: 700 },
  ],
});
Font.register({
  family: DEVANAGARI_FONT_FAMILY,
  fonts: [
    { src: `data:font/ttf;base64,${notoSansDevanagariRegularBase64}`, fontWeight: 400 },
    { src: `data:font/ttf;base64,${notoSansDevanagariBoldBase64}`, fontWeight: 700 },
  ],
});
// Words are never split with a hyphen; a long IRN or reference wraps at any character instead.
Font.registerHyphenationCallback((word) => (word.length > 24 ? Array.from(word) : [word]));

const INK = "#1a1a1a";
const MUTED = "#5c5c5c";
const RULE = "#1a1a1a";
const FILL = "#efefef";
const BOX_GAP = 6;

const LOGO_SRC = `data:image/png;base64,${motakeLogoPngBase64}`;

export const styles = StyleSheet.create({
  page: {
    fontFamily: [FONT_FAMILY, DEVANAGARI_FONT_FAMILY],
    fontSize: 8,
    color: INK,
    paddingTop: 24,
    paddingHorizontal: 28,
    paddingBottom: 48,
  },
  continued: { position: "absolute", top: 10, left: 28, right: 28, fontSize: 7.5, color: MUTED },
  title: { textAlign: "center", fontSize: 15, fontWeight: 700, letterSpacing: 0.5 },
  subtitle: { textAlign: "center", fontSize: 7.5, color: MUTED, marginTop: 1, marginBottom: 6 },
  // No lineHeight anywhere: a page-level lineHeight hides text in the absolutely placed footer.
  box: { flexDirection: "row", borderWidth: 0.75, borderColor: RULE, marginBottom: BOX_GAP },
  boxColumn: { borderWidth: 0.75, borderColor: RULE, marginBottom: BOX_GAP, padding: 6 },
  cellBlock: { flex: 1, padding: 6 },
  dividerLeft: { borderLeftWidth: 0.75, borderLeftColor: RULE },
  sellerBlock: { flex: 1.9, flexDirection: "row", padding: 6, alignItems: "center" },
  logo: { width: 68, height: 51, marginRight: 10 },
  sellerName: { fontSize: 12.5, fontWeight: 700, marginBottom: 2 },
  heading: { fontSize: 8, fontWeight: 700, textTransform: "uppercase", marginBottom: 3 },
  partyName: { fontSize: 9.5, fontWeight: 700, marginBottom: 1 },
  keyRows: { flex: 1, borderLeftWidth: 0.75, borderLeftColor: RULE },
  keyRow: { flexDirection: "row", paddingVertical: 3.5, paddingHorizontal: 6 },
  keyRowRule: { borderTopWidth: 0.5, borderTopColor: RULE },
  keyLabel: { width: 78, color: MUTED },
  keyValue: { flex: 1, fontWeight: 700 },
  label: { color: MUTED, marginRight: 3 },
  bold: { fontWeight: 700 },
  small: { fontSize: 7.5 },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: FILL,
    borderWidth: 0.75,
    borderColor: RULE,
    fontWeight: 700,
    fontSize: 7.5,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderLeftWidth: 0.75,
    borderRightWidth: 0.75,
    borderColor: RULE,
  },
  tableTotalRow: {
    flexDirection: "row",
    borderBottomWidth: 0.75,
    borderLeftWidth: 0.75,
    borderRightWidth: 0.75,
    borderColor: RULE,
    fontWeight: 700,
  },
  cell: { paddingVertical: 3.5, paddingHorizontal: 3 },
  cellRule: { borderRightWidth: 0.5, borderRightColor: RULE },
  totalsCell: { flex: 1, paddingVertical: 4, paddingHorizontal: 6 },
  totalsWords: {
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderTopWidth: 0.5,
    borderTopColor: RULE,
  },
  grandTotal: { fontSize: 10, fontWeight: 700 },
  words: { fontWeight: 700, marginTop: 1 },
  notice: {
    padding: 6,
    borderWidth: 0.75,
    borderColor: RULE,
    fontWeight: 700,
    marginBottom: BOX_GAP,
  },
  signatoryBlock: { width: "38%", padding: 6, justifyContent: "space-between", minHeight: 62 },
  signatoryFor: { fontWeight: 700 },
  signatoryLine: { textAlign: "center" },
  footer: {
    position: "absolute",
    left: 28,
    right: 28,
    bottom: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: MUTED,
  },
  watermark: {
    position: "absolute",
    top: 360,
    left: -40,
    right: -40,
    textAlign: "center",
    fontSize: 54,
    fontWeight: 700,
    color: "#d9d9d9",
    transform: "rotate(-35deg)",
  },
  draftBanner: {
    borderWidth: 1,
    borderColor: INK,
    backgroundColor: FILL,
    textAlign: "center",
    fontWeight: 700,
    fontSize: 10,
    paddingVertical: 3,
    marginBottom: 6,
  },
});

export function PaperDocument(props: { title: string; seller: SellerValues; children: ReactNode }) {
  return (
    <Document
      title={props.title}
      author={props.seller.legalName}
      creator="Motake"
      producer="Motake"
    >
      {props.children}
    </Document>
  );
}

// A4 portrait: the title on the first page, "(continued)" above later pages, and the footer on
// every page (computer generated, page x of y). A draft prints its mark across every page.
export function PaperPage(props: {
  paperName: string;
  documentNumber: string;
  draft?: boolean;
  children: ReactNode;
}) {
  return (
    <Page size="A4" orientation="portrait" style={styles.page}>
      {props.draft ? (
        <Text style={styles.watermark} fixed>
          {DRAFT_MARK}
        </Text>
      ) : null}
      <Text
        style={styles.continued}
        fixed
        render={({ pageNumber }) =>
          pageNumber > 1 ? `${props.paperName} ${props.documentNumber} (continued)` : ""
        }
      />
      <Text style={styles.title}>{props.paperName.toUpperCase()}</Text>
      <Text style={styles.subtitle}>(ORIGINAL FOR RECIPIENT)</Text>
      {props.children}
      <View style={styles.footer} fixed>
        <Text>This is a computer generated document.</Text>
        <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
      </View>
    </Page>
  );
}

export type KeyRow = [label: string, value: string];

// Label and value rows split by thin rules: the right half of the header and party boxes.
export function KeyRows({ rows }: { rows: KeyRow[] }) {
  return (
    <View style={styles.keyRows}>
      {rows.map(([label, value], index) => (
        <View key={label} style={index > 0 ? [styles.keyRow, styles.keyRowRule] : styles.keyRow}>
          <Text style={styles.keyLabel}>{label}</Text>
          <Text style={styles.keyValue}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

// Facts on one line, split by bars; empty ones left out.
export function joined(parts: Array<string | null | false>): string {
  return parts.filter(Boolean).join("  |  ");
}

// Logo and seller on the left, the paper's number and date rows on the right.
export function HeaderBox({ seller, rows }: { seller: SellerValues; rows: KeyRow[] }) {
  return (
    <View style={styles.box} wrap={false}>
      <View style={styles.sellerBlock}>
        <Image src={LOGO_SRC} style={styles.logo} />
        <View style={{ flex: 1 }}>
          <Text style={styles.sellerName}>{seller.legalName}</Text>
          <Text>{seller.address}</Text>
          <Text>Mobile: {seller.phone}</Text>
          {seller.email ? <Text>Email: {seller.email}</Text> : null}
          <Text>
            {joined([`GSTIN/UIN: ${seller.gstin}`, seller.pan ? `PAN: ${seller.pan}` : null])}
          </Text>
        </View>
      </View>
      <KeyRows rows={rows} />
    </View>
  );
}

// A party on the left (heading, name, detail lines), its supply facts on the right.
export function PartyBox(props: {
  heading: string;
  name: string;
  details: string[];
  rows: KeyRow[];
}) {
  return (
    <View style={styles.box} wrap={false}>
      <View style={[styles.cellBlock, { flex: 1.9 }]}>
        <Text style={styles.heading}>{props.heading}</Text>
        <Text style={styles.partyName}>{props.name}</Text>
        {props.details.map((detail, index) => (
          <Text key={index}>{detail}</Text>
        ))}
      </View>
      <KeyRows rows={props.rows} />
    </View>
  );
}

export function stateWithCode(state: { stateName: string; stateCode: string }): string {
  return `${state.stateName} (${state.stateCode})`;
}

export interface Column {
  header: string;
  width: number;
  align?: "left" | "right" | "center";
}

function cellStyle(column: Column, last: boolean) {
  return [
    styles.cell,
    ...(last ? [] : [styles.cellRule]),
    { width: `${column.width}%`, textAlign: column.align ?? "left" },
  ];
}

// A ruled grid. The header row repeats at the top of every page the table runs onto; a row never
// splits. An optional bold total row closes it.
export function LinesTable(props: { columns: Column[]; rows: string[][]; totalRow?: string[] }) {
  const { columns } = props;
  const lastIndex = columns.length - 1;
  return (
    // Each row carries its own side rules, so a table broken across pages leaves no stub below.
    <View style={{ marginBottom: BOX_GAP }}>
      <View style={styles.tableHeader} fixed>
        {columns.map((column, index) => (
          <Text key={column.header} style={cellStyle(column, index === lastIndex)}>
            {column.header}
          </Text>
        ))}
      </View>
      {props.rows.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.tableRow} wrap={false}>
          {row.map((value, columnIndex) => (
            <Text
              key={columnIndex}
              style={cellStyle(columns[columnIndex]!, columnIndex === lastIndex)}
            >
              {value}
            </Text>
          ))}
        </View>
      ))}
      {props.totalRow ? (
        <View style={styles.tableTotalRow} wrap={false}>
          {props.totalRow.map((value, columnIndex) => (
            <Text
              key={columnIndex}
              style={cellStyle(columns[columnIndex]!, columnIndex === lastIndex)}
            >
              {value}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

// "37 (mixed units)" when the lines are counted in different units, "20 L" when all share one.
export function totalQuantityText(lines: Array<{ quantity: number; unit: string }>): string {
  const total = lines.reduce((sum, line) => sum + line.quantity, 0);
  const units = new Set(lines.map((line) => line.unit));
  if (units.size === 1) return `${total} ${[...units][0]}`;
  return units.size > 1 ? `${total} (mixed units)` : String(total);
}

// Total quantity, round-off and the grand total in one row, the total in words under it.
export function TotalsBox(props: {
  totalLabel: string;
  totalPaise: number;
  roundOffPaise: number;
  quantityText: string;
  wordsLabel?: string;
}) {
  return (
    <View style={[styles.boxColumn, { padding: 0 }]} wrap={false}>
      <View style={{ flexDirection: "row" }}>
        <View style={styles.totalsCell}>
          <Text>
            <Text style={styles.label}>Total Quantity: </Text>
            {props.quantityText}
          </Text>
        </View>
        <View style={[styles.totalsCell, styles.dividerLeft]}>
          <Text>
            <Text style={styles.label}>Round Off: </Text>
            {formatSignedPaise(props.roundOffPaise)}
          </Text>
        </View>
        <View style={[styles.totalsCell, styles.dividerLeft]}>
          <Text style={styles.grandTotal}>
            {props.totalLabel}: {formatPaise(props.totalPaise)}
          </Text>
        </View>
      </View>
      <View style={styles.totalsWords}>
        <Text style={styles.label}>{props.wordsLabel ?? "Amount Chargeable (in words)"}</Text>
        <Text style={styles.words}>{amountInWords(props.totalPaise)}</Text>
      </View>
    </View>
  );
}

export interface TaxedLine {
  gstRateBps: number;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
}

interface RateGroup extends TaxedLine {
  taxPaise: number;
}

// One row per GST rate, lowest first.
function rateGroups(lines: TaxedLine[]): RateGroup[] {
  const groups = new Map<number, RateGroup>();
  for (const line of lines) {
    const group = groups.get(line.gstRateBps) ?? {
      gstRateBps: line.gstRateBps,
      taxablePaise: 0,
      cgstPaise: 0,
      sgstPaise: 0,
      igstPaise: 0,
      taxPaise: 0,
    };
    group.taxablePaise += line.taxablePaise;
    group.cgstPaise += line.cgstPaise;
    group.sgstPaise += line.sgstPaise;
    group.igstPaise += line.igstPaise;
    group.taxPaise += line.cgstPaise + line.sgstPaise + line.igstPaise;
    groups.set(line.gstRateBps, group);
  }
  return [...groups.values()].sort((first, second) => first.gstRateBps - second.gstRateBps);
}

const gstSummaryColumns: Column[] = [
  { header: "Taxable Value", width: 20, align: "right" },
  { header: "GST Rate", width: 12, align: "center" },
  { header: "IGST", width: 17, align: "right" },
  { header: "CGST", width: 17, align: "right" },
  { header: "SGST", width: 17, align: "right" },
  { header: "Total Tax", width: 17, align: "right" },
];

const NOT_CHARGED = "—";

// The tax grouped by rate. Inter-state fills IGST and dashes CGST and SGST; intra-state the other
// way round. The tax in words closes it.
export function GstSummary(props: { supplyType: SupplyType; lines: TaxedLine[] }) {
  const intraState = props.supplyType === "intra_state";
  const groups = rateGroups(props.lines);
  const row = (taxable: string, rate: string, group: TaxedLine & { taxPaise: number }) => [
    taxable,
    rate,
    intraState ? NOT_CHARGED : formatPaise(group.igstPaise),
    intraState ? formatPaise(group.cgstPaise) : NOT_CHARGED,
    intraState ? formatPaise(group.sgstPaise) : NOT_CHARGED,
    formatPaise(group.taxPaise),
  ];
  const total = groups.reduce(
    (sum, group) => ({
      gstRateBps: 0,
      taxablePaise: sum.taxablePaise + group.taxablePaise,
      cgstPaise: sum.cgstPaise + group.cgstPaise,
      sgstPaise: sum.sgstPaise + group.sgstPaise,
      igstPaise: sum.igstPaise + group.igstPaise,
      taxPaise: sum.taxPaise + group.taxPaise,
    }),
    { gstRateBps: 0, taxablePaise: 0, cgstPaise: 0, sgstPaise: 0, igstPaise: 0, taxPaise: 0 },
  );
  return (
    <View wrap={false}>
      <Text style={[styles.heading, { marginBottom: 2 }]}>GST Summary</Text>
      <LinesTable
        columns={gstSummaryColumns}
        rows={groups.map((group) =>
          row(formatPaise(group.taxablePaise), formatRateBps(group.gstRateBps), group),
        )}
        totalRow={row(formatPaise(total.taxablePaise), "Total", total)}
      />
      <View style={[styles.boxColumn, { paddingVertical: 4 }]}>
        <Text>
          <Text style={styles.label}>Tax Amount (in words): </Text>
          <Text style={styles.bold}>{amountInWords(total.taxPaise)}</Text>
        </Text>
      </View>
    </View>
  );
}

function bankParts(bank: BankValues): string[] {
  return [
    bank.accountName ? `Firm Name: ${bank.accountName}` : null,
    bank.bankName ? `Bank: ${bank.bankName}` : null,
    bank.branch ? `Branch: ${bank.branch}` : null,
    bank.accountNumber ? `A/c No.: ${bank.accountNumber}` : null,
    bank.ifsc ? `IFSC: ${bank.ifsc}` : null,
  ].filter((part): part is string => part !== null);
}

// Left out while the Seller master has no bank details.
export function BankDetails({ bank }: { bank: BankValues | null }) {
  const parts = bank ? bankParts(bank) : [];
  if (parts.length === 0) return null;
  return (
    <View style={styles.boxColumn} wrap={false}>
      <Text style={[styles.bold, { marginBottom: 2 }]}>Company Bank Details</Text>
      <Text style={styles.small}>{parts.join("  |  ")}</Text>
    </View>
  );
}

// Terms (or fixed notes) on the left, "For <seller>" and the signatory on the right. Without any
// lines the signatory stands alone on the right.
export function TermsAndSignatory(props: { seller: SellerValues; title: string; lines: string[] }) {
  return (
    <View
      style={
        props.lines.length > 0
          ? styles.box
          : [styles.box, { borderWidth: 0, justifyContent: "flex-end" }]
      }
      wrap={false}
    >
      {props.lines.length > 0 ? (
        <View style={styles.cellBlock}>
          <Text style={[styles.bold, { marginBottom: 3 }]}>{props.title}</Text>
          {props.lines.map((line, index) => (
            <Text key={index} style={styles.small}>
              {line}
            </Text>
          ))}
        </View>
      ) : null}
      <View
        style={
          props.lines.length > 0
            ? [styles.signatoryBlock, styles.dividerLeft]
            : [styles.signatoryBlock, { borderWidth: 0.75, borderColor: RULE }]
        }
      >
        <Text style={styles.signatoryFor}>For {props.seller.legalName}</Text>
        <Text style={styles.signatoryLine}>Authorised Signatory</Text>
      </View>
    </View>
  );
}

export function termLines(terms: string | null): string[] {
  return terms ? terms.split("\n").filter((line) => line.trim() !== "") : [];
}

// A Bill's and a Note's footer: the bank block, then the seller's Terms and Conditions and the
// signatory.
export function TermsFooter({ seller }: { seller: SellerValues }) {
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
