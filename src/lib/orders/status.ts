import type { OrderRecord } from "@/lib/services/types";

export type OrderStatus = OrderRecord["status"];
export type MutableOrderStatus = Exclude<OrderStatus, "pending">;

const nextStatuses: Record<OrderStatus, MutableOrderStatus[]> = {
  pending: ["processing", "cancelled"],
  processing: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export function getAllowedNextOrderStatuses(status: OrderStatus): MutableOrderStatus[] {
  return nextStatuses[status];
}
