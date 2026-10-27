import { businessDateOf } from "@repo/trpc/client";

type OrderStatus = "confirmed" | "scheduled" | "due" | "fulfilled" | "cancelled";

export function isPreorderPending(status: OrderStatus): boolean {
  return status !== "fulfilled" && status !== "cancelled";
}

// A Pre-order may be fulfilled on or after its scheduled date (Asia/Kolkata); before that it is
// upcoming and read-only.
export function isFulfilDue(scheduledDate: string | null): boolean {
  return Boolean(scheduledDate) && (scheduledDate ?? "") <= businessDateOf(new Date());
}
