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
import { ScrollArea } from "~/components/ui/scroll-area";
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
      <DrawerContent className="data-[vaul-drawer-direction=bottom]:max-h-[90dvh]">
        <div className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col">
          {fulfil.result ? (
            <ScrollArea className="flex min-h-0 flex-1 flex-col [&>[data-slot=scroll-area-viewport]>div]:block!">
              <DrawerHeader className="sr-only">
                <DrawerTitle>{tx("checkout.success.fulfilled")}</DrawerTitle>
              </DrawerHeader>
              <CheckoutSuccess
                input={fulfil.result}
                whatsapp
                actions={[{ label: tx("checkout.success.done"), primary: true, onClick: onClose }]}
              />
            </ScrollArea>
          ) : (
            <>
              <DrawerHeader className="text-left">
                <DrawerTitle>{tx("checkout.fulfil.title", { shop: target.shopName })}</DrawerTitle>
                <DrawerDescription>{target.description}</DrawerDescription>
              </DrawerHeader>
              <ScrollArea className="flex min-h-0 flex-1 flex-col [&>[data-slot=scroll-area-viewport]>div]:block!">
                <div className="flex flex-col gap-4 px-4 pb-4">
                  <LockedLines
                    state={fulfil}
                    shopName={target.shopName}
                    scheduledDate={target.scheduledDate}
                    placedAt={target.placedAt}
                  />
                  <FulfilPayment state={fulfil} shopName={target.shopName} />
                </div>
              </ScrollArea>
              <DrawerFooter>
                {hint && <p className="text-center text-xs text-muted-foreground">{hint}</p>}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full"
                    disabled={fulfil.isFulfilling}
                    onClick={onClose}
                  >
                    {tx("common.actions.cancel")}
                  </Button>
                  <Button
                    type="button"
                    className="flex-1 rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
                    disabled={!fulfil.paymentContext || Boolean(hint) || fulfil.isFulfilling}
                    onClick={() => void fulfil.fulfil()}
                  >
                    {fulfil.isFulfilling
                      ? tx("common.status.pleaseWait")
                      : tx("checkout.fulfil.cta")}
                  </Button>
                </div>
              </DrawerFooter>
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
