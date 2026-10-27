"use client";

import { CheckoutSuccess } from "~/components/shared/checkout/checkout-success";
import { FulfilPayment, LockedLines } from "~/components/shared/checkout/fulfil-pre-order-panel";
import { Button } from "~/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "~/components/ui/drawer";
import { useFulfilPreOrder } from "~/hooks/shared/use-fulfil-pre-order";
import { useTranslate } from "~/hooks/use-translate";

export interface FulfilTarget {
  orderId: string;
  shopName: string;
  scheduledDate: string;
  placedAt: Date | null;
  // e.g. "24 qty · placed by You"
  description: string;
}

interface FulfilPreOrderDrawerProps {
  target: FulfilTarget;
  onClose: () => void;
}

/** Salesman fulfil: locked lines, the Payment block, then the success summary, in one drawer. */
export function FulfilPreOrderDrawer({ target, onClose }: FulfilPreOrderDrawerProps) {
  const tx = useTranslate();
  const fulfil = useFulfilPreOrder({ orderId: target.orderId, shopName: target.shopName });
  const hint = fulfil.problemKey ? tx(fulfil.problemKey) : null;

  return (
    <Drawer open onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="max-h-[94dvh]">
        <div className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col">
          {fulfil.result ? (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <DrawerHeader className="sr-only">
                <DrawerTitle>{tx("checkout.success.fulfilled")}</DrawerTitle>
              </DrawerHeader>
              <CheckoutSuccess
                input={fulfil.result}
                actions={[{ label: tx("checkout.success.done"), primary: true, onClick: onClose }]}
              />
            </div>
          ) : (
            <>
              <DrawerHeader className="text-left">
                <DrawerTitle>{tx("checkout.fulfil.title", { shop: target.shopName })}</DrawerTitle>
                <DrawerDescription>{target.description}</DrawerDescription>
              </DrawerHeader>
              <div className="min-h-0 flex-1 overflow-y-auto px-4">
                <div className="flex flex-col gap-4 pb-4">
                  <LockedLines
                    state={fulfil}
                    shopName={target.shopName}
                    scheduledDate={target.scheduledDate}
                    placedAt={target.placedAt}
                  />
                  <FulfilPayment state={fulfil} shopName={target.shopName} />
                </div>
              </div>
              <DrawerFooter>
                {hint && <p className="text-center text-xs text-muted-foreground">{hint}</p>}
                <Button
                  type="button"
                  className="w-full rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
                  disabled={!fulfil.paymentContext || Boolean(hint) || fulfil.isFulfilling}
                  onClick={() => void fulfil.fulfil()}
                >
                  {fulfil.isFulfilling ? tx("common.status.pleaseWait") : tx("checkout.fulfil.cta")}
                </Button>
              </DrawerFooter>
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
