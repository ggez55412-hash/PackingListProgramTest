// src/stores/pallets.ts
import { defineStore } from 'pinia'
import type { PalletRow } from '@/types/palletrow'
import type { Pallet, PalletStatus, ISODateTimeString } from '@/types/pallet'
import { useOrdersStore } from '@/stores/orders'

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

const nowIso = () => new Date().toISOString()

function getRowPalletId(r: PalletRow): string | undefined {
  const v = (r as any)['Pallet Number'] ?? (r as any).PalletNumber ?? (r as any).pallet ?? (r as any).Pallet
  const s = v == null ? '' : String(v).trim()
  return s || undefined
}
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
function clamp0(n: any): number {
  const x = Number(String(n ?? '').replace(',', '.'))
  if (!Number.isFinite(x)) return 0
  return x < 0 ? 0 : x
}
function calcLineWeight(w?: number | null, q?: number | null) {
  const W = clamp0(w)
  const Q = clamp0(q)
  return Number.isFinite(W * Q) ? W * Q : 0
}
function ensureMeta(store: any, key: string): PalletMeta {
  if (store.metaByPallet[key]) return store.metaByPallet[key]
  store.metaByPallet[key] = {
    status: 'Open',
    transporter: undefined,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    maxWeightKg: undefined,
  }
  return store.metaByPallet[key]
}
const isShipped = (m?: PalletMeta) => m?.status === 'Shipped'

