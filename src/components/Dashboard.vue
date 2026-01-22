<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import dayjs from 'dayjs'
import { useOrdersStore } from '@/stores/orders'
import type { OrderRow, ShipmentStatus } from '@/types/order'

import FiltersBar from './FiltersBar.vue'
import UpdateDialog from './UpdateDialog.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import { useToast } from '@/composables/useToast'

const store = useOrdersStore()
if (store.orders.length === 0) {
  store.replaceAll([
    { orderId: 'FG-001', customer: 'Company A', status: 'Pending', weightKg: 12.5 },
    {
      orderId: 'FG-002',
      customer: 'Shop B',
      status: 'Shipped',
      transporter: 'Kerry',
      parcelNo: 'KRY12345',
      deliveryDate: '2023-10-27',
      weightKg: 10.0,
    },
    { orderId: 'FG-003', customer: 'Company C', status: 'Pending' },
  ])
}
const { success } = useToast()

/* ---------- filter/sort/page ---------- */
const keyword = ref(''),
  statusFilter = ref<'ALL' | ShipmentStatus>('ALL'),
  transporterFilter = ref<'ALL' | string>('ALL')
const sortKey = ref<keyof OrderRow>('orderId'),
  sortDir = ref<'asc' | 'desc'>('asc')
const page = ref(1),
  pageSize = ref(25)

const allTransporters = computed(() => {
  const s = new Set(store.orders.map((o) => (o.transporter || '').trim()).filter(Boolean))
  return Array.from(s)
})

const filtered = computed<OrderRow[]>(() => {
  let rows = store.orders.slice()
  const kw = keyword.value.trim().toLowerCase()
  if (kw)
    rows = rows.filter(
      (r) => r.orderId.toLowerCase().includes(kw) || r.customer.toLowerCase().includes(kw),
    )
  if (statusFilter.value !== 'ALL') rows = rows.filter((r) => r.status === statusFilter.value)
  if (transporterFilter.value !== 'ALL')
    rows = rows.filter((r) => (r.transporter || '') === transporterFilter.value)
  return rows
})

const sorted = computed<OrderRow[]>(() => {
  const key = sortKey.value,
    dir = sortDir.value === 'asc' ? 1 : -1
  return filtered.value.slice().sort((a, b) => {
    const va = (a[key] ?? '') as any,
      vb = (b[key] ?? '') as any
    if (va < vb) return -1 * dir
    if (va > vb) return 1 * dir
    return 0
  })
})

const totalPages = computed(() => Math.max(1, Math.ceil(sorted.value.length / pageSize.value)))
const paged = computed<OrderRow[]>(() => {
  const start = (page.value - 1) * pageSize.value
  return sorted.value.slice(start, start + pageSize.value)
})
function onSort(key: keyof OrderRow) {
  if (sortKey.value === key) sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  else {
    sortKey.value = key
    sortDir.value = 'asc'
  }
}

/* ---------- selection ---------- */
const selectedIds = ref<Set<string>>(new Set())
const allOnPageChecked = computed(
  () => paged.value.length > 0 && paged.value.every((r) => selectedIds.value.has(r.orderId)),
)
function toggleSelectAllOnPage() {
  if (allOnPageChecked.value) paged.value.forEach((r) => selectedIds.value.delete(r.orderId))
  else paged.value.forEach((r) => selectedIds.value.add(r.orderId))
}
function toggleSelect(id: string) {
  if (selectedIds.value.has(id)) selectedIds.value.delete(id)
  else selectedIds.value.add(id)
}

/* ---------- dialog ---------- */
const showDialog = ref(false),
  selectedRow = ref<OrderRow | null>(null)
function openUpdate(row: OrderRow) {
  selectedRow.value = { ...row }
  showDialog.value = true
}
function onSave(updated: OrderRow) {
  store.upsert(updated)
  success(`บันทึกออเดอร์ ${updated.orderId} สำเร็จ`)
}

