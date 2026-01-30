// src/utils/xlsx.ts
import * as XLSX from 'xlsx'
import type { PalletRow } from '@/types/palletrow'

/** อ่าน Excel (.xlsx) แล้วคืนเป็น PalletRow[] จากชีตแรก (ปลอดภัยต่อ TS) */
export async function parseXlsx(file: File): Promise<PalletRow[]> {
  // โหลดเป็น ArrayBuffer (Browser File API)
  const data = await file.arrayBuffer()

  // อ่านเวิร์กบุ๊กจาก buffer
  const wb = XLSX.read(data, { type: 'array' })

  // ชื่อชีตแรก (เช็คให้ชัวร์)
  const sheetName = wb.SheetNames?.[0]
  if (!sheetName) {
    throw new Error('Excel file has no sheets.')
  }

  // ชีตตามชื่อ
  const sheet = wb.Sheets[sheetName]
  if (!sheet) {
    throw new Error('Sheet not found.')
  }

  // แปลงเป็น JSON (defval=null เพื่อคงคอลัมน์ว่าง, raw=false ให้ parse text เป็นค่ามาตรฐาน)
  const json = XLSX.utils.sheet_to_json<any>(sheet, {
    defval: null,
    raw: false,
  })

  return json as PalletRow[]
}

/** โครงข้อมูลสรุปพาเลท ที่ใช้สร้างชีต Pallets ตอน export */
export type PalletSummaryForXlsx = {
  pallet: string
  status?: string
  lines: number
  weightKg: number
  maxKg: number
  warn?: boolean
  updatedAt?: string
}

/**
 * ส่งออก Excel สองชีต:
 *  - Pallets: สรุปพาเลท (pallet, status, lines, weightKg, maxKg, warn, updatedAt)
 *  - Rows:    แถวดิบทั้งหมดจากไฟล์นำเข้า (เพื่อ trace ย้อนกลับ)
 */
export function exportPalletsToXlsx(
  palletsSummary: PalletSummaryForXlsx[],
  rows: PalletRow[],
  filename = 'pallets_export.xlsx'
): void {
  // แปลงสรุปพาเลทให้เป็นตารางง่าย ๆ
  const palletsSheet = XLSX.utils.json_to_sheet(
    (palletsSummary ?? []).map((p) => ({
      Pallet: p.pallet,
      Status: p.status ?? '',
      Lines: p.lines,
      WeightKg: p.weightKg,
      MaxKg: p.maxKg,
      Warn: !!p.warn,
      UpdatedAt: p.updatedAt ?? '',
    }))
  )

  // ชีต Rows = ข้อมูลดิบทั้งหมด
  const rowsSheet = XLSX.utils.json_to_sheet(rows ?? [])

  // ประกอบ workbook
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, palletsSheet, 'Pallets')
  XLSX.utils.book_append_sheet(wb, rowsSheet, 'Rows')

  // เขียนไฟล์ออก
  XLSX.writeFile(wb, filename)
}