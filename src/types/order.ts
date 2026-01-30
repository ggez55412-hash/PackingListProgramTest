export type ShipmentStatus = 'Pending' | 'Shipped'

export interface OrderRow {
  orderId: string
  customer: string
  status: ShipmentStatus
  transporter?: string
  parcelNo?: string
  deliveryDate?: string
  weightKg?: number
  deletedAt?: number | null
}
