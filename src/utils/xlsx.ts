// src/utils/xlsx.ts
import * as XLSX from 'xlsx'
import type { PalletRow } from '@/types/palletrow'

/* ============================
   Helpers
   ============================ */
function clamp0(input: unknown): number {
  const s = String(input ?? '').replace(',', '.').replace(/[^\d.+-]/g, '').trim()
  if (!s) return 0
  const n = Number(s)
  if (!Number.isFinite(n)) return 0
  return n < 0 ? 0 : n
}
function calcLineWeight(w?: unknown, q?: unknown): number {
  const W = clamp0(w)
  const Q = clamp0(q)
  const v = W * Q
  return Number.isFinite(v) ? v : 0
}
function normalizeUnit(u?: unknown): 'Kg' | null {
  if (u == null) return null
  const s = String(u).replace('\u00A0', ' ').trim().toLowerCase()
  if (s === 'kg' || s === 'kg.') return 'Kg'
  return 'Kg'
}

/* ============================
   EXPORT: parseXlsx  (สำคัญ)
   ============================ */
export async function parseXlsx(file: File): Promise<PalletRow[]> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })

  const sheetName = wb.SheetNames?.[0]
  if (!sheetName) throw new Error('Workbook ไม่มีแผ่นงาน')

  const ws = wb.Sheets[sheetName] as XLSX.WorkSheet
  if (!ws) throw new Error(`ไม่พบแผ่นงานชื่อ: ${sheetName}`)

  const aoa = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null }) as any[][]
  if (!aoa.length) return []

  const headerRow: string[] = (aoa[0] ?? []).map(h => String(h ?? '').trim())
  const dataRows = aoa.slice(1)

  const findAny = (choices: string[]) => {
    const lower = headerRow.map(h => h.toLowerCase())
    for (const c of choices) {
      const idx = lower.indexOf(c.toLowerCase())
      if (idx !== -1) return idx
    }
    return -1
  }

  /* map header → index */
  const mapIndex = {
    Position: findAny(['position', 'pos', 'line', 'line no']),
    PositionIdent: findAny(['position ident', 'position_ident']),
    BarCodeNumber: findAny(['barcodenumber', 'barcode', 'bar code']),
    PositionDetail: findAny(['position detail', 'positiondetail']),
    IdentNumber: findAny(['identnumber', 'ident number', 'ident']),
    Detail: findAny(['detail', 'description', 'item']),
    Type: findAny(['type', 'item type']),
    Weight: findAny(['weight', 'weightkg', 'weight (kg)']),
    Unit: findAny(['unit', 'uom', 'unit of measure']),
    QTY: findAny(['qty', 'quantity']),

    // 🔑 รองรับ alias หลายแบบของ Pallet ID
    PalletNumber: findAny(['pallet number', 'palletnumber', 'pallet no', 'pallet', 'pallet id']),

    WorkNumber: findAny(['work number', 'worknumber']),
    SealNumber: findAny(['seal number', 'sealnumber']),
    ContainerNumber: findAny(['container number', 'containernumber', 'container']),
  }

  const out: PalletRow[] = []
  for (const r of dataRows) {
    const weight = mapIndex.Weight === -1 ? 0 : clamp0(r[mapIndex.Weight])
    const qty = mapIndex.QTY === -1 ? 1 : clamp0(r[mapIndex.QTY])
    const unit = normalizeUnit(mapIndex.Unit === -1 ? 'Kg' : r[mapIndex.Unit])

    out.push({
      Position: mapIndex.Position === -1 ? '' : (r[mapIndex.Position] ?? ''),
      'Position ident': mapIndex.PositionIdent === -1 ? '' : (r[mapIndex.PositionIdent] ?? ''),
      BarCodeNumber: mapIndex.BarCodeNumber === -1 ? '' : (r[mapIndex.BarCodeNumber] ?? ''),
      'Position Detail': mapIndex.PositionDetail === -1 ? '' : (r[mapIndex.PositionDetail] ?? ''),
      IdentNumber: mapIndex.IdentNumber === -1 ? '' : (r[mapIndex.IdentNumber] ?? ''),
      Detail: mapIndex.Detail === -1 ? '' : (r[mapIndex.Detail] ?? ''),
      Type: mapIndex.Type === -1 ? '' : (r[mapIndex.Type] ?? ''),
      Weight: weight,
      Unit: unit,
      QTY: qty,
      'Pallet Number': mapIndex.PalletNumber === -1 ? '' : (r[mapIndex.PalletNumber] ?? ''),
      'Work Number': mapIndex.WorkNumber === -1 ? '' : (r[mapIndex.WorkNumber] ?? ''),
      'Seal Number': mapIndex.SealNumber === -1 ? '' : (r[mapIndex.SealNumber] ?? ''),
      ContainerNumber: mapIndex.ContainerNumber === -1 ? '' : (r[mapIndex.ContainerNumber] ?? ''),
      __lineWeightKg: calcLineWeight(weight, qty),
    })
  }

  return out
}