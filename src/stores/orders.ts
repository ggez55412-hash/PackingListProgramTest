
// src/stores/orders.ts
import { defineStore } from 'pinia'
import type { OrderRow } from '@/types/order'

export const useOrdersStore = defineStore('orders', {
  state: () => ({
    orders: [] as OrderRow[],
    _lastRemoved: null as null | { items: OrderRow[] },
  }),

  getters: {
    active: (s) => s.orders.filter(o => !o.deletedAt),               // เผื่อใช้กรอง soft delete
    deleted: (s) => s.orders.filter(o => !!o.deletedAt),

    count: (s) => s.orders.filter(o => !o.deletedAt).length,
    pendingCount: (s) => s.orders.filter(o => !o.deletedAt && o.status === 'Pending').length,
    shippedCount: (s) => s.orders.filter(o => !o.deletedAt && o.status === 'Shipped').length,
    totalWeight: (s) => s.orders.reduce((t, r) => t + (!r.deletedAt ? (Number(r.weightKg) || 0) : 0), 0),

    parcelNosSet: (s): Set<string> =>
      new Set(
        s.orders
          .filter(o => !o.deletedAt)
          .map((o) => (o.parcelNo || '').trim())
          .filter(Boolean),
      ),
  },

  actions: {
    replaceAll(rows: OrderRow[]) {
      this.orders = rows.map(r => ({ deletedAt: null, ...r }))
      this._lastRemoved = null
    },

    upsert(row: OrderRow) {
      const i = this.orders.findIndex(o => o.orderId === row.orderId)
      if (i < 0) {
        this.orders.push({ deletedAt: null, ...row })
      } else {
        const prev = this.orders[i]!
        this.orders[i] = { ...prev, ...row, deletedAt: prev.deletedAt ?? null }
      }
    },

    markAsShipped(ids: string[], deliveredOn?: string) {
      const set = new Set(ids)
      this.orders = this.orders.map(o =>
        set.has(o.orderId)
          ? { ...o, status: 'Shipped', deliveryDate: o.deliveryDate || deliveredOn }
          : o
      )
    },

    // ---------- Soft delete (เผื่ออนาคตต้องการ) ----------
    deleteOne(orderId: string) {
      const target = this.orders.find(o => o.orderId === orderId)
      if (!target || target.deletedAt) return
      target.deletedAt = Date.now()
      this._lastRemoved = { items: [{ ...target }] }
    },
    deleteMany(orderIds: string[]) {
      const set = new Set(orderIds)
      const removed: OrderRow[] = []
      for (const o of this.orders) {
        if (!o.deletedAt && set.has(o.orderId)) {
          o.deletedAt = Date.now()
          removed.push({ ...o })
        }
      }
      if (removed.length) this._lastRemoved = { items: removed }
    },
    undoDelete() {
      if (!this._lastRemoved) return
      const set = new Set(this._lastRemoved.items.map(i => i.orderId))
      for (const o of this.orders) {
        if (set.has(o.orderId)) o.deletedAt = null
      }
      this._lastRemoved = null
    },

    // ---------- Hard delete (ใช้จริงใน Dashboard) ----------
    hardDeleteByIds(orderIds: string[]) {
      const set = new Set(orderIds)
      this.orders = this.orders.filter(o => !set.has(o.orderId)) // ลบทิ้งทั้งแถว
      this._lastRemoved = null
    },
  },
})
