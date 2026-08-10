type OrderStatus = "confirmed" | "scheduled" | "due" | "fulfilled" | "cancelled";

export function isPreorderPending(status: OrderStatus): boolean {
  return status !== "fulfilled" && status !== "cancelled";
}
