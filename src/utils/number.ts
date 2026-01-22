
// utils/number.ts
export function safeToFixed(input: unknown, digits = 2): string {
  // เคสพบบ่อย: '1,234.5 kg', '1 234', '50kg'
  if (typeof input === 'string') {
    const cleaned = input
      .replace(/[^\d.\-]/g, '')   // ตัดอักษรที่ไม่ใช่ตัวเลข/จุด/เครื่องหมายลบ
      .replace(/(?<=\.\d*)\./g, '') // กันจุดซ้อน
    const n = Number(cleaned)
    return Number.isFinite(n) ? n.toFixed(digits) : (0).toFixed(digits)
  }

  const n = Number(input)
  return Number.isFinite(n) ? n.toFixed(digits) : (0).toFixed(digits)
}

export function toNumberStrict(input: unknown): number {
  if (typeof input === 'string') {
    const cleaned = input.replace(/[^\d.\-]/g, '')
    const n = Number(cleaned)
    return Number.isFinite(n) ? n : NaN
  }
  const n = Number(input)
  return Number.isFinite(n) ? n : NaN
}
``
