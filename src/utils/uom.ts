export function normalizeUnit(u?: string | null): string | null {
  if (!u) return null
  const s = String(u).replace('\u00A0', ' ').trim()
  if (s.toLowerCase() === 'kg.' || s.toLowerCase() === 'kg') return 'Kg'
  return s
}

export function parseNumberLoose(input: any): number | null {
  if (input == null) return null
  const s = String(input)
    .replace(',', '.')
    .replace(/[^\d.+-]/g, '')
    .trim()
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export function lineWeightKg(weight?: number | null, qty?: number | null): number | null {
  if (weight == null || qty == null) return null
  const n = weight * qty
  return Number.isFinite(n) ? n : null
}
