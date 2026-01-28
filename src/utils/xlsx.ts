import * as XLSX from 'xlsx'
import type { PalletRow } from '@/types/palletrow'
import { parseNumberLoose, normalizeUnit, lineWeightKg } from '@/utils/uom'

export async function parseXlsx(file: File): Promise<PalletRow[]> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })

  const sheetName = wb.SheetNames?.[0]
  if (!sheetName) throw new Error('Workbook ไม่มีแผ่นงาน')
  const ws = wb.Sheets[sheetName] as XLSX.WorkSheet
  if (!ws) throw new Error(`ไม่พบแผ่นงานชื่อ: ${sheetName}`)

  const aoa = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null }) as any[][]
  if (!aoa.length) return []

  const headerRow = (aoa[0] || []).map((h) => String(h ?? '').trim())
  const dataRows = aoa.slice(1)
  const idx = (name: string) => headerRow.findIndex((h) => h === name)

  const mapIndex = {
    Position: idx('Position'),
    PositionIdent: idx('Position ident'),
    BarCodeNumber: idx('BarCodeNumber'),
    PositionDetail: idx('Position Detail'),
    IdentNumber: idx('IdentNumber'),
    Detail: idx('Detail'),
    Type: idx('Type'),
    Weight: idx('Weight'),
    Unit: idx('Unit'),
    QTY: idx('QTY'),
    PalletNumber: idx('Pallet Number'),
    WorkNumber: idx('Work Number'),
    SealNumber: idx('Seal Number'),
    ContainerNumber: idx('ContainerNumber'),
  }

  return dataRows.map((r) => {
    const weight = parseNumberLoose(r[mapIndex.Weight])
    const qty = parseNumberLoose(r[mapIndex.QTY])
    const unit = normalizeUnit(r[mapIndex.Unit])

    const rec: PalletRow = {
      Position: r[mapIndex.Position],
      'Position ident': r[mapIndex.PositionIdent],
      BarCodeNumber: r[mapIndex.BarCodeNumber],
      'Position Detail': r[mapIndex.PositionDetail],
      IdentNumber: String(r[mapIndex.IdentNumber] ?? '').trim(),
      Detail: r[mapIndex.Detail],
      Type: String(r[mapIndex.Type] ?? '').trim(),
      Weight: weight,
      Unit: unit,
      QTY: qty,
      'Pallet Number': r[mapIndex.PalletNumber],
      'Work Number': r[mapIndex.WorkNumber],
      'Seal Number': r[mapIndex.SealNumber],
      ContainerNumber: r[mapIndex.ContainerNumber],
      __lineWeightKg: lineWeightKg(weight, qty),
    }
    return rec
  })
}