export const usePalletsStore = defineStore('pallets', {
  state: () => ({
    rows: [] as PalletRow[],
    palletMaxKg: 1000,
    containerMaxKg: 24000,
    metaByPallet: {} as Record<string, PalletMeta>,
  }),

  getters: {
    unassignedRows(state) { return state.rows.filter(r => !getRowPalletId(r)) },
    byPallet(state) {
      const m = new Map<string, PalletRow[]>()
      for (const r of state.rows) {
        const key = getRowPalletId(r)
        if (!key) continue
        if (!m.has(key)) m.set(key, [])
        m.get(key)!.push(r)
      }
      return m
    },
    /** รวมพาเลทจากแถว + พาเลทว่างที่มีแต่ meta → ให้ New Pallet โผล่บนบอร์ด */
    palletsSummary(): PalletSummary[] {
      const map = this.byPallet
      const out: PalletSummary[] = []
      const seen = new Set<string>()

      // (ก) มีแถวจริง
      for (const [pid, list] of map.entries()) {
        const weight = list.reduce((t, r) => t + clamp0((r as any).__lineWeightKg), 0)
        const meta = this.metaByPallet[pid]
        const maxKg = meta?.maxWeightKg ?? this.palletMaxKg
        out.push({
          pallet: pid,
          status: meta?.status ?? 'Open',
          lines: list.length,
          weightKg: +weight.toFixed(2),
          maxKg,
          warn: weight > maxKg,
          updatedAt: meta?.updatedAt,
        })
        seen.add(pid)
      }
      // (ข) ว่างจาก meta
      for (const [pid, meta] of Object.entries(this.metaByPallet)) {
        if (seen.has(pid)) continue
        out.push({
          pallet: pid,
          status: meta.status ?? 'Open',
          lines: 0,
          weightKg: 0,
          maxKg: meta.maxWeightKg ?? this.palletMaxKg,
          warn: false,
          updatedAt: meta.updatedAt,
        })
      }
      return out.sort((a, b) => Number(b.warn) - Number(a.warn) || b.weightKg - a.weightKg)
    },
    /** ให้หน้า PalletDetail ใช้ */
    byId(state) {
      return (id: string): Pallet | null => {
        const pid = String(id)
        const meta = state.metaByPallet[pid]
        const rows = (this.byPallet.get(pid) ?? []) as PalletRow[]
        if (!meta && rows.length === 0) return null
        const orderIds = rows.map(r => getRowOrderId(r))
        const maxKg = meta?.maxWeightKg ?? state.palletMaxKg
        return {
          id: pid,
          status: meta?.status ?? 'Open',
          transporter: meta?.transporter,
          createdAt: meta?.createdAt ?? nowIso(),
          updatedAt: meta?.updatedAt,
          orderIds,
          maxWeightKg: maxKg,
        }
      }
    },
    /** สำหรับ PalletImport.vue */
    errors(state) {
      const arr: { idx: number; reason: string }[] = []
      state.rows.forEach((r, i) => {
        const W = (r as any).Weight
        const Q = (r as any).QTY
        if (!Number.isFinite(W) || !Number.isFinite(Q)) arr.push({ idx: i, reason: 'Invalid weight/qty' })
        if ((r as any).Unit && (r as any).Unit !== 'Kg') arr.push({ idx: i, reason: `Unit not Kg: ${(r as any).Unit}` })
      })
      return arr
    },
  },

  actions: {
    /** Import ทั้งหมด + touch meta.updatedAt สำหรับพาเลทที่พบในไฟล์ */
    replaceAll(rows: PalletRow[]) {
      this.rows = rows.map(r => {
        const W = clamp0((r as any).Weight)
        const Q = clamp0((r as any).QTY ?? 1)
        return { ...r, Unit: 'Kg', Weight: W, QTY: Q, __lineWeightKg: calcLineWeight(W, Q) }
      })
      const set = new Set<string>()
      for (const r of this.rows) {
        const pid = getRowPalletId(r)
        if (pid) set.add(pid)
      }
      for (const pid of set) {
        const m = ensureMeta(this, pid)
        m.updatedAt = nowIso()
      }
    },
    bulkFix() {
      this.rows = this.rows.map(r => {
        const W = clamp0((r as any).Weight)
        const Q = clamp0((r as any).QTY ?? 1)
        return { ...r, Weight: W, QTY: Q, __lineWeightKg: calcLineWeight(W, Q) }
      })
    },

    /** ✅ ให้หน้า PalletDetail เรียกได้ */
    async fetchOne(id: string) {
      const key = String(id)
      ensureMeta(this, key)
      return this.byId(key)
    },

    setMaxWeight(id: string, kg?: number) {
      const m = ensureMeta(this, id)
      const n = Number(kg)
      m.maxWeightKg = Number.isFinite(n) && n > 0 ? n : undefined
      m.updatedAt = nowIso()
    },
    setTransporter(id: string, t?: string) {
      const m = ensureMeta(this, id)
      if (isShipped(m)) return
      m.transporter = t?.trim() || undefined
      m.updatedAt = nowIso()
    },

    /** ✅ ใช้บนบอร์ด */
    splitPalletOverMax(pallet: string) {
      const key = String(pallet)
      const meta = ensureMeta(this, key)
      if (isShipped(meta)) return

      const list = this.rows.filter(r => getRowPalletId(r) === key)
      const maxKg = meta.maxWeightKg ?? this.palletMaxKg

      let total = list.reduce((sum, r) => sum + clamp0((r as any).__lineWeightKg), 0)
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

    /** ✅ addOrders ดึงน้ำหนักเริ่มจาก Orders + sync เข้าแถว */
    addOrders(id: string, ids: string[]) {
      const pid = String(id)
      const m = ensureMeta(this, pid)
      if (isShipped(m)) return 0

      // อ่านน้ำหนักจาก Orders store (ถ้ามี)
      let getWeight = (oid: string) => 0
      try {
        const orders = useOrdersStore()
        getWeight = (oid: string) => clamp0(orders.orders.find(o => String(o.orderId) === String(oid))?.weightKg)
      } catch {}

      const want = [...new Set(ids.map(String))]
      const have = new Set(this.rows.map(r => getRowOrderId(r)))
      let pos = this.rows.length
      let created = 0
      for (const oid of want) {
        if (!have.has(oid)) {
          const w = getWeight(oid)
          const q = 1
          this.rows.push({
            Position: ++pos,
            orderId: oid,
            Unit: 'Kg',
            Weight: w,
            QTY: q,
            'Pallet Number': pid,
            __lineWeightKg: calcLineWeight(w, q),
          } as any)
          created++
        }
      }
      // ผูกแถวเดิมเข้าพาเลท + sync น้ำหนักอีกครั้ง
      let moved = 0
      for (const r of this.rows) {
        const oid = getRowOrderId(r)
        if (want.includes(oid)) {
          if ((r as any)['Pallet Number'] !== pid) { (r as any)['Pallet Number'] = pid; moved++ }
          const w = getWeight(oid)
          const q = clamp0((r as any).QTY ?? 1)
          ;(r as any).Weight = w
          ;(r as any).__lineWeightKg = calcLineWeight(w, q)
        }
      }
      if (created + moved > 0) { m.updatedAt = nowIso(); this.bulkFix() }
      return created + moved
    },

    removeOrders(id: string, orderIds: string[]) {
      const pid = String(id)
      const m = ensureMeta(this, pid)
      if (isShipped(m)) return 0
      const rm = new Set(orderIds.map(String))
      for (const r of this.rows) {
        if (getRowPalletId(r) === pid && rm.has(getRowOrderId(r))) {
          ;(r as any)['Pallet Number'] = ''
        }
      }
      m.updatedAt = nowIso()
      this.bulkFix()
    },

    pack(id: string) {
      const m = ensureMeta(this, id)
      if (isShipped(m)) return
      const hasLines = (this.byPallet.get(String(id))?.length ?? 0) > 0
      if (!hasLines) return
      m.status = 'Packed'
      m.updatedAt = nowIso()
    },
    markShipped(id: string) {
      const m = ensureMeta(this, id)
      m.status = 'Shipped'
      m.updatedAt = nowIso()
    },
    reopen(id: string) {
      const m = ensureMeta(this, id)
      m.status = 'Open'
      m.updatedAt = nowIso()
    },

    /** ✅ เรียกจาก orders.upsert() เพื่อ sync น้ำหนักเข้าแถวพาเลททั้งหมดที่เกี่ยวข้อง */
    onOrderWeightChanged(orderId: string, weightKg?: number) {
      const oid = String(orderId)
      const w = clamp0(weightKg)
      let touched = 0
      const affected = new Set<string>()
      for (const r of this.rows) {
        if (getRowOrderId(r) === oid) {
          const q = clamp0((r as any).QTY ?? 1)
          ;(r as any).Weight = w
          ;(r as any).__lineWeightKg = calcLineWeight(w, q)
          const pid = getRowPalletId(r)
          if (pid) affected.add(pid)
          touched++
        }
      }
      if (touched > 0) {
        for (const pid of affected) ensureMeta(this, pid).updatedAt = nowIso()
      }
    },

    /** (ตัวเลือก) utility ล้างทั้งหมด */
    clearAll() { this.rows = []; this.metaByPallet = {} },

    /** (ตัวเลือก) purge meta พาเลทที่ไม่มีแถว */
    purgeEmptyPallets() {
      const hasRow = new Set<string>()
      for (const r of this.rows) {
        const pid = getRowPalletId(r); if (pid) hasRow.add(pid)
      }
      for (const pid of Object.keys(this.metaByPallet)) {
        if (!hasRow.has(pid)) delete this.metaByPallet[pid]
      }
    },
  },
})