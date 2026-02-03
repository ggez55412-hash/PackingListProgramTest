<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue'
import dayjs from 'dayjs'
import { useOrdersStore } from '@/stores/orders'
import type { OrderRow, ShipmentStatus } from '@/types/order'

import FiltersBar from './FiltersBar.vue'
import UpdateDialog from './UpdateDialog.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import { useToast } from '@/composables/useToast'

const store = useOrdersStore()
const { success } = useToast()

/* ---------- filter/sort ---------- */
const keyword = ref('')
const statusFilter = ref<'ALL' | ShipmentStatus>('ALL')
const transporterFilter = ref<'ALL' | string>('ALL')

const sortKey = ref<keyof OrderRow>('orderId')
const sortDir = ref<'asc' | 'desc'>('asc')

const page = ref(1)
const pageSize = ref(25)

/* ---------- transporter list ---------- */
const allTransporters = computed(() => {
  const s = new Set(store.activeOrders.map(o => (o.transporter || '').trim()).filter(Boolean))
  return Array.from(s)
})

/* ---------- filtered ---------- */
const filtered = computed<OrderRow[]>(() => {
  let rows = store.activeOrders.slice()
  const kw = keyword.value.trim().toLowerCase()

  if (kw) {
    rows = rows.filter(r =>
      String(r.orderId).toLowerCase().includes(kw) ||
      (r.customer || '').toLowerCase().includes(kw)
    )
  }
  if (statusFilter.value !== 'ALL') rows = rows.filter(r => r.status === statusFilter.value)
  if (transporterFilter.value !== 'ALL') rows = rows.filter(r => (r.transporter || '') === transporterFilter.value)

  return rows
})

/* ---------- sort ---------- */
function compareValues(a: unknown, b: unknown, key: keyof OrderRow) {
  if (key === 'deliveryDate') {
    const da = dayjs(a as any), db = dayjs(b as any)
    return (da.isValid() ? da.valueOf() : 0) - (db.isValid() ? db.valueOf() : 0)
  }
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a ?? '').localeCompare(String(b ?? ''), undefined, { numeric: true })
}

const sorted = computed<OrderRow[]>(() => {
  const key = sortKey.value
  const dir = sortDir.value === 'asc' ? 1 : -1
  return filtered.value.slice().sort((a, b) => dir * compareValues(a[key], b[key], key))
})

/* ---------- pagination ---------- */
const totalPages = computed(() => Math.max(1, Math.ceil(sorted.value.length / pageSize.value)))
const paged = computed<OrderRow[]>(() => {
  const start = (page.value - 1) * pageSize.value
  return sorted.value.slice(start, start + pageSize.value)
})

watch([sorted, pageSize], () => {
  if (page.value > totalPages.value) page.value = totalPages.value
})

/* ---------- summary ---------- */
const filteredWeight = computed(() =>
  filtered.value.reduce((s, r) => s + (Number(r.weightKg) || 0), 0)
)

const selectedIds = ref<Set<string>>(new Set())

const selectedWeight = computed(() => {
  if (!selectedIds.value.size) return 0
  const set = selectedIds.value
  return store.activeOrders.reduce((s, r) =>
    set.has(String(r.orderId)) ? s + (Number(r.weightKg) || 0) : s
  , 0)
})

const pagedWeight = computed(() =>
  paged.value.reduce((s, r) => s + (Number(r.weightKg) || 0), 0)
)

/* ---------- selection ---------- */
function setSelected(s: Set<string>) {
  selectedIds.value = new Set(s)
}

const allOnPageChecked = computed(
  () => paged.value.length > 0 && paged.value.every(r => selectedIds.value.has(String(r.orderId))),
)

function toggleSelectAllOnPage() {
  const next = new Set(selectedIds.value)
  if (allOnPageChecked.value)
    paged.value.forEach(r => next.delete(String(r.orderId)))
  else
    paged.value.forEach(r => next.add(String(r.orderId)))
  setSelected(next)
}

function toggleSelect(id: string) {
  const next = new Set(selectedIds.value)
  next.has(id) ? next.delete(id) : next.add(id)
  setSelected(next)
}

/* ---------- dialogs ---------- */
const showDialog = ref(false)
const selectedRow = ref<OrderRow | null>(null)

function openUpdate(row: OrderRow) {
  selectedRow.value = { ...row }
  showDialog.value = true
}

function onSave(updated: OrderRow) {
  store.upsert(updated)
  success(`Saved ${updated.orderId}`)
  showDialog.value = false
}

