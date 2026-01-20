export interface PalletRow {
  Position: string | number
  'Position ident': string
  BarCodeNumber: string
  'Position Detail': string
  IdentNumber: string
  Detail: string
  Type: 'EP' | 'MHL' | 'PD' | string
  Weight?: number | null
  Unit?: string | null
  QTY?: number | null
  'Pallet Number'?: string | null
  'Work Number'?: string | null
  'Seal Number'?: string | null
  ContainerNumber?: string | null
  __lineWeightKg?: number | null
}
