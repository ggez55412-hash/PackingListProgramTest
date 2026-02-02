// src/stores/orders.ts
import { defineStore } from 'pinia'
import type { Order, ShipmentStatus } from '@/types/order'

export const useOrdersStore = defineStore('orders', {
  state: () => ({
    orders: [] as Order[],
    loading: false,
  }),

  getters: {
    // เฉพาะที่ยังไม่ถูกลบ (soft delete)
    activeOrders: (s): Order[] => s.orders.filter(o => !o.deletedAt),

    // นับทั้งหมด (ไม่รวมที่ถูกลบ)
    count(): number {
      return this.activeOrders.length
    },

    // นับสถานะต่าง ๆ
    pendingCount(): number {
      return this.activeOrders.filter(o => o.status === 'Pending').length
    },
    shippedCount(): number {
      return this.activeOrders.filter(o => o.status === 'Shipped').length
    },

    // น้ำหนักรวมของที่ยัง active
    totalWeight(): number {
      return this.activeOrders.reduce((sum, o) => sum + (o.weightKg ?? 0), 0)
    },

    // Set ของหมายเลขพัสดุ (ที่ยัง active)
    parcelNosSet(): Set<string> {
      const set = new Set<string>()
      for (const o of this.activeOrders) {
        if (o.parcelNo) set.add(o.parcelNo)
      }
      return set
    },

    // ใช้ใน modal เลือก order
    pendingOrders(): Order[] {
      return this.activeOrders.filter(o => o.status === 'Pending')
    },
  },

  actions: {
    // โหลดข้อมูล (ปรับใช้ API จริงของพี่ได้)
    async fetchOrders() {
      this.loading = true
      try {
        // ------- MOCK DATA: ใช้เทสให้ UI ขึ้นก่อน -------
        const data: Order[] = [
          { orderId: 'FG-003', customer: 'Company C', status: 'Pending',  weightKg: 30, deletedAt: null },
          { orderId: 'FG-004', customer: 'Company F', status: 'Pending',  weightKg: 30, deletedAt: null },
          { orderId: 'FG-005', customer: 'Company F', status: 'Packed',   weightKg: 30, deletedAt: null },
          { orderId: 'FG-006', customer: 'Company F', status: 'Shipped',  weightKg: 30, deletedAt: null },
        ]
        // // ถ้าใช้ API จริง:
        // const res = await fetch('/api/orders')
        // const data = (await res.json()) as Order[]

        this.replaceAll(data)
      } finally {
        this.loading = false
      }
    },

    // ✅ แทนที่ลิสต์ทั้งหมด
    replaceAll(rows: Order[]) {
      // ทำให้แน่ใจว่าทุกแถวมี deletedAt (อย่างน้อย null)
      this.orders = rows.map(r => ({ deletedAt: null, ...r }))
    },

    // ✅ แทรก/อัปเดตตาม orderId
    upsert(row: Order) {
      const id = row.orderId
      const idx = this.orders.findIndex(o => o.orderId === id)
      const normalized: Order = { deletedAt: null, ...row }
      if (idx === -1) this.orders.push(normalized)
      else this.orders[idx] = { ...this.orders[idx], ...normalized }
    },

    // ✅ เปลี่ยนสถานะเป็น Shipped (รับได้ทั้ง array/string เดี่ยว) + ตั้งวันที่ส่ง (optional)
    markAsShipped(ids: string[] | string, shippedDate?: string) {
      const set = new Set(Array.isArray(ids) ? ids : [ids])
      for (const o of this.orders) {
        if (set.has(o.orderId)) {
          o.status = 'Shipped'
          if (shippedDate) o.deliveryDate = shippedDate
        }
      }
    },

    // ✅ ลบออกจาก state จริง ๆ (hard delete)
    hardDeleteByIds(ids: string[]) {
      const set = new Set(ids)
      this.orders = this.orders.filter(o => !set.has(o.orderId))
    },

    // (ตัวเลือก) ลบแบบ soft delete
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