/* ---------- delete ---------- */
const showConfirmDelete = ref(false)
const pendingDeleteIds = ref<string[]>([])

function openDeleteSelected() {
  if (!selectedIds.value.size) return
  pendingDeleteIds.value = Array.from(selectedIds.value)
  showConfirmDelete.value = true
}

function doDeleteConfirmed() {
  store.hardDeleteByIds(pendingDeleteIds.value)
  pendingDeleteIds.value = []
  selectedIds.value = new Set()
  showConfirmDelete.value = false
  success('Deleted')
}

/* ---------- shipped ---------- */
const showConfirmShipped = ref(false)

function openConfirmShipped() {
  if (!selectedIds.value.size) return
  showConfirmShipped.value = true
}

function doMarkShipped() {
  const ids = Array.from(selectedIds.value)
  store.markAsShipped(ids, dayjs().format('YYYY-MM-DD'))
  selectedIds.value = new Set()
  success(`Marked shipped: ${ids.length}`)
}

/* ---------- inline weight editing (fully fixed) ---------- */
function parseWeight(v: string): number | null {
  if (!v) return null

  let t = v.replace(',', '.').replace(/[^\d.\-]/g, '').trim()
  if (!t) return null

  const parts = t.split('.')
  if (parts.length > 2) t = parts[0] + '.' + parts.slice(1).join('')

  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

const editingRow = ref<number | null>(null)
const editBuffer = ref('')
const weightInputs = ref<Record<number, HTMLInputElement | null>>({})
const weightError = ref('')

function realIndexOf(orderId: string): number {
  return store.activeOrders.findIndex(o => String(o.orderId) === String(orderId))
}

function getOrderByIndex(i: number) {
  return i >= 0 ? store.activeOrders[i] : null
}

function startEdit(pageIdx: number, selectAll = true) {
  const row = paged.value[pageIdx]
  if (!row) return

  const real = realIndexOf(row.orderId)
  if (real < 0) return

  editingRow.value = real
  editBuffer.value = row.weightKg != null ? String(row.weightKg) : ''

  nextTick(() => {
    const el = weightInputs.value[real]
    if (el) {
      el.focus()
      if (selectAll) el.select()
    }
  })
}

function commitEdit(realIndex: number) {
  const row = getOrderByIndex(realIndex)
  if (!row) return false

  const n = parseWeight(editBuffer.value)
  if (n == null || n < 0) {
    weightError.value = 'ตัวเลขไม่ถูกต้อง'
    nextTick(() => weightInputs.value[realIndex]?.focus())
    return false
  }

  weightError.value = ''
  store.upsert({ ...row, weightKg: n })
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

  if (e.key === 'Enter' || e.key === 'Tab') {
    e.preventDefault()
    const ok = commitEdit(realIndex)
    if (!ok) return

    const current = store.activeOrders[realIndex]
    if (!current) return

    const pageIdx = paged.value.findIndex(r => String(r.orderId) === String(current.orderId))
    const nextIdx = e.shiftKey ? pageIdx - 1 : pageIdx + 1

    if (nextIdx >= 0 && nextIdx < paged.value.length)
      startEdit(nextIdx)
  }
}

function onWeightPaste(e: ClipboardEvent, realIndex: number) {
  const text = e.clipboardData?.getData('text') ?? ''
  const lines = text.split(/\r?\n/).map(t => t.trim()).filter(Boolean)
  if (lines.length <= 1) return

  e.preventDefault()

  let idx = realIndex
  for (const line of lines) {
    if (idx >= store.activeOrders.length) break
    const n = parseWeight(line)
    const row = getOrderByIndex(idx)
    if (row && n != null) store.upsert({ ...row, weightKg: n })
    idx++
  }
}
</script>

<template>
  <section class="space-y-4">
    <div class="text-xl font-bold">Dashboard</div>

    <!-- Summary -->
    <div class="flex flex-wrap gap-2">
      <div class="chip">Total: <b>{{ store.count }}</b></div>
      <div class="chip">Pending: <b>{{ store.pendingCount }}</b></div>
      <div class="chip">Shipped: <b>{{ store.shippedCount }}</b></div>
      <div class="chip">Filtered: <b>{{ filteredWeight.toFixed(2) }}</b> kg</div>
      <div class="chip">Selected: <b>{{ selectedWeight.toFixed(2) }}</b> kg</div>
    </div>

    <FiltersBar
      :transporters="allTransporters"
      :exportRows="sorted"
      @update:keyword="v => { keyword = v; page = 1 }"
      @update:status="v => { statusFilter = v; page = 1 }"
      @update:transporter="v => { transporterFilter = v; page = 1 }"
    />

    <!-- Table -->
    <div class="card p-0">
      <table class="table w-full">
        <thead class="thead">
          <tr>
            <th class="th w-10">
              <input type="checkbox" :checked="allOnPageChecked" @change="toggleSelectAllOnPage" />
            </th>
            <th class="th">Order ID</th>
            <th class="th">Customer</th>
            <th class="th">Status</th>
            <th class="th">Transporter</th>
            <th class="th">Parcel No</th>
            <th class="th">Date</th>
            <th class="th">Weight</th>
            <th class="th w-28">Action</th>
          </tr>
        </thead>

        <tbody>
          <tr v-for="(r, pageIdx) in paged" :key="r.orderId" class="tr">
            <td class="td">
              <input type="checkbox" :checked="selectedIds.has(String(r.orderId))" @change="toggleSelect(String(r.orderId))" />
            </td>

            <td class="td font-semibold">{{ r.orderId }}</td>
            <td class="td">{{ r.customer || '—' }}</td>

            <td class="td">
              <span class="badge" :class="r.status === 'Pending' ? 'badge-amber' : 'badge-green'">
                {{ r.status }}
              </span>
            </td>

            <td class="td">{{ r.transporter || '—' }}</td>
            <td class="td">{{ r.parcelNo || '—' }}</td>
            <td class="td">{{ r.deliveryDate || '—' }}</td>

            <!-- Editable Weight -->
            <td class="td">
              <div
                v-if="editingRow !== realIndexOf(r.orderId)"
                class="cursor-text"
                @click="startEdit(pageIdx)"
              >
                {{ r.weightKg != null ? Number(r.weightKg).toFixed(2) : '' }}
              </div>

              <div v-else>
                <input
                  :ref="el => { weightInputs[realIndexOf(r.orderId)] = el as HTMLInputElement | null }"
                  v-model="editBuffer"
                  class="input w-24"
                  inputmode="decimal"
                  @keydown="e => onWeightKeydown(e, realIndexOf(r.orderId))"
                  @blur="commitEdit(realIndexOf(r.orderId))"
                  @paste="e => onWeightPaste(e, realIndexOf(r.orderId))"
                />
                <div class="text-red-600 text-xs" v-if="weightError">
                  {{ weightError }}
                </div>
              </div>
            </td>

            <td class="td">
              <button class="btn btn-sm btn-ghost" @click="openUpdate(r)">Edit</button>
            </td>
          </tr>
        </tbody>

        <tfoot>
          <tr>
            <td class="td" colspan="7"></td>
            <td class="td text-right font-bold">{{ pagedWeight.toFixed(2) }} kg</td>
            <td class="td"></td>
          </tr>
        </tfoot>
      </table>

      <div class="card-footer flex gap-2">
        <button class="btn btn-ghost" :disabled="!selectedIds.size" @click="openConfirmShipped">
          Mark Shipped ({{ selectedIds.size }})
        </button>

        <button class="btn bg-rose-600 text-white" :disabled="!selectedIds.size" @click="openDeleteSelected">
          Delete ({{ selectedIds.size }})
        </button>

        <div class="ml-auto flex items-center gap-2">
          <button class="btn btn-ghost" :disabled="page <= 1" @click="page--">Prev</button>
          <span>Page {{ page }} / {{ totalPages }}</span>
          <button class="btn btn-ghost" :disabled="page >= totalPages" @click="page++">Next</button>
        </div>
      </div>
    </div>

    <UpdateDialog v-model="showDialog" :order="selectedRow" :existingParcelNos="store.parcelNosSet" @save="onSave" />

    <ConfirmDialog
      v-model="showConfirmDelete"
      title="Delete Orders"
      :message="`Delete ${pendingDeleteIds.length} orders?`"
      confirm-text="Delete"
      cancel-text="Cancel"
      @confirm="doDeleteConfirmed"
    />

    <ConfirmDialog
      v-model="showConfirmShipped"
      title="Mark Shipped"
      :message="`Mark ${selectedIds.size} orders as shipped?`"
      confirm-text="Ship"
      cancel-text="Cancel"
      @confirm="doMarkShipped"
    />
  </section>
</template>