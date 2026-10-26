// @jsxRuntime automatic
import { Document, Font, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";

import { notoSansBoldBase64, notoSansRegularBase64 } from "../fonts/noto-sans";
import { DRAFT_MARK, formatPaise, formatSignedPaise } from "../format";
import type { BuyerValues, PartyBlocks, SellerValues, SupplyType } from "../types";

// One embedded family with the ₹ glyph, so the rupee sign never prints as a blank box.
const FONT_FAMILY = "Noto Sans";
Font.register({
  family: FONT_FAMILY,
  fonts: [
    { src: `data:font/ttf;base64,${notoSansRegularBase64}`, fontWeight: 400 },
    { src: `data:font/ttf;base64,${notoSansBoldBase64}`, fontWeight: 700 },
  ],
});
// Words are never split with a hyphen; a long IRN or reference wraps at any character instead.
Font.registerHyphenationCallback((word) => (word.length > 24 ? Array.from(word) : [word]));

const INK = "#1a1a1a";
const MUTED = "#5c5c5c";
const RULE = "#8c8c8c";
const FILL = "#efefef";

export const styles = StyleSheet.create({
  page: {
    fontFamily: FONT_FAMILY,
    fontSize: 8.5,
    color: INK,
    paddingTop: 28,
    paddingHorizontal: 28,
    paddingBottom: 72,
  },
  continued: { position: "absolute", top: 12, left: 28, right: 28, fontSize: 7.5, color: MUTED },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderBottomWidth: 1.5,
    borderBottomColor: INK,
    paddingBottom: 8,
    marginBottom: 8,
  },
  title: { fontSize: 16, fontWeight: 700, letterSpacing: 0.5 },
  subtitle: { fontSize: 8, color: MUTED, marginTop: 2 },
  metaBox: { alignItems: "flex-end" },
  metaLine: { flexDirection: "row" },
  metaLabel: { color: MUTED, marginRight: 4 },
  metaValue: { fontWeight: 700 },
  parties: { flexDirection: "row", borderWidth: 0.75, borderColor: RULE, marginBottom: 6 },
  // No lineHeight anywhere: a page-level lineHeight hides text in the absolutely placed footer.
  party: { flex: 1, padding: 6 },
  partyDivider: { borderLeftWidth: 0.75, borderLeftColor: RULE },
  partyLabel: { fontSize: 7, color: MUTED, textTransform: "uppercase", marginBottom: 2 },
  partyName: { fontSize: 10, fontWeight: 700, marginBottom: 1 },
  facts: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderWidth: 0.75,
    borderColor: RULE,
    paddingVertical: 4,
    paddingHorizontal: 6,
    marginBottom: 8,
  },
  fact: { flexDirection: "row", marginRight: 14 },
  label: { color: MUTED, marginRight: 3 },
  bold: { fontWeight: 700 },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: FILL,
    borderTopWidth: 0.75,
    borderBottomWidth: 0.75,
    borderColor: INK,
    fontWeight: 700,
    fontSize: 7.5,
  },
  tableRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#c8c8c8" },
  cell: { paddingVertical: 3, paddingHorizontal: 3 },
  summary: { flexDirection: "row", marginTop: 8 },
  summaryLeft: { flex: 1, paddingRight: 12 },
  totals: { width: 200, borderWidth: 0.75, borderColor: RULE },
  totalLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2.5,
    paddingHorizontal: 6,
  },
  grandTotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderTopWidth: 0.75,
    borderTopColor: INK,
    backgroundColor: FILL,
    fontWeight: 700,
    fontSize: 10,
  },
  words: { marginTop: 2, fontWeight: 700 },
  notice: {
    marginTop: 8,
    padding: 6,
    borderWidth: 0.75,
    borderColor: INK,
    fontWeight: 700,
  },
  footer: {
    position: "absolute",
    left: 28,
    right: 28,
    bottom: 20,
    borderTopWidth: 0.75,
    borderTopColor: RULE,
    paddingTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    fontSize: 7.5,
    color: MUTED,
  },
  footerLeft: { flex: 1 },
  signatory: { flex: 1, textAlign: "right" },
  signatoryLine: { color: INK, fontWeight: 700 },
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

