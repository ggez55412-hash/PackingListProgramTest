// src/stores/pallets.ts
import { defineStore } from 'pinia'
import type { PalletRow } from '@/types/palletrow'
import type { Pallet, PalletStatus, ISODateTimeString } from '@/types/pallet'
import { normalizeUnit, parseNumberLoose, lineWeightKg } from '@/utils/uom'

/** ใช้ใน PalletBoard / export labels */
export type PalletSummary = {
  pallet: string
  status: PalletStatus
  lines: number
  weightKg: number
  maxKg: number
  warn: boolean
  updatedAt?: ISODateTimeString
}

type PalletMeta = {
  status: PalletStatus
  transporter?: string
  createdAt: ISODateTimeString
  updatedAt?: ISODateTimeString
  maxWeightKg?: number
}

// ----------------- helpers -----------------
function nowIso(): ISODateTimeString {
  return new Date().toISOString()
}

/** runtime order id สำหรับ join กับ OrderRow.orderId */
function getRowOrderId(r: PalletRow): string {
  return (
    (r['Work Number'] && String(r['Work Number']).trim()) ||
    (r.BarCodeNumber && String(r.BarCodeNumber).trim()) ||
    (r.IdentNumber && String(r.IdentNumber).trim()) ||
    String(r.Position)
  )
}

/** สำคัญ: หากว่างให้คืน undefined (อย่ากลายเป็น '—') */
function getRowPalletId(r: PalletRow): string | undefined {
  const v = (r as any)['Pallet Number']
  const s = v == null ? '' : String(v).trim()
  return s ? s : undefined
}

function isShipped(meta?: PalletMeta) {
  return meta?.status === 'Shipped'
}

/** รับประกันว่ามี meta object แล้ว (กัน undefined) */
function ensureMetaObj(
  store: { metaByPallet: Record<string, PalletMeta> },
  key: string,
): PalletMeta {
  const existing = store.metaByPallet[key]
  if (existing) return existing
  const created: PalletMeta = {
    status: 'Open',
    transporter: undefined,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    maxWeightKg: undefined,
  }
  store.metaByPallet[key] = created
  return created
}

/** นับจำนวนแถวในพาเลท โดยไม่อิง getter (กัน TS/this context) */
function countRowsInPallet(rows: PalletRow[], key: string): number {
  let c = 0
  for (const r of rows) if (getRowPalletId(r) === key) c++
  return c
}

