import { defineStore } from 'pinia'
import type { OrderRow } from '@/types/order'

export const useOrdersStore = defineStore('orders', {
  state: () => ({ orders: [] as OrderRow[] }),
  getters: {
    count: (s) => s.orders.length,
    pendingCount: (s) => s.orders.filter((r) => r.status === 'Pending').length,
    shippedCount: (s) => s.orders.filter((r) => r.status === 'Shipped').length,
    totalWeight: (s) => s.orders.reduce((t, r) => t + (r.weightKg || 0), 0),
    parcelNosSet: (s) => new Set(s.orders.map((o) => (o.parcelNo || '').trim()).filter(Boolean)),
  },
  actions: {
    replaceAll(rows: OrderRow[]) {
      this.orders = [...rows]
    },
    upsert(row: OrderRow) {
      const i = this.orders.findIndex((o) => o.orderId === row.orderId)
      if (i === -1) this.orders.push({ ...row })
      else this.orders[i] = { ...this.orders[i], ...row }
    },
    markAsShipped(ids: string[], deliveredOn?: string) {
      const set = new Set(ids)
      this.orders = this.orders.map((o) =>
        set.has(o.orderId)
          ? {
              ...o,
              status: 'Shipped',
              deliveryDate: o.deliveryDate || deliveredOn,
            }
          : o,
      )
    },
  },
})
