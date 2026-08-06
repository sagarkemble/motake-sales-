import { Grid2x2Icon, PackageIcon, ShoppingCartIcon } from "lucide-react";

interface GatepassQuickStatsProps {
  totalAllocatedQty: number;
  totalSoldQty: number;
  totalRemainingQty: number;
}

export function GatepassQuickStats({
  totalAllocatedQty,
  totalSoldQty,
  totalRemainingQty,
}: GatepassQuickStatsProps) {
  const stats = [
    { label: "Total items allocated", value: totalAllocatedQty, icon: Grid2x2Icon },
    { label: "Sold items (Book Now)", value: totalSoldQty, icon: ShoppingCartIcon },
    { label: "Remaining items", value: totalRemainingQty, icon: PackageIcon },
  ];

  return (
    <div className="grid grid-cols-3 gap-2">
      {stats.map((stat) => (
        <div key={stat.label} className="flex flex-col gap-2 rounded-2xl border bg-card p-3">
          <stat.icon className="size-4 text-brand" />
          <p className="text-lg font-semibold">{stat.value}</p>
          <p className="text-xs leading-tight text-muted-foreground">{stat.label}</p>
        </div>
      ))}
    </div>
  );
}
