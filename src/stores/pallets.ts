// src/stores/pallets.ts
import { defineStore } from 'pinia'
import type { PalletRow } from '@/types/palletrow'
import type { Pallet, PalletStatus, ISODateTimeString } from '@/types/pallet'
import { normalizeUnit, parseNumberLoose, lineWeightKg } from '@/utils/uom'

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
    ((r as any).orderId && String((r as any).orderId).trim()) ||
    ((r as any).OrderId && String((r as any).OrderId).trim()) ||
    ((r as any)['Work Number'] && String((r as any)['Work Number']).trim()) ||
    ((r as any).BarCodeNumber && String((r as any).BarCodeNumber).trim()) ||
    ((r as any).IdentNumber && String((r as any).IdentNumber).trim()) ||
    String((r as any).Position ?? '')
  )
}

/** หากว่างให้คืน undefined + รองรับ alias */
function getRowPalletId(r: PalletRow): string | undefined {
  const v =
    (r as any)['Pallet Number'] ??
    (r as any).PalletNumber ??
    (r as any).pallet ??
    (r as any).Pallet
  const s = v == null ? '' : String(v).trim()
  return s || undefined
}

function isShipped(meta?: PalletMeta) {
  return meta?.status === 'Shipped'
}

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

function countRowsInPallet(rows: PalletRow[], key: string): number {
  let c = 0
  for (const r of rows) if (getRowPalletId(r) === key) c++
  return c
}

/** น้ำหนักรวมของพาเลท (กก.) */
function getPalletWeight(rows: PalletRow[], key: string): number {
  let sum = 0
  for (const r of rows) if (getRowPalletId(r) === key) sum += (r as any).__lineWeightKg ?? 0
  return +sum.toFixed(2)
}

