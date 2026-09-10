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
      <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
        <Share className="size-4" />
        <span>{tx("common.install.hint")}</span>
      </div>
    );
  }

  if (!canInstall) {
    return null;
  }

  return (
    <Button onClick={promptInstall} variant="outline">
      <Download className="size-4" />
      {tx("common.install.cta")}
    </Button>
  );
}
