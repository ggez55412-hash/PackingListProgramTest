import type { OrderRow, ShipmentStatus } from '@/types/order'

const headers = [
  'orderId',
  'customer',
  'status',
  'transporter',
  'parcelNo',
  'deliveryDate',
  'weightKg',
] as const

export function toCSV(rows: OrderRow[]): string {
  const head = headers.join(',')
  const body = rows.map((r) => {
    const fields = headers.map((h) => {
      const v = (r as any)[h] ?? ''
      // escape ถ้ามี comma/double-quote/newline
      const s = String(v)
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
      return s
    })
    return fields.join(',')
  })
  return [head, ...body].join('\r\n')
}

export function parseCSV(text: string): OrderRow[] {
  // แบ่งบรรทัด (รองรับ \r\n และ BOM)
  const src = text.replace(/^\uFEFF/, '')
  const lines = src.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length === 0) return []

  const first = lines[0].split(',').map((s) => s.trim())
  const requiredOk = headers.every((h) => first.includes(h))
  if (!requiredOk) throw new Error('หัวคอลัมน์ไม่ครบ: ' + headers.join(','))

  const idx: Record<string, number> = {}
  headers.forEach((h) => {
    idx[h] = first.indexOf(h)
  })

  const rows: OrderRow[] = []
  for (let i = 1; i < lines.length; i++) {
    // parser อย่างง่าย: แยกด้วยคอมมา; ถ้าต้องรองรับ "..." มีคอมมาในข้อความ ให้ใช้ parser ขั้นสูงภายหลัง
    const cols = splitCsvLine(lines[i])
    if (cols.length < first.length) continue
    const status = (cols[idx.status] || 'Pending').trim() as ShipmentStatus
    const weight = cols[idx.weightKg] ? Number(cols[idx.weightKg]) : undefined
    rows.push({
      orderId: cols[idx.orderId].trim(),
      customer: cols[idx.customer].trim(),
      status: status === 'Shipped' ? 'Shipped' : 'Pending',
      transporter: cols[idx.transporter]?.trim() || undefined,
      parcelNo: cols[idx.parcelNo]?.trim() || undefined,
      deliveryDate: cols[idx.deliveryDate]?.trim() || undefined,
      weightKg: isFinite(Number(weight)) ? Number(weight) : undefined,
    })
  }
  return rows
}

// ตัวแยก CSV หนึ่งบรรทัด รองรับ "" escaping
function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuote) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } // escaped quote
        else {
          inQuote = false
        }
      } else cur += ch
    } else {
      if (ch === ',') {
        out.push(cur)
        cur = ''
      } else if (ch === '"') inQuote = true
      else cur += ch
    }
  }
  out.push(cur)
  return out
}
