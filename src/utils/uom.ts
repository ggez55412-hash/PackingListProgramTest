// src/utils/uom.ts

/** แปลงหน่วยให้เป็นมาตรฐานเดียว (Kg) */
export function normalizeUnit(u?: string | null): 'Kg' | null {
  // ป้องกัน undefined/null
  if (u == null) return null

  // แปลงเป็น string อย่างปลอดภัย
  const s = u?.toString()?.trim()?.toLowerCase() ?? ''
  if (!s) return null

  const kgAliases = new Set([
    'kg',
    'kgs',
    'kilogram',
    'kilograms',
    'กก',
    'กก.',
    'กิโลกรัม'
  ])

  if (kgAliases.has(s)) return 'Kg'

  // คืนค่ารูปแบบ title case (กัน undefined)
  return (s[0]?.toUpperCase() + s.slice(1)) as any
}

/** แปลง string ตัวเลขหลวม ๆ ให้เป็น number */
export function parseNumberLoose(v: any): number | null {
  if (v == null || v === '') return null

  if (typeof v === 'number' && Number.isFinite(v)) return v

  // ใช้ optional chain ทุกตำแหน่ง
  const s =
    v?.toString()
      ?.trim()
      ?.replace(/\u00A0/g, '') // non-breaking space
      ?.replace(/[,\s]+/g, '') ?? ''

  if (!s) return null

  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** น้ำหนักรวมต่อแถว (kg) */
export function lineWeightKg(
  weight?: number | null,
  qty?: number | null
): number | null {
  const w = typeof weight === 'number' ? weight : null
  const q = typeof qty === 'number' ? qty : 1
  if (w == null) return null

  const total = w * q
  return Number.isFinite(total) ? +total.toFixed(3) : null
}