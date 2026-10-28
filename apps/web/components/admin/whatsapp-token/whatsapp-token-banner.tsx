"use client";

import { ChevronRightIcon, CircleHelpIcon, MessageCircleOffIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { useTranslate } from "~/hooks/use-translate";
import { useWhatsAppToken, type WhatsAppTokenSettings } from "~/hooks/use-whatsapp-token";
import { cn } from "~/lib/utils";

import { WhatsAppTokenDialog } from "./whatsapp-token-dialog";

function useBannerCopy(status: WhatsAppTokenSettings) {
  const tx = useTranslate();
  const held = status.heldCount ?? 0;
  const count =
    status.heldCount === null || (status.state !== "invalid" && held === 0)
      ? null
      : held === 1
        ? tx("admin.whatsappToken.banner.waitingOne")
        : tx("admin.whatsappToken.banner.waitingOther", { count: held });
  if (status.state === "invalid") {
    return {
      title: tx("admin.whatsappToken.banner.pausedTitle"),
      body: tx("admin.whatsappToken.banner.pausedBody"),
      action: tx("admin.whatsappToken.banner.fix"),
      count,
    };
  }
  if (status.state === "unavailable") {
    return {
      title: tx("admin.whatsappToken.banner.metaUnreachableTitle"),
      body: tx("admin.whatsappToken.banner.metaUnreachableBody"),
      action: tx("admin.whatsappToken.banner.open"),
      count,
    };
  }
  return {
    title: tx("admin.whatsappToken.banner.unknownTitle"),
    body: tx("admin.whatsappToken.banner.unknownBody"),
    action: tx("admin.whatsappToken.banner.open"),
    count: null,
  };
}

function Banner({ status, onFix }: { status: WhatsAppTokenSettings; onFix: () => void }) {
  const copy = useBannerCopy(status);
  const invalid = status.state === "invalid";
  const Icon = invalid ? MessageCircleOffIcon : CircleHelpIcon;
  return (
    <div
      role="alert"
      className={cn("border-b", invalid ? "border-destructive/30 bg-destructive/10" : "bg-muted")}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex min-w-0 gap-3">
          <Icon
            className={cn(
              "mt-0.5 size-5 shrink-0",
              invalid ? "text-destructive" : "text-muted-foreground",
            )}
          />
          <div className="min-w-0 text-sm">
            <p className="font-medium">
              {copy.title}
              {copy.count && <span className="text-destructive"> · {copy.count}</span>}
            </p>
            <p className="text-muted-foreground">{copy.body}</p>
          </div>
        </div>
        <Button
          size="sm"
          className="w-full shrink-0 rounded-full bg-brand text-brand-foreground hover:bg-brand/90 sm:w-auto"
          onClick={onFix}
        >
          {copy.action}
          <ChevronRightIcon />
        </Button>
      </div>
    </div>
  );
}

/**
 * Full-width banner under the Admin navbar on every Admin page while the WhatsApp access token is
 * not working (Spec J-0). "Fix access token" opens the token dialog in place. The dialog stays
 * mounted when the banner clears, so the Admin can still send the waiting messages after a save.
 */
export function WhatsAppTokenBanner() {
  const [open, setOpen] = useState(false);
  const { status } = useWhatsAppToken();

  return (
    <>
      {status && status.state !== "ok" && <Banner status={status} onFix={() => setOpen(true)} />}
      <WhatsAppTokenDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
