// @jsxRuntime automatic
import { Text, View } from "@react-pdf/renderer";

import { amountInWords, balanceWording, formatDate, formatPaise } from "../format";
import type { PaymentModeValue, PaymentReceiptValues } from "../types";
import { Fact, PaperDocument, PaperPage, TitleRow, styles } from "./parts";

const MODE_LABELS: Record<PaymentModeValue, string> = { cash: "Cash", bank: "Bank", upi: "UPI" };

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        paddingVertical: 4,
        paddingHorizontal: 8,
        borderBottomWidth: 0.5,
        borderBottomColor: "#c8c8c8",
      }}
    >
      <Text style={styles.label}>{label}</Text>
      <Text style={strong ? [styles.bold, { fontSize: 10 }] : styles.bold}>{value}</Text>
    </View>
  );
}

export function PaymentReceiptPaper({ values }: { values: PaymentReceiptValues }) {
  return (
    <PaperDocument title={`Payment Receipt ${values.receiptNumber}`} seller={values.seller}>
      <PaperPage
        paperName="Payment Receipt"
        documentNumber={values.receiptNumber}
        seller={values.seller}
      >
        <TitleRow
          title="Payment Receipt"
          meta={[
            ["Receipt No.", values.receiptNumber],
            ["Date", `${formatDate(values.paidOn)} ${values.paidAtTime}`],
          ]}
        />
        <View style={styles.parties} wrap={false}>
          <View style={styles.party}>
            <Text style={styles.partyLabel}>Seller</Text>
            <Text style={styles.partyName}>{values.seller.legalName}</Text>
            <Text>{values.seller.address}</Text>
            <Fact label="GSTIN:" value={values.seller.gstin} />
            <Fact
              label="State:"
              value={`${values.seller.stateName} (${values.seller.stateCode})`}
            />
          </View>
          <View style={[styles.party, styles.partyDivider]}>
            <Text style={styles.partyLabel}>Received from</Text>
            <Text style={styles.partyName}>{values.customer.shopName}</Text>
            <Fact label="Phone:" value={values.customer.phone} />
            <Fact label="Route:" value={`${values.route.name} (${values.route.code})`} />
          </View>
        </View>
        <View style={{ borderWidth: 0.75, borderColor: "#8c8c8c", marginTop: 4 }} wrap={false}>
          <Row label="Mode" value={MODE_LABELS[values.mode]} />
          {values.reference ? <Row label="Reference" value={values.reference} /> : null}
          <Row label="Amount received" value={formatPaise(values.receivedPaise)} />
          <Row label="Amount kept" value={formatPaise(values.keptPaise)} strong />
          {values.returnedPaise > 0 ? (
            <Row label="Cash returned" value={formatPaise(values.returnedPaise)} />
          ) : null}
          <Row
            label="Balance after this payment"
            value={balanceWording(values.balanceAfterPaise)}
          />
        </View>
        <View style={{ marginTop: 8 }}>
          <Text style={styles.label}>Amount kept in words</Text>
          <Text style={styles.words}>{amountInWords(values.keptPaise)}</Text>
        </View>
        <Text style={styles.notice}>This is not a tax invoice.</Text>
      </PaperPage>
    </PaperDocument>
  );
}
