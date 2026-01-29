
export type PalletStatus = 'Open' | 'Packed' | 'Shipped'
export type ISODateTimeString = string // e.g. '2026-01-29T08:49:35+07:00'
export interface Pallet {
  id: string
  status: PalletStatus
  transporter?: string
  createdAt: ISODateTimeString
  orderIds: string[]
  maxWeightKg: number
  updatedAt?: ISODateTimeString
}
