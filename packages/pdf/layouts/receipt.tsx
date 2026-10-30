// @jsxRuntime automatic
import { Text, View } from "@react-pdf/renderer";

import { amountInWords, formatDate, formatPaise } from "../format";
import type { PaymentModeValue, PaymentReceiptValues } from "../types";
import {
  BankDetails,
  HeaderBox,
  PaperDocument,
  PaperPage,
  PartyBox,
  TermsAndSignatory,
  styles,
  type KeyRow,
} from "./parts";

const MODE_LABELS: Record<PaymentModeValue, string> = { cash: "Cash", bank: "Bank", upi: "UPI" };

const RECEIPT_NOTES = [
  "1. This receipt acknowledges the payment received.",
  "2. The amount is credited to the customer's running balance.",
];

// Above zero the Customer owes Motake (Outstanding); below zero Motake holds an Advance.
function balanceLabel(balancePaise: number, moment: "before" | "after"): string {
  return `${balancePaise < 0 ? "Advance" : "Outstanding"} balance ${moment} receipt`;
}

function SummaryLine(props: { label: string; paise: number; strong?: boolean }) {
  return (
    <View
      style={[
        { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2.5 },
        props.strong ? [styles.bold, { borderTopWidth: 0.75, marginTop: 2, paddingTop: 4 }] : {},
      ]}
    >
      <Text>{props.label}</Text>
      <Text>{formatPaise(props.paise)}</Text>
    </View>
  );
}

function remarksOf(values: PaymentReceiptValues): string {
  if (values.returnedPaise > 0) {
    return `${formatPaise(values.receivedPaise)} handed over; ${formatPaise(values.returnedPaise)} cash returned as change. ${formatPaise(values.keptPaise)} credited to the customer's account.`;
  }
  return "Payment received and credited to the customer's account; no specific invoice allocation.";
}

export function PaymentReceiptPaper({ values }: { values: PaymentReceiptValues }) {
  const headerRows: KeyRow[] = [
    ["Receipt No.", values.receiptNumber],
    ["Receipt Date", formatDate(values.paidOn)],
  ];
  if (values.seller.place) headerRows.push(["Received At", values.seller.place]);
  const paymentRows: KeyRow[] = [["Mode", MODE_LABELS[values.mode]]];
  if (values.reference) paymentRows.push(["Reference", values.reference]);
  paymentRows.push(["Payment Date", `${formatDate(values.paidOn)} ${values.paidAtTime}`]);
  const balanceBeforePaise = values.balanceAfterPaise + values.keptPaise;
  return (
    <PaperDocument title={`Payment Receipt ${values.receiptNumber}`} seller={values.seller}>
      <PaperPage paperName="Payment Receipt" documentNumber={values.receiptNumber}>
        <HeaderBox seller={values.seller} rows={headerRows} />
        <PartyBox
          heading="Received From"
          name={values.customer.shopName}
          details={[
            values.customer.address,
            `Mobile: ${values.customer.phone}`,
          ]}
          rows={paymentRows}
        />
        <View style={[styles.box, { backgroundColor: "#efefef" }]} wrap={false}>
          <View style={[styles.cellBlock, { flex: 0.8 }]}>
            <Text style={styles.heading}>Amount Received</Text>
            <Text style={{ fontSize: 17, fontWeight: 700 }}>{formatPaise(values.keptPaise)}</Text>
          </View>
          <View style={[styles.cellBlock, { flex: 1.6 }]}>
            <Text style={styles.heading}>Amount in Words</Text>
            <Text style={styles.bold}>{amountInWords(values.keptPaise)}</Text>
            <Text style={[styles.small, { marginTop: 2 }]}>
              Payment will be adjusted against the customer's outstanding balance.
            </Text>
          </View>
        </View>
        <View style={styles.boxColumn} wrap={false}>
          <Text style={styles.heading}>Customer Account Summary</Text>
          <SummaryLine
            label={balanceLabel(balanceBeforePaise, "before")}
            paise={Math.abs(balanceBeforePaise)}
          />
          <SummaryLine label="Less: Payment received" paise={values.keptPaise} />
          <SummaryLine
            label={balanceLabel(values.balanceAfterPaise, "after")}
            paise={Math.abs(values.balanceAfterPaise)}
            strong
          />
        </View>
        <View style={styles.boxColumn} wrap={false}>
          <Text style={styles.heading}>Remarks</Text>
          <Text>{remarksOf(values)}</Text>
        </View>
        <BankDetails bank={values.seller.bank} />
        <TermsAndSignatory seller={values.seller} title="Notes" lines={RECEIPT_NOTES} />
      </PaperPage>
    </PaperDocument>
  );
}