// ----------------- store -----------------
export const usePalletsStore = defineStore('pallets', {
  state: () => ({
    /** แถวดิบจาก Excel/CSV */
    rows: [] as PalletRow[],

    /** กติกาน้ำหนัก (kg) */
    palletMaxKg: 1000,
    containerMaxKg: 24000,

    /** ข้อมูล runtime ต่อพาเลท (นอกเหนือจาก CSV) */
    metaByPallet: {} as Record<string, PalletMeta>,
  }),

  getters: {
    /** แถวที่ยังไม่อยู่ในพาเลท (unassigned) */
    unassignedRows(state): PalletRow[] {
      return state.rows.filter((r) => !getRowPalletId(r))
    },

    /** group แถวตาม Pallet Number */
    byPallet(state): Map<string, PalletRow[]> {
      const m = new Map<string, PalletRow[]>()
      for (const r of state.rows) {
        const key = getRowPalletId(r)
        if (!key) continue
        const arr = m.get(key)
        if (arr) arr.push(r)
        else m.set(key, [r])
      }
      return m
    },

    /** สรุปสำหรับหน้า Pallet board */
    palletsSummary(): PalletSummary[] {
      const map = this.byPallet as Map<string, PalletRow[]>
      const out: PalletSummary[] = []

      for (const [pallet, list] of map.entries()) {
        const weight = list.reduce<number>((total, row) => total + (row.__lineWeightKg ?? 0), 0)
        const meta = this.metaByPallet[pallet]
        const maxKg = meta?.maxWeightKg ?? this.palletMaxKg
        const status: PalletStatus = meta?.status ?? 'Open'
        const updatedAt = meta?.updatedAt

        out.push({
          pallet,
          status,
          lines: list.length,
          weightKg: +weight.toFixed(2),
          maxKg,
          warn: weight > maxKg,
          updatedAt,
        })
      }

      // จัดเรียง: ที่ over ก่อน แล้วค่อยหนักมาก -> น้อย
      return out.sort((a, b) => Number(b.warn) - Number(a.warn) || b.weightKg - a.weightKg)
    },

    /** ตรวจคุณภาพข้อมูล (เช่น unit/weight/qty) */
    errors(state): { idx: number; reason: string }[] {
      const arr: { idx: number; reason: string }[] = []
      state.rows.forEach((r, i) => {
        if (r.Weight == null || r.QTY == null) arr.push({ idx: i, reason: 'Missing weight/qty' })
        if (r.Unit && r.Unit !== 'Kg') arr.push({ idx: i, reason: `Unit not Kg: ${r.Unit}` })
      })
      return arr
    },

    /** สร้าง Pallet (runtime model) จาก CSV rows + meta */
    byId(state): (id: string) => Pallet | null {
      return (id: string) => {
        const idStr = String(id)
        const meta = state.metaByPallet[idStr]
        const rows = (this.byPallet.get(idStr) ?? []) as PalletRow[]

        if (!meta && rows.length === 0) return null

        const orderIds = rows.map(getRowOrderId)
        const createdAt = meta?.createdAt ?? nowIso()
        const updatedAt = meta?.updatedAt
        const status: PalletStatus = meta?.status ?? 'Open'
        const transporter = meta?.transporter
        const maxWeightKg = meta?.maxWeightKg ?? state.palletMaxKg

        const pallet: Pallet = {
          id: idStr,
          status,
          transporter,
          createdAt,
          orderIds,
          maxWeightKg,
          updatedAt,
        }
        return pallet
      }
    },
  },

  actions: {
    // --------------- CSV / raw-domain ---------------
    replaceAll(rows: PalletRow[]) {
      this.rows = rows.map((r) => {
        const Unit = normalizeUnit(r.Unit || 'Kg') || 'Kg'
        const Weight = parseNumberLoose(r.Weight)
        const QTY = parseNumberLoose(r.QTY)
        return { ...r, Unit, Weight, QTY, __lineWeightKg: lineWeightKg(Weight, QTY) }
      })
    },

    bulkFix() {
      this.rows = this.rows.map((r) => {
        const Unit = normalizeUnit(r.Unit || 'Kg') || 'Kg'
        const Weight = parseNumberLoose(r.Weight)
        const QTY = parseNumberLoose(r.QTY)
        return { ...r, Unit, Weight, QTY, __lineWeightKg: lineWeightKg(Weight, QTY) }
      })
    },

    splitPalletOverMax(pallet: string) {
      const key = String(pallet)
      const meta = ensureMetaObj(this, key)
      if (isShipped(meta)) return

      const list = this.rows.filter((r) => getRowPalletId(r) === key)
      const maxKg = meta.maxWeightKg ?? this.palletMaxKg
      let total = list.reduce<number>((sum, row) => sum + (row.__lineWeightKg ?? 0), 0)
      if (total <= maxKg) return

      let suffix = 1
      let cur = 0
      let newPallet = `${key}-S${suffix}`

      for (const r of list.slice().reverse()) {
        const w = r.__lineWeightKg ?? 0
        if (total <= maxKg) break
        if (cur + w > maxKg) {
          suffix++
          cur = 0
          newPallet = `${key}-S${suffix}`
        }
        ;(r as any)['Pallet Number'] = newPallet
        cur += w
        total -= w
      }

      meta.updatedAt = nowIso()
      this.bulkFix()
    },

    // --------------- Runtime / UI ---------------
    async fetchOne(id: string) {
      ensureMetaObj(this, String(id))
      return this.byId(String(id))
    },

    setTransporter(id: string, transporter?: string) {
      const key = String(id)
      const meta = ensureMetaObj(this, key)
      if (isShipped(meta)) return
      meta.transporter = transporter
      meta.updatedAt = nowIso()
    },

    setMaxWeight(id: string, kg?: number) {
      const key = String(id)
      const meta = ensureMetaObj(this, key)
      if (isShipped(meta)) return
      meta.maxWeightKg = kg
      meta.updatedAt = nowIso()
    },

    /**
     * เพิ่มออเดอร์เข้า pallet (อิงจาก orderIds)
     * คืนจำนวน "แถว" ที่ถูกย้าย (ไม่ใช่จำนวน order)
     */
    addOrders(id: string, orderIds: string[]) {
      const key = String(id)
      const meta = ensureMetaObj(this, key)
      if (isShipped(meta)) return 0

      const set = new Set(orderIds.map(String))
      let movedRows = 0

      for (const r of this.rows) {
        const oid = getRowOrderId(r)
        if (set.has(oid)) {
          ;(r as any)['Pallet Number'] = key
          movedRows++
        }
      }

      if (movedRows > 0) {
        // Packed ให้เกิดจากการกด pack() เท่านั้น (ถ้าอยาก auto เป็น Packed แก้ตรงนี้)
        if (meta.status !== 'Shipped') meta.status = 'Open'
        meta.updatedAt = nowIso()
        this.bulkFix()
      }

      return movedRows
    },

    /**
     * เอาออเดอร์ออกจาก pallet → เคลียร์ Pallet Number เป็น '' (unassigned)
     */
    removeOrders(id: string, orderIds: string[]) {
      const key = String(id)
      const meta = ensureMetaObj(this, key)
      if (isShipped(meta)) return 0

      const set = new Set(orderIds.map(String))
      let removedRows = 0

      for (const r of this.rows) {
        if (getRowPalletId(r) === key) {
          const oid = getRowOrderId(r)
          if (set.has(oid)) {
            ;(r as any)['Pallet Number'] = '' // 🚫 อย่าใช้ null → จะกลายเป็น pallet '—'
            removedRows++
          }
        }
      }

      if (removedRows > 0) {
        meta.status = 'Open'
        meta.updatedAt = nowIso()
        this.bulkFix()
      }

      return removedRows
    },

    /** ปิด pallet เป็น Packed (ยังแก้/ship ต่อได้ตามกติกาคุณ) */
    pack(id: string) {
      const key = String(id)
      const meta = ensureMetaObj(this, key)
      if (isShipped(meta)) return
      const hasLines = countRowsInPallet(this.rows, key) > 0
      if (!hasLines) return
      meta.status = 'Packed'
      meta.updatedAt = nowIso()
    },

    /** ส่งออกแล้ว → lock */
    markShipped(id: string) {
      const key = String(id)
      const meta = ensureMetaObj(this, key)
      meta.status = 'Shipped'
      meta.updatedAt = nowIso()
    },

    /** เปิดใหม่ (กรณีเปลี่ยนใจ) */
    reopen(id: string) {
      const key = String(id)
      const meta = ensureMetaObj(this, key)
      const hasLines = countRowsInPallet(this.rows, key) > 0
      meta.status = hasLines ? 'Open' : 'Open' // (ตอนนี้ไม่มีสถานะ Empty แยก)
      meta.updatedAt = nowIso()
    },
  },
})