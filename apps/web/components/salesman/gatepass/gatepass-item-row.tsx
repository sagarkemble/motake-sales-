import { PackageIcon } from "lucide-react";

interface GatepassItemRowProps {
  productName: string;
  varietyName: string;
  unit: string;
  issuedQty: number;
  soldQty: number;
  remainingQty: number;
}

export function GatepassItemRow({
  productName,
  varietyName,
  unit,
  issuedQty,
  soldQty,
  remainingQty,
}: GatepassItemRowProps) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border bg-card p-3">
      <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted/40">
        <PackageIcon className="size-5 text-muted-foreground" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{productName}</p>
        <p className="truncate text-xs text-muted-foreground">
          {varietyName} ({unit})
        </p>
      </div>

      <div className="flex gap-4 text-right text-xs">
        <div>
          <p className="text-muted-foreground">Given</p>
          <p className="font-medium">{issuedQty}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Sold</p>
          <p className="font-medium">{soldQty}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Left</p>
          <p className="font-medium">{remainingQty}</p>
        </div>
      </div>
    </div>
  );
}
