import { useFormatDate } from "~/hooks/use-format-date";

interface GatepassTodayHeaderCardProps {
  totalAllocatedQty: number;
  totalRemainingQty: number;
}

export function GatepassTodayHeaderCard({
  totalAllocatedQty,
  totalRemainingQty,
}: GatepassTodayHeaderCardProps) {
  const formatDate = useFormatDate();

  return (
    <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Today's Gate Pass</p>
        <span className="rounded-full bg-brand/10 px-2.5 py-1 text-xs font-medium text-brand">
          Active
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{formatDate(new Date(), "d MMM yyyy")}</p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="text-xs text-muted-foreground">Total items</p>
          <p className="text-lg font-semibold">{totalAllocatedQty}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Remaining items</p>
          <p className="text-lg font-semibold">{totalRemainingQty}</p>
        </div>
      </div>
    </div>
  );
}