// ----------------- store -----------------
export const usePalletsStore = defineStore('pallets', {
  state: () => ({
    rows: [] as PalletRow[],
    palletMaxKg: 1000,
    containerMaxKg: 24000,
    metaByPallet: {} as Record<string, PalletMeta>,
  }),

  getters: {
    unassignedRows(state): PalletRow[] {
      return state.rows.filter((r) => !getRowPalletId(r))
    },

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

    palletsSummary(): PalletSummary[] {
      const map = this.byPallet as Map<string, PalletRow[]>
      const out: PalletSummary[] = []
      for (const [pallet, list] of map.entries()) {
        const weight = list.reduce<number>((t, row) => t + ((row as any).__lineWeightKg ?? 0), 0)
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
      // เรียง: over-weight ก่อน, แล้วตามน้ำหนัก
      return out.sort((a, b) => Number(b.warn) - Number(a.warn) || b.weightKg - a.weightKg)
    },

    errors(state): { idx: number; reason: string }[] {
      const arr: { idx: number; reason: string }[] = []
      state.rows.forEach((r, i) => {
        if ((r as any).Weight == null || (r as any).QTY == null) arr.push({ idx: i, reason: 'Missing weight/qty' })
        if ((r as any).Unit && (r as any).Unit !== 'Kg') arr.push({ idx: i, reason: `Unit not Kg: ${(r as any).Unit}` })
      })
      return arr
    },

    /** ส่ง Pallet พร้อม transporter (จาก meta ก่อน, ถ้าไม่มีลอง fallback จาก CSV rows) */
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

        // 1) ใช้ค่าจาก meta ก่อน
        let transporter = meta?.transporter

        // 2) ถ้ายังไม่มี ลอง fallback จาก CSV rows (ถ้ามีคอลัมน์)
        if (!transporter) {
          const candidate = rows
            .map(r => (r as any).Transporter ?? (r as any).transporter ?? '')
            .map((s: any) => String(s || '').trim())
            .find(Boolean)
          if (candidate) transporter = candidate
        }

        const maxWeightKg = meta?.maxWeightKg ?? state.palletMaxKg
        const pallet: Pallet = { id: idStr, status, transporter, createdAt, orderIds, maxWeightKg, updatedAt }
        return pallet
      }
    },
  },

  actions: {
    replaceAll(rows: PalletRow[]) {
      this.rows = rows.map((r) => {
        const Unit = normalizeUnit((r as any).Unit || 'Kg') || 'Kg'
        const Weight = parseNumberLoose((r as any).Weight)
        const QTY = parseNumberLoose((r as any).QTY)
        return { ...r, Unit, Weight, QTY, __lineWeightKg: lineWeightKg(Weight, QTY) }
      })
    },

    bulkFix() {
      this.rows = this.rows.map((r) => {
        const Unit = normalizeUnit((r as any).Unit || 'Kg') || 'Kg'
        const Weight = parseNumberLoose((r as any).Weight)
        const QTY = parseNumberLoose((r as any).QTY)
        return { ...r, Unit, Weight, QTY, __lineWeightKg: lineWeightKg(Weight, QTY) }
      })
    },

    addRows(newRows: PalletRow[]) {
      const normalized = newRows.map((r) => {
        const Unit = normalizeUnit((r as any).Unit || 'Kg') || 'Kg'
        const Weight = parseNumberLoose((r as any).Weight)
        const QTY = parseNumberLoose((r as any).QTY)
        return { ...r, Unit, Weight, QTY, __lineWeightKg: lineWeightKg(Weight, QTY) }
      })
      this.rows.push(...normalized)
    },

    /** แยกพาเลทที่ overweight ออกเป็น ...-S1, -S2,... (จากท้ายรายการขึ้นก่อน)
     * @returns number จำนวนแถวที่ถูกย้าย (0 = ไม่ได้ย้ายอะไร: ไม่ over / locked / ไม่มีแถว)
     */
    splitPalletOverMax(pallet: string): number {
      const key = String(pallet)
      const meta = ensureMetaObj(this, key)
      if (isShipped(meta)) return 0

      const list = this.rows.filter((r) => getRowPalletId(r) === key)
      if (list.length === 0) return 0

      const maxKg = meta.maxWeightKg ?? this.palletMaxKg
      let total = list.reduce<number>((sum, row) => sum + ((row as any).__lineWeightKg ?? 0), 0)
      if (!(Number.isFinite(maxKg) && maxKg > 0)) return 0
      if (total <= maxKg) return 0

      let suffix = 1
      let cur = 0
      let newPallet = `${key}-S${suffix}`
      let moved = 0

      for (const r of list.slice().reverse()) {
        const w = (r as any).__lineWeightKg ?? 0
        if (total <= maxKg) break
        if (cur + w > maxKg) {
          suffix++
          cur = 0
          newPallet = `${key}-S${suffix}`
        }
        ;(r as any)['Pallet Number'] = newPallet
        moved++

        // ensure meta ใหม่ และคัดลอก setting พื้นฐาน
        const newMeta = ensureMetaObj(this, newPallet)
        if (newMeta.createdAt === newMeta.updatedAt) { // เพิ่งสร้าง
          newMeta.maxWeightKg = meta.maxWeightKg ?? this.palletMaxKg
          newMeta.transporter = meta.transporter
          newMeta.status = 'Open'
        }
        newMeta.updatedAt = nowIso()

        cur += w
        total -= w
      }

      if (moved > 0) {
        meta.updatedAt = nowIso()
        this.bulkFix()
      }
      return moved
    },

    // --------- Runtime / UI ----------
    async fetchOne(id: string) {
      ensureMetaObj(this, String(id))
      return this.byId(String(id))
    },

    setTransporter(id: string, transporter?: string) {
      const key = String(id)
      const meta = ensureMetaObj(this, key)
      if (isShipped(meta)) return
      meta.transporter = transporter?.trim() || undefined
      meta.updatedAt = nowIso()
    },

    setMaxWeight(id: string, kg?: number) {
      const key = String(id)
      const meta = ensureMetaObj(this, key)
      if (isShipped(meta)) return
      meta.maxWeightKg = typeof kg === 'number' && Number.isFinite(kg) && kg > 0 ? kg : undefined
      meta.updatedAt = nowIso()
    },

    /** เพิ่มออเดอร์เข้า pallet (ฉลาด: ถ้ายังไม่มีแถว -> สร้างให้เองและผูกเข้า pallet) */
    addOrders(id: string, orderIds: string[]) {
      const key = String(id)
      const meta = ensureMetaObj(this, key)
      if (isShipped(meta)) return 0

      const want = Array.from(new Set(orderIds.map(String)))
      const haveSet = new Set(this.rows.map(r => getRowOrderId(r)))
      const toCreate: PalletRow[] = []
      let posBase = this.rows.length

      // สร้างแถวที่ยังไม่มี
      for (const oid of want) {
        if (!haveSet.has(oid)) {
          toCreate.push({
            Position: ++posBase,
            orderId: oid,
            Unit: 'Kg', Weight: 0, QTY: 1,
            'Pallet Number': key,
          } as any)
        }
      }
      if (toCreate.length) this.addRows(toCreate)

      // ผูกแถว (ที่มี/ที่เพิ่งสร้าง) เข้า pallet
      let moved = 0
      for (const r of this.rows) {
        const oid = getRowOrderId(r)
        if (want.includes(oid)) {
          if ((r as any)['Pallet Number'] !== key) {
            (r as any)['Pallet Number'] = key
            moved++
          }
        }
      }

      if (moved > 0 || toCreate.length > 0) {
        if (meta.status !== 'Shipped') meta.status = 'Open'
        meta.updatedAt = nowIso()
        this.bulkFix()
      }
      return moved + toCreate.length
    },

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
            (r as any)['Pallet Number'] = ''
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

    pack(id: string) {
      const key = String(id)
      const meta = ensureMetaObj(this, key)
      if (isShipped(meta)) return
      const hasLines = countRowsInPallet(this.rows, key) > 0
      if (!hasLines) return
      meta.status = 'Packed'
      meta.updatedAt = nowIso()
    },

    /** Mark shipped: ไม่อนุญาตถ้าไม่มีแถวหรือ overweight */
    markShipped(id: string): boolean {
      const key = String(id)
      const meta = ensureMetaObj(this, key)

      const hasLines = countRowsInPallet(this.rows, key) > 0
      const maxKg = meta.maxWeightKg ?? this.palletMaxKg
      const total = getPalletWeight(this.rows, key)

      if (!hasLines) return false
      if (total > maxKg) return false

      meta.status = 'Shipped'
      meta.updatedAt = nowIso()
      return true
    },

    reopen(id: string) {
      const key = String(id)
      const meta = ensureMetaObj(this, key)
      meta.status = 'Open'
      meta.updatedAt = nowIso()
    },
  },
})