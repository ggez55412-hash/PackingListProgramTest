
import { defineStore } from 'pinia'
import type { OrderRow } from '@/types/order'

/**
 * แนะนำให้เพิ่มฟิลด์นี้ใน OrderRow (ใน '@/types/order') ถ้ายังไม่มี
 *   deletedAt?: number | null
 * เพื่อรองรับ soft delete
 */

export const useOrdersStore = defineStore('orders', {
  state: () => ({
    orders: [] as OrderRow[],
    _lastRemoved: null as null | { items: OrderRow[] }, // สำหรับ undo ล่าสุด
  }),

  getters: {
    // เฉพาะรายการที่ยังไม่ถูกลบ (soft)
    active: (s) => s.orders.filter(o => !o.deletedAt),
    deleted: (s) => s.orders.filter(o => !!o.deletedAt),

    // นับจาก active เท่านั้น
    count: (s): number => s.orders.filter(o => !o.deletedAt).length,
    pendingCount: (s): number =>
      s.orders.filter((r) => !r.deletedAt && r.status === 'Pending').length,
    shippedCount: (s): number =>
      s.orders.filter((r) => !r.deletedAt && r.status === 'Shipped').length,

    // น้ำหนักรวมจาก active เท่านั้น
    totalWeight: (s): number =>
      s.orders.reduce((t, r) => t + (!r.deletedAt ? (Number(r.weightKg) || 0) : 0), 0),

    parcelNosSet: (s): Set<string> =>
      new Set(
        s.orders
          .filter(o => !o.deletedAt)
          .map((o) => (o.parcelNo || '').trim())
          .filter(Boolean)
      ),
  },

  actions: {
    // แทนที่ทั้งหมด; เติม deletedAt ให้เป็น null หากไม่ระบุมา
    replaceAll(rows: OrderRow[]) {
      this.orders = rows.map(r => ({ deletedAt: null, ...r }))
      this._lastRemoved = null
    },

    // เพิ่ม/อัปเดต 1 แถว; คงค่า deletedAt เดิมไว้
    upsert(row: OrderRow) {
      const i = this.orders.findIndex((o) => o.orderId === row.orderId)
      if (i === -1) {
        this.orders.push({ deletedAt: null, ...row })
      } else {
        const prev = this.orders[i]!
        this.orders[i] = { ...prev, ...row, deletedAt: prev.deletedAt ?? null }
      }
    },

    // เปลี่ยนสถานะเป็น Shipped เป็นกลุ่ม
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

    // =========================
    //        DELETE APIs
    // =========================

    // ลบเดี่ยว (soft)
    deleteOne(orderId: string) {
      const target = this.orders.find(o => o.orderId === orderId)
      if (!target || target.deletedAt) return
      target.deletedAt = Date.now()
      this._lastRemoved = { items: [{ ...target }] }
    },

    // ลบหลายรายการ (soft)
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

    // ยกเลิกการลบ (ดึงกลับทั้งหมดที่เพิ่งลบ)
    undoDelete() {
      if (!this._lastRemoved) return
      const set = new Set(this._lastRemoved.items.map(i => i.orderId))
      for (const o of this.orders) {
        if (set.has(o.orderId)) o.deletedAt = null
      }
      this._lastRemoved = null
    },

    // ลบถาวร (เอาออกจาก state) — ใช้เมื่อยืนยันแล้ว
    hardDeleteByIds(orderIds: string[]) {
      const set = new Set(orderIds)
      this.orders = this.orders.filter(o => !set.has(o.orderId))
      this._lastRemoved = null
    },

    // เก็บกวาดทุกแถวที่ถูก soft delete ทิ้งไปถาวร
    clearDeleted() {
      this.orders = this.orders.filter(o => !o.deletedAt)
      this._lastRemoved = null
    },
  },
})
