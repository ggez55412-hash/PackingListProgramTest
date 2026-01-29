
import { defineStore } from 'pinia'
import type { PalletRow } from '@/types/palletrow'               // your CSV row
import type { Pallet, PalletStatus } from '@/types/pallet'       // runtime pallet model
import { normalizeUnit, parseNumberLoose, lineWeightKg } from '@/utils/uom'

type PalletSummary = { pallet: string; lines: number; weightKg: number; warn: boolean }

/**
 * Helper: extract a "runtime order id" from a PalletRow to join with OrderRow.orderId
 * Priority: Work Number -> BarCodeNumber -> IdentNumber -> Position (string)
 */
function getRowOrderId(r: PalletRow): string {
  return (
    (r['Work Number'] && String(r['Work Number']).trim()) ||
    (r.BarCodeNumber && String(r.BarCodeNumber).trim()) ||
    (r.IdentNumber && String(r.IdentNumber).trim()) ||
    String(r.Position)
  )
}

/**
 * Helper: safe pallet id string
 */
function getRowPalletId(r: PalletRow): string | undefined {
  const v = (r as any)['Pallet Number']
  const s = v == null ? '' : String(v).trim()
  return s ? s : undefined
}


export const usePalletsStore = defineStore('pallets', {
  state: () => ({
    /** Raw rows imported from CSV */
    rows: [] as PalletRow[],

    /** Weight rules (kg) */
    palletMaxKg: 1000,
    containerMaxKg: 24000,

    /**
     * Runtime metadata per pallet id (not present in CSV):
     * - status: Open | Packed | Shipped
     * - transporter: string
     * - createdAt: string (UI date)
     * - maxWeightKg: override per pallet (fallback to palletMaxKg)
     */
    metaByPallet: {} as Record<
      string,
      { status: PalletStatus; transporter?: string; createdAt: string; maxWeightKg?: number }
    >,
  }),

  getters: {
    /** Group rows by 'Pallet Number' (CSV domain, unchanged) */
    byPallet(state): Map<string, PalletRow[]> {
      const m = new Map<string, PalletRow[]>()
      for (const r of state.rows) {
        const key = getRowPalletId(r)
        const arr = m.get(key)
        if (arr) arr.push(r)
        else m.set(key, [r])
      }
      return m
    },

    /** Pallet summaries (CSV domain, unchanged) */
    palletsSummary(): PalletSummary[] {
      const map = this.byPallet as Map<string, PalletRow[]>
      const out: PalletSummary[] = []
      for (const [pallet, list] of map.entries()) {
        const weight = list.reduce<number>((total, row) => total + (row.__lineWeightKg ?? 0), 0)
        out.push({
          pallet,
          lines: list.length,
          weightKg: +weight.toFixed(2),
          warn: weight > this.palletMaxKg,
        })
      }
      return out.sort((a, b) => b.weightKg - a.weightKg)
    },

    /** Data quality errors (CSV domain, unchanged) */
    errors(state): { idx: number; reason: string }[] {
      const arr: { idx: number; reason: string }[] = []
      state.rows.forEach((r: PalletRow, i: number) => {
        if (r.Weight == null || r.QTY == null) arr.push({ idx: i, reason: 'Missing weight/qty' })
        if (r.Unit && r.Unit !== 'Kg') arr.push({ idx: i, reason: `Unit not Kg: ${r.Unit}` })
      })
      return arr
    },

    /**
     * Runtime Pallet getter:
     * Compose a Pallet model (UI) from CSV rows + metaByPallet.
     * If pallet exists only in meta (no rows yet), still returns a Pallet.
     */
    byId(state): (id: string) => Pallet | null {
      return (id: string) => {
        const idStr = String(id)
        const meta = state.metaByPallet[idStr]
        const rows = (this.byPallet.get(idStr) ?? []) as PalletRow[]

        if (!meta && rows.length === 0) return null

        const orderIds = rows.map(getRowOrderId)
        const createdAt = meta?.createdAt ?? new Date().toLocaleDateString()
        const status: PalletStatus = meta?.status ?? (rows.length ? 'Packed' : 'Open')
        const transporter = meta?.transporter
        const maxWeightKg = meta?.maxWeightKg ?? state.palletMaxKg

        const pallet: Pallet = {
          id: idStr,
          status,
          transporter,
          createdAt,
          orderIds,
          maxWeightKg,
        }
        return pallet
      }
    },
  },

  actions: {
    // ---------------------------
    // CSV / raw-domain actions
    // ---------------------------
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
      const list = this.rows.filter((r) => getRowPalletId(r) === pallet)
      let total = list.reduce<number>((sum, row) => sum + (row.__lineWeightKg ?? 0), 0)
      if (total <= this.palletMaxKg) return

      let suffix = 1,
        cur = 0,
        newPallet = `${pallet}-S${suffix}`
      for (const r of list.slice().reverse()) {
        const w = r.__lineWeightKg ?? 0
        if (total <= this.palletMaxKg) break
        if (cur + w > this.palletMaxKg) {
          suffix++
          cur = 0
          newPallet = `${pallet}-S${suffix}`
        }
        r['Pallet Number'] = newPallet
        cur += w
        total -= w
      }
      this.bulkFix()
    },

    // ---------------------------
    // Runtime Pallet actions (for UI)
    // ---------------------------

    /** Ensure meta entry exists for a pallet id */
    ensureMeta(id: string, defaults?: Partial<{ status: PalletStatus; transporter?: string; createdAt: string; maxWeightKg?: number }>) {
      const key = String(id)
      if (!this.metaByPallet[key]) {
        this.metaByPallet[key] = {
          status: 'Open',
          transporter: undefined,
          createdAt: new Date().toLocaleDateString(),
          maxWeightKg: undefined,
          ...defaults,
        }
      } else if (defaults) {
        this.metaByPallet[key] = { ...this.metaByPallet[key], ...defaults }
      }
    },

    /** Frontend-only: create meta if missing (no fetch) */
    async fetchOne(id: string) {
      this.ensureMeta(id)
      return this.byId(id)
    },

    /** Set transporter on a pallet (runtime meta) — SAFE for TS */
    setTransporter(id: string, transporter?: string) {
      const key = String(id)
      const meta = (this.metaByPallet[key] ??= {
        status: 'Open' as PalletStatus,
        transporter: undefined,
        createdAt: new Date().toLocaleDateString(),
        maxWeightKg: undefined,
      })
      meta.transporter = transporter
    },

    /** Override max weight for a pallet (runtime meta) — SAFE for TS */
    setMaxWeight(id: string, kg?: number) {
      const key = String(id)
      const meta = (this.metaByPallet[key] ??= {
        status: 'Open' as PalletStatus,
        transporter: undefined,
        createdAt: new Date().toLocaleDateString(),
        maxWeightKg: undefined,
      })
      meta.maxWeightKg = kg
    },

    /**
     * Add orders to a pallet by orderIds (matches PalletRow via getRowOrderId()).
     * NOTE: This assumes those rows already exist in CSV rows.
     */
    addOrders(id: string, orderIds: string[]) {
      const set = new Set(orderIds.map((s) => String(s)))
      let assigned = 0
      for (const r of this.rows) {
        const oid = getRowOrderId(r)
        if (set.has(oid)) {
          r['Pallet Number'] = String(id)
          assigned++
        }
      }
      if (assigned > 0) {
        this.ensureMeta(id, { status: 'Packed' })
        this.bulkFix()
      }
      return assigned
    },

    /** Remove orders from the pallet by orderIds */
    removeOrders(id: string, orderIds: string[]) {
      const set = new Set(orderIds.map((s) => String(s)))
      let removed = 0
      for (const r of this.rows) {
        if (getRowPalletId(r) === String(id)) {
          const oid = getRowOrderId(r)
          if (set.has(oid)) {
            r['Pallet Number'] = null as any
            removed++
          }
        }
      }
      if (removed > 0) {
        // If pallet becomes empty and not shipped, back to Open
        const list = this.rows.filter((r) => getRowPalletId(r) === String(id))
        const isEmpty = list.length === 0
        this.ensureMeta(id, { status: isEmpty ? 'Open' : 'Packed' })
        this.bulkFix()
      }
      return removed
    },

    /** Mark pallet as shipped (runtime meta) — SAFE for TS */
    markShipped(id: string) {
      const key = String(id)
      const meta = (this.metaByPallet[key] ??= {
        status: 'Open' as PalletStatus,
        transporter: undefined,
        createdAt: new Date().toLocaleDateString(),
        maxWeightKg: undefined,
      })
      meta.status = 'Shipped'
    },

    /** Reopen pallet (runtime meta) — SAFE for TS */
    reopen(id: string) {
      const key = String(id)
      const list = this.rows.filter((r) => getRowPalletId(r) === key)
      const meta = (this.metaByPallet[key] ??= {
        status: 'Open' as PalletStatus,
        transporter: undefined,
        createdAt: new Date().toLocaleDateString(),
        maxWeightKg: undefined,
      })
      meta.status = (list.length > 0 ? 'Packed' : 'Open')
    },
  },
})
