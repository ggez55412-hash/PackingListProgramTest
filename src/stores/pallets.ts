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

function nowIso(): ISODateTimeString { return new Date().toISOString() }

/** ดึงทุกคีย์ที่ใช้อ้างอิง order ของแถวหนึ่ง */
function getRowAllKeys(r: PalletRow): string[] {
  const keys: string[] = []
  const w = r['Work Number'] && String(r['Work Number']).trim()
  const b = r.BarCodeNumber && String(r.BarCodeNumber).trim()
  const i = r.IdentNumber && String(r.IdentNumber).trim()
  const p = r.Position != null ? String(r.Position).trim() : undefined
  if (w) keys.push(w)
  if (b) keys.push(b)
  if (i) keys.push(i)
  if (p) keys.push(p)
  return keys
}

/** รับ pallet id: ว่างให้เป็น undefined (อย่ากลาย '—') */
function getRowPalletId(r: PalletRow): string | undefined {
  const v = (r as any)['Pallet Number']
  const s = v == null ? '' : String(v).trim()
  return s ? s : undefined
}

function isShipped(meta?: PalletMeta) { return meta?.status === 'Shipped' }

function ensureMetaObj(store: { metaByPallet: Record<string, PalletMeta> }, key: string): PalletMeta {
  const existed = store.metaByPallet[key]
  if (existed) return existed
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
        const weight = list.reduce<number>((t, row) => t + (row.__lineWeightKg ?? 0), 0)
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

    byId(state): (id: string) => Pallet | null {
      return (id: string) => {
        const key = String(id)
        const meta = state.metaByPallet[key]
        const rows = (this.byPallet.get(key) ?? []) as PalletRow[]
        if (!meta && rows.length === 0) return null
        const orderIds = rows.map((r) => (getRowAllKeys(r)[0] ?? ''))
        const createdAt = meta?.createdAt ?? nowIso()
        const updatedAt = meta?.updatedAt
        const status: PalletStatus = meta?.status ?? 'Open'
        const transporter = meta?.transporter
        const maxWeightKg = meta?.maxWeightKg ?? state.palletMaxKg
        return { id: key, status, transporter, createdAt, orderIds, maxWeightKg, updatedAt }
      }
    },
  },

  actions: {
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
      let suffix = 1, cur = 0, newPallet = `${key}-S${suffix}`
      for (const r of list.slice().reverse()) {
        const w = r.__lineWeightKg ?? 0
        if (total <= maxKg) break
        if (cur + w > maxKg) {
          suffix++; cur = 0; newPallet = `${key}-S${suffix}`
        }
        ;(r as any)['Pallet Number'] = newPallet
        cur += w
        total -= w
      }
      meta.updatedAt = nowIso()
      this.bulkFix()
    },

    /** frontend-only: สร้าง meta ถ้ายังไม่มี แล้วคืน Pallet runtime model */
    async fetchOne(id: string) {
      const key = String(id)
      ensureMetaObj(this, key)
      return (this as any).byId(key)
    },

    setMaxWeight(id: string, kg?: number) {
      const key = String(id)
      const meta = ensureMetaObj(this, key)
      if (isShipped(meta)) return
      meta.maxWeightKg = kg
      meta.updatedAt = nowIso()
    },

    /** เพิ่มออเดอร์: จับคู่ได้ทุกคีย์ (Work/Barcode/Ident/Position) */
    addOrders(id: string, orderIds: string[]) {
      const key = String(id)
      const meta = ensureMetaObj(this, key)
      if (isShipped(meta)) return 0
      const selected = new Set(orderIds.map(String))
      let movedRows = 0
      for (const r of this.rows) {
        const keys = getRowAllKeys(r)
        if (keys.some((k) => selected.has(k))) {
          ;(r as any)['Pallet Number'] = key
          movedRows++
        }
      }
      if (movedRows > 0) {
        if (meta.status !== 'Shipped') meta.status = 'Open'
        meta.updatedAt = nowIso()
        this.bulkFix()
      }
      return movedRows
    },

    /** เอาออเดอร์ออก → เคลียร์เป็น '' (unassigned) */
    removeOrders(id: string, orderIds: string[]) {
      const key = String(id)
      const meta = ensureMetaObj(this, key)
      if (isShipped(meta)) return 0
      const selected = new Set(orderIds.map(String))
      let removedRows = 0
      for (const r of this.rows) {
        if (getRowPalletId(r) === key) {
          const keys = getRowAllKeys(r)
          if (keys.some((k) => selected.has(k))) {
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
      const meta = ensureMetaObj(this, key)
      if (isShipped(meta)) return
      const hasLines = countRowsInPallet(this.rows, key) > 0
      if (!hasLines) return
      meta.status = 'Packed'
      meta.updatedAt = nowIso()
    },

    markShipped(id: string) {
      const key = String(id)
      const meta = ensureMetaObj(this, key)
      meta.status = 'Shipped'
      meta.updatedAt = nowIso()
    },

    reopen(id: string) {
      const key = String(id)
      const meta = ensureMetaObj(this, key)
      meta.status = 'Open'
      meta.updatedAt = nowIso()
    },
  },
})