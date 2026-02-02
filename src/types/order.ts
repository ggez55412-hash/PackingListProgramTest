// src/types/order.ts
export type ShipmentStatus = 'Pending' | 'Packed' | 'Shipped' | 'Cancelled'

export interface OrderRow {
  orderId: string
  customer: string
  status: ShipmentStatus
  transporter?: string
  parcelNo?: string
  deliveryDate?: string // ISO string เช่น '2026-01-30'
  weightKg?: number
  deletedAt?: string | null
}

// ให้ Order = OrderRow (ชื่อที่ต่างกันเพื่อให้ Dashboard ใช้ชื่อเดิมได้)
export type Order = OrderRow