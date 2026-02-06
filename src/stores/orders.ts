// src/stores/orders.ts
import { defineStore } from 'pinia'
import type { Order, ShipmentStatus } from '@/types/order'
import { usePalletsStore } from '@/stores/pallets'

export const useOrdersStore = defineStore('orders', {
  state: () => ({
    orders: [] as Order[],
    loading: false,
  }),
  getters: {
    activeOrders(s): Order[] { return s.orders.filter(o => !o.deletedAt) },
    count(): number { return this.activeOrders.length },
    pendingCount(): number { return this.activeOrders.filter(o => o.status === 'Pending').length },
    shippedCount(): number { return this.activeOrders.filter(o => o.status === 'Shipped').length },
    totalWeight(): number { return this.activeOrders.reduce((sum, o) => sum + (o.weightKg ?? 0), 0) },
    parcelNosSet(): Set<string> {
      const set = new Set<string>()
      for (const o of this.activeOrders) if (o.parcelNo) set.add(o.parcelNo)
      return set
    },
    pendingOrders(): Order[] { return this.activeOrders.filter(o => o.status === 'Pending') },
  },
  actions: {
    async fetchOrders() {
      this.loading = true
      try {
        // (mock) – แก้เชื่อม API จริงตามต้องการ
        const data: Order[] = [
          { orderId: 'FG-005', customer: 'Company F', status: 'Pending', weightKg: 30, deletedAt: null },
          { orderId: 'FG-006', customer: 'Company F', status: 'Shipped', weightKg: 25, deletedAt: null },
        ]
        this.replaceAll(data)
      } finally {
        this.loading = false
      }
    },
    replaceAll(rows: Order[]) {
      this.orders = rows.map(r => ({ deletedAt: null, ...r }))
    },
    upsert(row: Order) {
      const id = row.orderId
      const idx = this.orders.findIndex(o => o.orderId === id)
      const normalized: Order = { deletedAt: null, ...row }
      if (idx === -1) this.orders.push(normalized)
      else this.orders[idx] = { ...this.orders[idx], ...normalized }

      // ✅ แจ้ง Pallets ให้ sync น้ำหนักของทุกแถวที่อ้าง orderId นี้
      try {
        const pallets = usePalletsStore()
        pallets.onOrderWeightChanged(id, normalized.weightKg)
      } catch {}
    },
    markAsShipped(ids: string[] | string, shippedDate?: string) {
      const set = new Set(Array.isArray(ids) ? ids : [ids])
      for (const o of this.orders) {
        if (set.has(o.orderId)) {
          o.status = 'Shipped'
          if (shippedDate) o.deliveryDate = shippedDate
        }
      }
    },
    hardDeleteByIds(ids: string[]) {
      const set = new Set(ids)
      this.orders = this.orders.filter(o => !set.has(o.orderId))
    },
    softDelete(id: string) {
      const o = this.orders.find(x => x.orderId === id)
      if (o) o.deletedAt = new Date().toISOString()
    },
    restore(id: string) {
      const o = this.orders.find(x => x.orderId === id)
      if (o) o.deletedAt = null
    },
  },
})