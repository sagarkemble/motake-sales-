"use client";

import { ChevronRightIcon, MessageCircleOffIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { useTranslate } from "~/hooks/use-translate";
import { useWhatsAppToken, type WhatsAppTokenSettings } from "~/hooks/use-whatsapp-token";

import { WhatsAppTokenDialog } from "./whatsapp-token-dialog";

type PausedReason = NonNullable<WhatsAppTokenSettings["pausedReason"]>;

function useBannerCopy(pausedReason: PausedReason, heldCount: number | null) {
  const tx = useTranslate();
  const count =
    heldCount === null
      ? null
      : heldCount === 1
        ? tx("admin.whatsappToken.banner.waitingOne")
        : tx("admin.whatsappToken.banner.waitingOther", { count: heldCount });
  if (pausedReason === "payment") {
    return {
      body: tx("admin.whatsappToken.banner.paymentBody"),
      action: tx("admin.whatsappToken.banner.openPayment"),
      count,
    };
  }
  return {
    body: tx("admin.whatsappToken.banner.tokenBody"),
    action: tx("admin.whatsappToken.banner.fix"),
    count,
  };
}

function Banner({
  pausedReason,
  heldCount,
  onOpen,
}: {
  pausedReason: PausedReason;
  heldCount: number | null;
  onOpen: () => void;
}) {
  const tx = useTranslate();
  const copy = useBannerCopy(pausedReason, heldCount);
  return (
    <div role="alert" className="border-b border-destructive/30 bg-destructive/10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex min-w-0 gap-3">
          <MessageCircleOffIcon className="mt-0.5 size-5 shrink-0 text-destructive" />
          <div className="min-w-0 text-sm">
            <p className="font-medium">
              {tx("admin.whatsappToken.banner.pausedTitle")}
              {copy.count && <span className="text-destructive"> · {copy.count}</span>}
            </p>
            <p className="text-muted-foreground">{copy.body}</p>
          </div>
        </div>
        <Button
          size="sm"
          className="w-full shrink-0 rounded-full bg-brand text-brand-foreground hover:bg-brand/90 sm:w-auto"
          onClick={onOpen}
        >
          {copy.action}
          <ChevronRightIcon />
        </Button>
      </div>
    </div>
  );
}

/**
 * Full-width banner under the Admin navbar on every Admin page while WhatsApp messages are paused
 * (Spec J-0): the access token has expired or was replaced, or the WhatsApp account has a payment
 * problem. Nothing shows while the state is only unknown. Its button opens the token dialog in
 * place. The dialog stays mounted when the banner clears, so the Admin can still send the waiting
 * messages after a save.
 */
export function WhatsAppTokenBanner() {
  const [open, setOpen] = useState(false);
  const { status } = useWhatsAppToken();

  return (
    <>
      {status?.pausedReason && (
        <Banner
          pausedReason={status.pausedReason}
          heldCount={status.heldCount}
          onOpen={() => setOpen(true)}
        />
      )}
      <WhatsAppTokenDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
