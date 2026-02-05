// src/stores/pallets.ts
import { defineStore } from 'pinia'
import type { PalletRow } from '@/types/palletrow'
import type { Pallet, PalletStatus, ISODateTimeString } from '@/types/pallet'
import { normalizeUnit, parseNumberLoose /*, lineWeightKg */ } from '@/utils/uom' // เราจะคำนวณเองเพื่อ clamp ≥ 0
import { useOrdersStore } from '@/stores/orders' // ใช้ดึงน้ำหนักตั้งต้นจาก orders

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

// ---------- helpers ----------
function nowIso(): ISODateTimeString {
  return new Date().toISOString()
}

/** runtime order id สำหรับ join กับ OrderRow.orderId */
function getRowOrderId(r: PalletRow): string {
  return (
    ((r as any).orderId && String((r as any).orderId).trim()) ||
    ((r as any).OrderId && String((r as any).OrderId).trim()) ||
    (r['Work Number'] && String(r['Work Number']).trim()) ||
    ((r as any).BarCodeNumber && String((r as any).BarCodeNumber).trim()) ||
    ((r as any).IdentNumber && String((r as any).IdentNumber).trim()) ||
    String(r.Position)
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
  return s ? s : undefined
}

function isShipped(meta?: PalletMeta) {
  return meta?.status === 'Shipped'
}

/** สร้าง/คืน meta object ให้พาเลทที่กำหนด */
function ensureMeta(
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

// alias กันโค้ดเก่าที่อาจเรียก ensureMetaObj
const ensureMetaObj = ensureMeta

function countRowsInPallet(rows: PalletRow[], key: string): number {
  let c = 0
  for (const r of rows) if (getRowPalletId(r) === key) c++
  return c
}

// --- น้ำหนักปลอดภัย: clamp ≥ 0 ---
function clamp0(n: any): number {
  const x = Number(String(n ?? '').replace(',', '.'))
  if (!Number.isFinite(x)) return 0
  return x < 0 ? 0 : x
}
// คำนวณ __lineWeightKg โดย clamp ก่อนเสมอ
function calcLineWeight(weight?: number | null, qty?: number | null): number {
  const w = clamp0(weight)
  const q = clamp0(qty)
  const v = w * q
  return Number.isFinite(v) ? v : 0
}

// ---------- store ----------
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
        const weight = list.reduce<number>((t, row) => t + clamp0((row as any).__lineWeightKg ?? calcLineWeight((row as any).Weight, (row as any).QTY)), 0)
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
      return out.sort((a, b) => Number(b.warn) - Number(a.warn) || b.weightKg - a.weightKg)
    },
    errors(state): { idx: number; reason: string }[] {
      const arr: { idx: number; reason: string }[] = []
      state.rows.forEach((r, i) => {
        const W = clamp0((r as any).Weight)
        const Q = clamp0((r as any).QTY)
        if (!Number.isFinite(W) || !Number.isFinite(Q)) arr.push({ idx: i, reason: 'Invalid weight/qty' })
        if ((r as any).Unit && (r as any).Unit !== 'Kg') arr.push({ idx: i, reason: `Unit not Kg: ${(r as any).Unit}` })
      })
      return arr
    },
    /** ส่ง Pallet พร้อม transporter (meta ก่อน, ถ้าไม่มีลอง fallback จาก CSV rows) */
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
        // 1) meta ก่อน
        let transporter = meta?.transporter
        // 2) fallback จาก rows (ถ้ามี)
        if (!transporter) {
          const candidate = rows
            .map((r) => (r as any).Transporter ?? (r as any).transporter ?? '')
            .map((s: any) => String(s ?? '').trim())
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
        const Unit = normalizeUnit((r as any).Unit ?? 'Kg') ?? 'Kg'
        const WeightRaw = parseNumberLoose((r as any).Weight)
        const QTYRaw = parseNumberLoose((r as any).QTY)
        const Weight = clamp0(WeightRaw)
        const QTY = clamp0(QTYRaw ?? 1)
        return { ...r, Unit, Weight, QTY, __lineWeightKg: calcLineWeight(Weight, QTY) } as PalletRow
      })
    },
    bulkFix() {
      this.rows = this.rows.map((r) => {
        const Unit = normalizeUnit((r as any).Unit ?? 'Kg') ?? 'Kg'
        const WeightRaw = parseNumberLoose((r as any).Weight)
        const QTYRaw = parseNumberLoose((r as any).QTY)
        const Weight = clamp0(WeightRaw)
        const QTY = clamp0(QTYRaw ?? 1)
        return { ...r, Unit, Weight, QTY, __lineWeightKg: calcLineWeight(Weight, QTY) } as PalletRow
      })
    },
    addRows(newRows: PalletRow[]) {
      const normalized = newRows.map((r) => {
        const Unit = normalizeUnit((r as any).Unit ?? 'Kg') ?? 'Kg'
        const WeightRaw = parseNumberLoose((r as any).Weight)
        const QTYRaw = parseNumberLoose((r as any).QTY)
        const Weight = clamp0(WeightRaw)
        const QTY = clamp0(QTYRaw ?? 1)
        return { ...r, Unit, Weight, QTY, __lineWeightKg: calcLineWeight(Weight, QTY) } as PalletRow
      })
      this.rows.push(...normalized)
    },
    splitPalletOverMax(pallet: string) {
      const key = String(pallet)
      const meta = ensureMeta(this, key)
      if (isShipped(meta)) return
      const list = this.rows.filter((r) => getRowPalletId(r) === key)
      const maxKg = meta.maxWeightKg ?? this.palletMaxKg
      let total = list.reduce<number>((sum, row) => sum + clamp0((row as any).__lineWeightKg), 0)
      if (total <= maxKg) return
      let suffix = 1, cur = 0, newPallet = `${key}-S${suffix}`
      for (const r of list.slice().reverse()) {
        const w = clamp0((r as any).__lineWeightKg)
        if (total <= maxKg) break
        if (cur + w > maxKg) { suffix++; cur = 0; newPallet = `${key}-S${suffix}` }
        ;(r as any)['Pallet Number'] = newPallet
        cur += w
        total -= w
      }
      meta.updatedAt = nowIso()
      this.bulkFix()
    },

    // ---------- Runtime / UI ----------
    async fetchOne(id: string) {
      ensureMeta(this, String(id))
      return this.byId(String(id))
    },
    setTransporter(id: string, transporter?: string) {
      const key = String(id)
      const meta = ensureMeta(this, key)
      if (isShipped(meta)) return
      meta.transporter = transporter?.trim() || undefined
      meta.updatedAt = nowIso()
    },
    setMaxWeight(id: string, kg?: number) {
      const key = String(id)
      const meta = ensureMeta(this, key)
      if (isShipped(meta)) return
      const v = Number(kg)
      meta.maxWeightKg = Number.isFinite(v) && v > 0 ? v : undefined
      meta.updatedAt = nowIso()
    },

    /** เพิ่มออเดอร์เข้า pallet + ตั้งน้ำหนักตั้งต้นจาก orders.weightKg (ถ้ามี) (clamp ≥ 0) */
    addOrders(id: string, orderIds: string[]) {
      const key = String(id)
      const meta = ensureMeta(this, key)
      if (meta?.status === 'Shipped') return 0

      // อ่านน้ำหนักออเดอร์ (ถ้ามี)
      let getWeight = (oid: string) => 0
      try {
        const orders = useOrdersStore()
        getWeight = (oid: string) => {
          const o = orders.orders.find((x) => String(x.orderId) === String(oid))
          return clamp0(o?.weightKg)
        }
      } catch { /* noop */ }

      const want = Array.from(new Set(orderIds.map(String)))
      const haveSet = new Set(this.rows.map((r) => getRowOrderId(r)))

      const toCreate: PalletRow[] = []
      let posBase = this.rows.length

      // สร้างแถวที่ยังไม่มี
      for (const oid of want) {
        if (!haveSet.has(oid)) {
          const initWeight = clamp0(getWeight(oid))
          const initQty = 1
          toCreate.push({
            Position: ++posBase as unknown as any,
            orderId: oid,
            Unit: 'Kg',
            Weight: initWeight,
            QTY: initQty,
            'Pallet Number': key,
            __lineWeightKg: calcLineWeight(initWeight, initQty),
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
            ;(r as any)['Pallet Number'] = key
            // อัปเดตน้ำหนักแถวให้ตรงกับน้ำหนักปัจจุบันของ order (กันเคสเพิ่งแก้ใน Dashboard)
            const w = clamp0(getWeight(oid))
            const q = clamp0((r as any).QTY ?? 1)
            ;(r as any).Weight = w
            ;(r as any).__lineWeightKg = calcLineWeight(w, q)
            moved++
          }
        }
      }

      if (moved > 0 || toCreate.length > 0) {
        meta.status = 'Open' // เช็ค Shipped ไปแล้ว
        meta.updatedAt = nowIso()
        // ไม่จำเป็นต้อง bulkFix อีก แต่เรียกเพื่อความสม่ำเสมอ
        this.bulkFix()
      }
      return moved + toCreate.length
    },

    removeOrders(id: string, orderIds: string[]) {
      const key = String(id)
      const meta = ensureMeta(this, key)
      if (isShipped(meta)) return 0
      const set = new Set(orderIds.map(String))
      let removedRows = 0
      for (const r of this.rows) {
        if (getRowPalletId(r) === key) {
          const oid = getRowOrderId(r)
          if (set.has(oid)) {
            ;(r as any)['Pallet Number'] = ''
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
      const meta = ensureMeta(this, key)
      if (isShipped(meta)) return
      const hasLines = countRowsInPallet(this.rows, key) > 0
      if (!hasLines) return
      meta.status = 'Packed'
      meta.updatedAt = nowIso()
    },

    markShipped(id: string) {
      const key = String(id)
      const meta = ensureMeta(this, key)
      meta.status = 'Shipped'
      meta.updatedAt = nowIso()
    },

    reopen(id: string) {
      const key = String(id)
      const meta = ensureMeta(this, key)
      const hasLines = countRowsInPallet(this.rows, key) > 0
      meta.status = hasLines ? 'Open' : 'Open'
      meta.updatedAt = nowIso()
    },

    /** ✅ ใช้เมื่อมีการแก้น้ำหนักใน Dashboard (orders.upsert) เพื่อซิงก์เข้าทุกแถวพาเลต */
    onOrderWeightChanged(orderId: string, weightKg?: number) {
      const oid = String(orderId)
      const w = clamp0(weightKg)
      let touched = 0
      const affectedPallets = new Set<string>()

      for (const r of this.rows) {
        if (getRowOrderId(r) === oid) {
          const q = clamp0((r as any).QTY ?? 1)
          ;(r as any).Weight = w
          ;(r as any).__lineWeightKg = calcLineWeight(w, q)
          const pid = getRowPalletId(r)
          if (pid) affectedPallets.add(pid)
          touched++
        }
      }

      if (touched > 0) {
        // อัปเดตเวลาแก้ไขของพาเลตที่ได้รับผล
        for (const pid of affectedPallets) {
          const meta = ensureMeta(this, pid)
          meta.updatedAt = nowIso()
        }
      }
    },
  },
})