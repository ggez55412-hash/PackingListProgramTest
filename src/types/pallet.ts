
export type PalletStatus = 'Open' | 'Packed' | 'Shipped'

export interface Pallet {
  id: string
  status: PalletStatus
  transporter?: string
  createdAt: string
  orderIds: string[]
  maxWeightKg: number
}
