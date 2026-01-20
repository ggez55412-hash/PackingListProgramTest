import { defineStore } from 'pinia'
import type { PalletRow } from '@/types/pallet'
import { normalizeUnit, parseNumberLoose, lineWeightKg } from '@/utils/uom'

type PalletSummary = { pallet: string; lines: number; weightKg: number; warn: boolean }

export const usePalletsStore = defineStore('pallets', {
  state: () => ({
    rows: [] as PalletRow[],
    palletMaxKg: 1000,
    containerMaxKg: 24000,
  }),

  getters: {
    byPallet(state): Map<string, PalletRow[]> {
      const m = new Map<string, PalletRow[]>()
      for (const r of state.rows) {
        const key = (r['Pallet Number'] || '—') as string
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
        const weight = list.reduce<number>(
          (total: number, row: PalletRow) => total + (row.__lineWeightKg ?? 0),
          0,
        )
        out.push({
          pallet,
          lines: list.length,
          weightKg: +weight.toFixed(2),
          warn: weight > this.palletMaxKg,
        })
      }
      return out.sort((a, b) => b.weightKg - a.weightKg)
    },

    errors(state): { idx: number; reason: string }[] {
      const arr: { idx: number; reason: string }[] = []
      state.rows.forEach((r: PalletRow, i: number) => {
        if (r.Weight == null || r.QTY == null) arr.push({ idx: i, reason: 'Missing weight/qty' })
        if (r.Unit && r.Unit !== 'Kg') arr.push({ idx: i, reason: `Unit not Kg: ${r.Unit}` })
      })
      return arr
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
      const list = this.rows.filter((r: PalletRow) => (r['Pallet Number'] || '—') === pallet)
      let total = list.reduce<number>(
        (sum: number, row: PalletRow) => sum + (row.__lineWeightKg ?? 0),
        0,
      )
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
  },
})
