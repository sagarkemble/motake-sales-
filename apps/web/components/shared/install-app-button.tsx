"use client";

import { Download, Share } from "lucide-react";

import { Button } from "~/components/ui/button";
import { useInstallPrompt } from "~/hooks/shared/use-install-prompt";
import { useTranslate } from "~/hooks/use-translate";

export function InstallAppButton() {
  const tx = useTranslate();
  const { canInstall, isInstalled, isIos, promptInstall } = useInstallPrompt();

  if (isInstalled) {
    return null;
  }

  if (isIos) {
    return (
      <div className="flex items-start gap-2 rounded-2xl border border-brand/20 bg-brand-faint p-3 text-xs">
        <Share className="mt-0.5 size-4 shrink-0 text-brand" />
        <span className="text-foreground">{tx("common.install.hint")}</span>
      </div>
    );
  }

  if (!canInstall) {
    return null;
  }

  return (
    <Button onClick={promptInstall} variant="outline" className="rounded-full">
      <Download className="size-4" />
      {tx("common.install.cta")}
    </Button>
  );
}