/* ---------- confirm bulk ---------- */
const showConfirm = ref(false)
function openConfirmShipped() {
  if (selectedIds.value.size === 0) return
  showConfirm.value = true
}
function doMarkShipped() {
  const ids = Array.from(selectedIds.value)
  store.markAsShipped(ids, dayjs().format('YYYY-MM-DD'))
  selectedIds.value.clear()
  success(`ทำเครื่องหมาย Shipped จำนวน ${ids.length} แถว`)
}

/* ---------- summary chips ---------- */
const summary = computed(() => ({
  total: store.count,
  pending: store.pendingCount,
  shipped: store.shippedCount,
  weight: store.totalWeight,
}))

/* ---------- Excel-like weight cell ---------- */
const editingRow = ref<number | null>(null)
const editBuffer = ref<string>(''),
  weightInputs = ref<Record<number, HTMLInputElement | null>>({}),
  weightError = ref<string>('')
function formatWeight(n?: number | string) {
  // 1. ตรวจสอบว่าเป็นค่าว่างหรือไม่
  if (n == null || n === '') return ''
  
  // 2. แปลงค่าเป็น Number เพื่อความปลอดภัย (เผื่อกรณีข้อมูลเป็น string)
  const num = Number(n)
  
  // 3. ตรวจสอบว่าแปลงสำเร็จหรือไม่ (ไม่ใช่ NaN) ก่อนใช้ toFixed
  return Number.isNaN(num) ? '' : num.toFixed(2)
}
function parseWeight(input: string): number | null {
  const s = input.replace(',', '.').replace(/[^\d.]/g, '')
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}
function validateWeightString(s: string): string {
  if (!s.trim()) return 'กรอกน้ำหนัก'
  const n = parseWeight(s)
  if (n == null) return 'รูปแบบตัวเลขไม่ถูกต้อง'
  if (n < 0) return 'ต้องไม่ติดลบ'
  if (n > 10000) return 'มากเกินไป'
  return ''
}
function realIndexOf(orderId: string): number {
  return store.orders.findIndex((o) => o.orderId === orderId)
}
function getOrderByIndex(i: number) {
  return i >= 0 ? (store.orders[i] ?? null) : null
}

function startEdit(pageIdx: number, selectAll = true) {
  const row = paged.value[pageIdx]
  if (!row) return
  const ri = realIndexOf(row.orderId)
  if (ri < 0) return
  editingRow.value = ri
  editBuffer.value = store.orders[ri]?.weightKg != null ? String(store.orders[ri]!.weightKg) : ''
  weightError.value = ''
  nextTick(() => {
    weightInputs.value[ri]?.focus()
    if (selectAll) weightInputs.value[ri]?.select()
  })
}
function commitEdit(realIndex: number) {
  const current = getOrderByIndex(realIndex)
  if (!current) return false
  const err = validateWeightString(editBuffer.value)
  weightError.value = err
  if (err) {
    nextTick(() => weightInputs.value[realIndex]?.focus())
    return false
  }
  const v = parseWeight(editBuffer.value)!
  store.upsert({ ...current, weightKg: v })
  editingRow.value = null
  return true
}
function cancelEdit() {
  editingRow.value = null
  weightError.value = ''
}
function onWeightKeydown(e: KeyboardEvent, realIndex: number) {
  if (e.key === 'Escape') {
    e.preventDefault()
    cancelEdit()
    return
  }
  const current = getOrderByIndex(realIndex)
  if (!current) return

  if (e.key === 'Enter' || e.key === 'Tab') {
    e.preventDefault()
    const ok = commitEdit(realIndex)
    if (!ok) return
    const pageIdx = paged.value.findIndex((r) => r.orderId === current.orderId)
    const nextIdx = e.shiftKey ? pageIdx - 1 : pageIdx + 1
    if (nextIdx >= 0 && nextIdx < paged.value.length) startEdit(nextIdx)
    return
  }

  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    const ok = commitEdit(realIndex)
    if (!ok) return
    const pageIdx = paged.value.findIndex((r) => r.orderId === current.orderId)
    if (pageIdx < 0) return
    const dir = e.key === 'ArrowDown' ? 1 : -1
    const nextIdx = Math.min(Math.max(pageIdx + dir, 0), paged.value.length - 1)
    startEdit(nextIdx)
  }
}
function onWeightPaste(e: ClipboardEvent, realIndex: number) {
  const text = e.clipboardData?.getData('text') ?? ''
  const lines = text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (lines.length <= 1) return
  e.preventDefault()
  let i = realIndex
  for (const line of lines) {
    if (i >= store.orders.length) break
    const n = parseWeight(line)
    const cur = getOrderByIndex(i)
    if (cur && n != null && n >= 0) store.upsert({ ...cur, weightKg: n })
    i++
  }
  const last = Math.min(realIndex + lines.length - 1, store.orders.length - 1)
  nextTick(() => weightInputs.value[last]?.focus())
}
</script>

