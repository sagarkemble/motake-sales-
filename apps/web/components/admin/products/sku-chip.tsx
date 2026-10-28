"use client";

import { CheckIcon, CopyIcon, LockIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { useTranslate } from "~/hooks/use-translate";
import { cn } from "~/lib/utils";

interface SkuChipProps {
  sku: string;
  muted?: boolean;
  className?: string;
}

/** Read-only Variety SKU with a copy button. The server mints it; Admin never types it. */
export function SkuChip({ sku, muted, className }: SkuChipProps) {
  const tx = useTranslate();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 1200);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(sku);
      setCopied(true);
    } catch {
      // Clipboard can be blocked; the chip still shows the SKU to copy by hand.
    }
  }

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-md border bg-muted/40 py-0.5 pl-1.5 pr-0.5 font-mono text-[11px]",
        muted && "opacity-60",
        className,
      )}
    >
      <span className="truncate">{sku}</span>
      <button
        type="button"
        onClick={handleCopy}
        aria-label={tx("admin.varieties.copySkuAria", { sku })}
        className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 hover:bg-background hover:text-foreground"
      >
        {copied ? <CheckIcon className="size-3 text-brand" /> : <CopyIcon className="size-3" />}
      </button>
    </span>
  );
}

/** The SKU inside the Variety edit form: locked, with the reason it never changes. */
export function LockedSku({ sku }: { sku: string }) {
  const tx = useTranslate();

  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-dashed bg-muted/30 p-3">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <LockIcon className="size-3.5" />
        {tx("admin.varieties.skuFixed")}
      </div>
      <SkuChip sku={sku} className="self-start text-xs" />
      <p className="text-[11px] text-muted-foreground">{tx("admin.varieties.skuNeverChanges")}</p>
    </div>
  );
}
