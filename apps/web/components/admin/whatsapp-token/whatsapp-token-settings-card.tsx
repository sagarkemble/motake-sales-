"use client";

import { PencilIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { useTranslate } from "~/hooks/use-translate";
import { useWhatsAppToken } from "~/hooks/use-whatsapp-token";

import { PauseSummary, WhatsAppTokenDialog } from "./whatsapp-token-dialog";

/**
 * The WhatsApp access token on the Settings Seller tab, under Bank details: what is happening and
 * an Update button that opens the same dialog as the Admin banner (Vault save, send waiting), so
 * the Admin can replace the token before it stops working.
 */
export function WhatsAppTokenSettingsCard() {
  const tx = useTranslate();
  const [open, setOpen] = useState(false);
  const { status, isStatusLoading } = useWhatsAppToken();

  return (
    <section className="rounded-2xl border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-medium">{tx("admin.whatsappToken.settingsCard.title")}</h2>
        <Button size="sm" variant="outline" className="rounded-full" onClick={() => setOpen(true)}>
          <PencilIcon />
          {tx("admin.whatsappToken.settingsCard.update")}
        </Button>
      </div>
      {isStatusLoading ? (
        <Skeleton className="h-5 w-3/4 rounded-md" />
      ) : (
        <div className="flex flex-col gap-1">
          {status && <PauseSummary status={status} />}
          <p className="text-sm text-muted-foreground">
            {tx("admin.whatsappToken.settingsCard.hint")}
          </p>
        </div>
      )}
      <WhatsAppTokenDialog open={open} onOpenChange={setOpen} />
    </section>
  );
}