<template>
  <section class="space-y-4">
    <div class="text-xl font-bold text-slate-700">Shipping Management Dashboard</div>

    <!-- Summary chips -->
    <div class="flex flex-wrap gap-3">
      <div class="chip">
        Total: <b>{{ summary.total }}</b>
      </div>
      <div class="chip">
        Pending: <b>{{ summary.pending }}</b>
      </div>
      <div class="chip">
        Shipped: <b>{{ summary.shipped }}</b>
      </div>
      <div class="chip">
        Total Weight: {{ Number(summary.weight ?? 0).toFixed(2) }} kg
      </div>
    </div>

    <!-- Filters -->
    <div class="group-box">
      <div class="group-body">
        <FiltersBar
          :transporters="allTransporters"
          :exportRows="sorted"
          @update:keyword="
            (v) => {
              keyword = v
              page = 1
            }
          "
          @update:status="
            (v) => {
              statusFilter = v
              page = 1
            }
          "
          @update:transporter="
            (v) => {
              transporterFilter = v
              page = 1
            }
          "
          @importRows="
            (rows) => {
              rows.forEach((r) => store.upsert(r))
              page = 1
            }
          "
        />
      </div>
    </div>

    <!-- Table (มีแค่ “ชุดเดียว”) -->
    <div class="table-wrap">
      <div class="card-header">Finish Goods &amp; Shipments</div>
      <div class="card-body p-0">
        <table class="table">
          <thead class="thead">
            <tr>
              <th class="th w-10">
                <input
                  type="checkbox"
                  :checked="allOnPageChecked"
                  @change="toggleSelectAllOnPage"
                />
              </th>
              <th class="th cursor-pointer" @click="onSort('orderId')">
                <span class="font-semibold">Order ID</span>
                <span class="text-xs text-slate-500" v-if="sortKey === 'orderId'"
                  >({{ sortDir }})</span
                >
              </th>
              <th class="th cursor-pointer" @click="onSort('customer')">
                Customer
                <span class="text-xs text-slate-500" v-if="sortKey === 'customer'"
                  >({{ sortDir }})</span
                >
              </th>
              <th class="th">Status</th>
              <th class="th">Transporter</th>
              <th class="th">Parcel No.</th>
              <th class="th cursor-pointer" @click="onSort('deliveryDate')">
                Delivery Date
                <span class="text-xs text-slate-500" v-if="sortKey === 'deliveryDate'"
                  >({{ sortDir }})</span
                >
              </th>
              <th class="th cursor-pointer w-[140px]" @click="onSort('weightKg')">
                Weight (kg)
                <span class="text-xs text-slate-500" v-if="sortKey === 'weightKg'"
                  >({{ sortDir }})</span
                >
              </th>
              <th class="th w-[110px]">Action</th>
            </tr>
          </thead>

          <tbody>
            <tr v-for="(r, pageIdx) in paged" :key="r.orderId" class="tr">
              <td class="td">
                <input
                  type="checkbox"
                  :checked="selectedIds.has(r.orderId)"
                  @change="toggleSelect(r.orderId)"
                />
              </td>
              <td class="td font-semibold text-slate-800">{{ r.orderId }}</td>
              <td class="td">{{ r.customer }}</td>
              <td class="td">
                <span :class="r.status === 'Pending' ? 'badge-amber' : 'badge-green'">{{
                  r.status
                }}</span>
              </td>
              <td class="td">{{ r.transporter || '' }}</td>
              <td class="td">{{ r.parcelNo || '' }}</td>
              <td class="td">{{ r.deliveryDate || '' }}</td>

              <!-- น้ำหนักแบบ Excel-like -->

              <td class="td align-top">
                <!-- โหมดดู -->
                <div
                  v-if="editingRow !== store.orders.findIndex((o) => o.orderId === r.orderId)"
                  class="min-h-[32px] flex items-center cursor-text hover:bg-slate-100 rounded px-1"
                  title="คลิกเพื่อพิมพ์ (Enter/Tab/↑/↓/Esc)"
                  @click="startEdit(pageIdx)"
                >
                  {{ formatWeight(r.weightKg) }}
                </div>

                <!-- โหมดแก้ไข -->
                <div v-else>
                  <input
                    :ref="
                      (el) => {
                        const i = store.orders.findIndex((o) => o.orderId === r.orderId)
                        if (i >= 0) weightInputs[i] = el as HTMLInputElement
                      }
                    "
                    v-model="editBuffer"
                    @keydown="
                      (e) => {
                        const i = store.orders.findIndex((o) => o.orderId === r.orderId)
                        if (i >= 0) onWeightKeydown(e, i)
                      }
                    "
                    @paste="
                      (e) => {
                        const i = store.orders.findIndex((o) => o.orderId === r.orderId)
                        if (i >= 0) onWeightPaste(e, i)
                      }
                    "
                    @blur="
                      () => {
                        const i = store.orders.findIndex((o) => o.orderId === r.orderId)
                        if (i >= 0) commitEdit(i)
                      }
                    "
                    placeholder="เช่น 12.50"
                    class="w-28 input"
                  />
                  <div v-if="weightError" class="text-rose-600 text-sm mt-1">{{ weightError }}</div>
                </div>
              </td>

              <td class="td">
                <button
                  type="button"
                  @click="openUpdate(r)"
                  :disabled="r.status === 'Shipped'"
                  :class="['btn', r.status === 'Shipped' ? 'btn-disabled' : 'btn-ghost']"
                >
                  {{ r.status === 'Shipped' ? 'Disable' : 'Update' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Bulk actions -->
      <div class="card-footer">
        <button
          class="btn btn-ghost"
          :disabled="selectedIds.size === 0"
          @click="openConfirmShipped"
        >
          Mark as Shipped ({{ selectedIds.size }})
        </button>
      </div>

      <!-- Pagination -->
      <div class="card-footer flex items-center gap-3">
        <button class="btn btn-ghost" :disabled="page <= 1" @click="page--">Prev</button>
        <div>Page {{ page }} / {{ totalPages }}</div>
        <button class="btn btn-ghost" :disabled="page >= totalPages" @click="page++">Next</button>
        <div class="ml-auto text-sm text-slate-600">
          Showing {{ paged.length }} of {{ sorted.length }}
        </div>
      </div>
    </div>

    <!-- Dialogs -->
    <UpdateDialog
      v-model="showDialog"
      :order="selectedRow"
      :existingParcelNos="store.parcelNosSet"
      @save="onSave"
    />
    <ConfirmDialog
      v-model="showConfirm"
      title="Confirm"
      :message="`ทำเครื่องหมาย Shipped จำนวน ${selectedIds.size} แถว ?`"
      confirm-text="Yes"
      cancel-text="No"
      @confirm="doMarkShipped"
    />
  </section>
</template>
