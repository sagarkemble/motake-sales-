import { InfoIcon } from "lucide-react";

export function GatepassInfoBanner() {
  return (
    <div className="flex items-start gap-2 rounded-2xl bg-brand/5 p-3">
      <InfoIcon className="mt-0.5 size-4 shrink-0 text-brand" />
      <p className="text-xs text-muted-foreground">
        Only Book Now orders deduct from Gate Pass. Pre-orders do not affect Gate Pass.
      </p>
    </div>
  );
}
