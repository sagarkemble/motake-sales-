"use client";

import { MapPinIcon, PhoneIcon, SearchXIcon, UserIcon, WalletIcon } from "lucide-react";
import { useState } from "react";

import { BalanceText } from "~/components/shared/checkout/balance-text";
import { CheckoutSuccess } from "~/components/shared/checkout/checkout-success";
import { PaymentBlock } from "~/components/shared/checkout/payment-block";
import { RefusalAlert } from "~/components/shared/checkout/refusal-alert";
import { CardDetailSkeleton } from "~/components/shared/card-detail-skeleton";
import { ShopPhotoThumbnail } from "~/components/shared/shop-photo-thumbnail";
import { Button } from "~/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "~/components/ui/drawer";
import { useRecordFieldPayment } from "~/hooks/salesman/use-record-field-payment";
import { useCustomers } from "~/hooks/use-customers";
import { useTranslate } from "~/hooks/use-translate";

interface RouteCustomerDrawerProps {
  customerId: string;
  onClose: () => void;
}

/** A Route Customer's details; "Record Payment" turns the drawer into the Payment block. */
export function RouteCustomerDrawer({ customerId, onClose }: RouteCustomerDrawerProps) {
  const tx = useTranslate();
  const [isRecordingPayment, setIsRecordingPayment] = useState(false);
  const { customer, isCustomerLoading } = useCustomers({ customerId });
  const fieldPayment = useRecordFieldPayment(customer);
  const hint = isRecordingPayment && fieldPayment.problemKey ? tx(fieldPayment.problemKey) : null;

  const detailRows = customer
    ? [
        {
          icon: UserIcon,
          label: tx("admin.customers.form.contactName"),
          value: customer.contactName ?? "—",
        },
        { icon: PhoneIcon, label: tx("common.fields.phone"), value: customer.phone },
        { icon: MapPinIcon, label: tx("common.fields.address"), value: customer.address },
      ]
    : [];

  return (
    <Drawer open onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="max-h-[94dvh]">
        <div className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col">
          {fieldPayment.result ? (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <DrawerHeader className="sr-only">
                <DrawerTitle>{tx("checkout.success.field")}</DrawerTitle>
              </DrawerHeader>
              <CheckoutSuccess
                input={fieldPayment.result}
                actions={[{ label: tx("checkout.success.done"), primary: true, onClick: onClose }]}
              />
            </div>
          ) : (
            <>
              <DrawerHeader className="text-left">
                <DrawerTitle>
                  {isRecordingPayment
                    ? tx("salesman.customers.recordPayment")
                    : (customer?.shopName ?? tx("salesman.checkout.customer.detailTitle"))}
                </DrawerTitle>
                <DrawerDescription>
                  {isRecordingPayment
                    ? tx("salesman.customers.noPurchase", { shop: customer?.shopName ?? "" })
                    : tx("salesman.checkout.customer.detailTitle")}
                </DrawerDescription>
              </DrawerHeader>

              <div className="min-h-0 flex-1 overflow-y-auto px-4">
                <div className="flex flex-col gap-3 pb-4">
                  {isCustomerLoading ? (
                    <CardDetailSkeleton />
                  ) : !customer ? (
                    <div className="flex flex-col items-center gap-2 rounded-2xl border p-6 text-center">
                      <SearchXIcon className="size-9 text-muted-foreground" />
                      <p className="text-base font-semibold">{tx("admin.customers.notFound")}</p>
                      <p className="text-sm text-muted-foreground">
                        {tx("salesman.checkout.customer.notFoundHint")}
                      </p>
                    </div>
                  ) : isRecordingPayment && fieldPayment.paymentContext ? (
                    <>
                      {fieldPayment.refusal && (
                        <RefusalAlert
                          refusal={fieldPayment.refusal}
                          shopName={customer.shopName}
                          onDismiss={fieldPayment.clearRefusal}
                        />
                      )}
                      <PaymentBlock
                        context={fieldPayment.paymentContext}
                        draft={fieldPayment.paymentDraft}
                        onChange={fieldPayment.setPaymentDraft}
                        disabled={fieldPayment.isRecording}
                      />
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-3">
                        <ShopPhotoThumbnail
                          shopPhotoUrl={customer.shopPhotoUrl}
                          shopName={customer.shopName}
                          size="lg"
                          shape="rounded"
                        />
                        <div className="rounded-2xl bg-muted/40 px-4 py-3 text-center">
                          <p className="text-xs text-muted-foreground">
                            {tx("salesman.customers.balance")}
                          </p>
                          <BalanceText
                            balancePaise={customer.balancePaise}
                            className="font-display text-xl font-semibold"
                          />
                        </div>
                      </div>
                      <div className="divide-y rounded-2xl border bg-card">
                        {detailRows.map((row) => (
                          <div key={row.label} className="flex items-start gap-3 px-3 py-2.5">
                            <row.icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                            <div className="min-w-0">
                              <p className="text-[11px] text-muted-foreground">{row.label}</p>
                              <p className="text-sm">{row.value}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {customer && (
                <DrawerFooter>
                  {isRecordingPayment ? (
                    <>
                      {hint && <p className="text-center text-xs text-muted-foreground">{hint}</p>}
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          className="rounded-full"
                          disabled={fieldPayment.isRecording}
                          onClick={() => setIsRecordingPayment(false)}
                        >
                          {tx("common.actions.back")}
                        </Button>
                        <Button
                          type="button"
                          className="flex-1 rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
                          disabled={Boolean(hint) || fieldPayment.isRecording}
                          onClick={() => void fieldPayment.record()}
                        >
                          {fieldPayment.isRecording
                            ? tx("common.status.pleaseWait")
                            : tx("salesman.customers.recordPayment")}
                        </Button>
                      </div>
                    </>
                  ) : (
                    <Button
                      type="button"
                      className="w-full gap-2 rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
                      onClick={() => setIsRecordingPayment(true)}
                    >
                      <WalletIcon className="size-4" />
                      {tx("salesman.customers.recordPayment")}
                    </Button>
                  )}
                </DrawerFooter>
              )}
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