// A4 portrait with the footer on every page: page x of y, computer generated, signatory. A draft
// prints its mark across every page.
export function PaperPage(props: {
  paperName: string;
  documentNumber: string;
  seller: SellerValues;
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
      {props.children}
      <View style={styles.footer} fixed>
        <View style={styles.footerLeft}>
          <Text>This is a computer generated document.</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
        <Text style={[styles.signatory, styles.signatoryLine]}>
          Authorised signatory, for {props.seller.legalName}
        </Text>
      </View>
    </Page>
  );
}

export function TitleRow(props: {
  title: string;
  subtitle?: string;
  meta: Array<[label: string, value: string]>;
}) {
  return (
    <View style={styles.titleRow}>
      <View>
        <Text style={styles.title}>{props.title}</Text>
        {props.subtitle ? <Text style={styles.subtitle}>{props.subtitle}</Text> : null}
      </View>
      <View style={styles.metaBox}>
        {props.meta.map(([label, value]) => (
          <View key={label} style={styles.metaLine}>
            <Text style={styles.metaLabel}>{label}</Text>
            <Text style={styles.metaValue}>{value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function SellerBlock({ seller }: { seller: SellerValues }) {
  return (
    <View style={styles.party}>
      <Text style={styles.partyLabel}>Seller</Text>
      <Text style={styles.partyName}>{seller.legalName}</Text>
      <Text>{seller.address}</Text>
      <Fact label="GSTIN:" value={seller.gstin} />
      <Fact label="State:" value={`${seller.stateName} (${seller.stateCode})`} />
    </View>
  );
}

function BuyerBlock({ buyer }: { buyer: BuyerValues }) {
  return (
    <View style={[styles.party, styles.partyDivider]}>
      <Text style={styles.partyLabel}>Buyer</Text>
      <Text style={styles.partyName}>{buyer.shopName}</Text>
      <Text>{buyer.address}</Text>
      <Fact label="Phone:" value={buyer.phone} />
      <Fact label="GSTIN:" value={buyer.gstin ?? "Unregistered"} />
    </View>
  );
}

export function Parties({ blocks }: { blocks: PartyBlocks }) {
  return (
    <View style={styles.parties} wrap={false}>
      <SellerBlock seller={blocks.seller} />
      <BuyerBlock buyer={blocks.buyer} />
    </View>
  );
}

export function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaLine}>
      <Text style={styles.label}>{label}</Text>
      <Text>{value}</Text>
    </View>
  );
}

export function FactsRow({ facts }: { facts: Array<[label: string, value: string]> }) {
  return (
    <View style={styles.facts} wrap={false}>
      {facts.map(([label, value]) => (
        <View key={label} style={styles.fact}>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.bold}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

export function supplyTypeLabel(supplyType: SupplyType): string {
  return supplyType === "intra_state" ? "Intra-state" : "Inter-state";
}

export function partyFacts(blocks: PartyBlocks): Array<[string, string]> {
  return [
    ["Route:", `${blocks.route.name} (${blocks.route.code})`],
    ["Place of supply:", `${blocks.placeOfSupply.stateName} (${blocks.placeOfSupply.stateCode})`],
  ];
}

export interface Column {
  header: string;
  width: number;
  align?: "left" | "right" | "center";
}

// The header row repeats at the top of every page the table runs onto; a row never splits.
export function LinesTable({ columns, rows }: { columns: Column[]; rows: string[][] }) {
  const cellStyle = (column: Column) => [
    styles.cell,
    { width: `${column.width}%`, textAlign: column.align ?? "left" },
  ];
  return (
    <View>
      <View style={styles.tableHeader} fixed>
        {columns.map((column) => (
          <Text key={column.header} style={cellStyle(column)}>
            {column.header}
          </Text>
        ))}
      </View>
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.tableRow} wrap={false}>
          {row.map((value, columnIndex) => (
            <Text key={columnIndex} style={cellStyle(columns[columnIndex]!)}>
              {value}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

export type TotalLine = [label: string, paise: number, kind?: "signed"];

export function TotalsBox(props: { lines: TotalLine[]; totalLabel: string; totalPaise: number }) {
  return (
    <View style={styles.totals}>
      {props.lines.map(([label, paise, kind]) => (
        <View key={label} style={styles.totalLine}>
          <Text style={styles.label}>{label}</Text>
          <Text>{kind === "signed" ? formatSignedPaise(paise) : formatPaise(paise)}</Text>
        </View>
      ))}
      <View style={styles.grandTotal}>
        <Text>{props.totalLabel}</Text>
        <Text>{formatPaise(props.totalPaise)}</Text>
      </View>
    </View>
  );
}
