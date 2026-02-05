<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import dayjs from 'dayjs'
import { usePalletsStore } from '@/stores/pallets'
import { useOrdersStore } from '@/stores/orders'
import type { Pallet } from '@/types/pallet'
import type { OrderRow } from '@/types/order'
import PalletHeaderInfo from '@/components/pallets/PalletHeaderInfo.vue'
import AddOrdersToPalletDialog from '@/components/pallets/AddOrdersToPalletDialog.vue'
import ProgressBar from '@/components/pallets/ProgressBar.vue'
import EmptyState from '@/components/shared/EmptyState.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { useShortcuts } from '@/composables/useShortcuts'
import { useToast } from '@/composables/useToast'

const route = useRoute()
const router = useRouter()
const pallets = usePalletsStore()
const orders = useOrdersStore()
const { success, warn, error } = useToast()

const palletId = computed(() => String(route.params.id))
const loading = ref(true)

/** ===== bind state for reactivity ===== */
const { rows, metaByPallet, palletMaxKg } = storeToRefs(pallets)
const pallet = computed<Pallet | null>(() => {
  rows.value; metaByPallet.value; palletMaxKg.value
  return pallets.byId(palletId.value)
})

/** ===== rows of this pallet (for header & progress; identical to Board calculation) ===== */
const palletRows = computed(() => {
  const id = palletId.value
  return rows.value.filter(r => {
    const v = (r as any)['Pallet Number'] ?? (r as any).PalletNumber ?? (r as any).pallet ?? (r as any).Pallet
    return (v == null ? '' : String(v).trim()) === id
  })
})
const linesCount = computed(() => palletRows.value.length)
const totalWeightRows = computed(() =>
  palletRows.value.reduce((s, r) => s + (Number((r as any).__lineWeightKg) || 0), 0)
)
const effectiveMax = computed(() => {
  const raw = pallet.value?.maxWeightKg ?? palletMaxKg.value ?? 1000
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : 1000
})
const overWeight = computed(() => totalWeightRows.value > effectiveMax.value)
const progress = computed(() => {
  const pct = (totalWeightRows.value / effectiveMax.value) * 100
  const safe = Number.isFinite(pct) ? pct : 0
  return Math.min(100, Math.max(0, Math.round(safe)))
})

/** ===== order rows (for table / status badge / view order) ===== */
const palletOrders = computed<OrderRow[]>(() => {
  const p = pallet.value
  if (!p) return []
  const index = new Map(orders.orders.map(o => [String(o.orderId), o]))
  return p.orderIds.map(id => index.get(String(id))).filter(Boolean) as OrderRow[]
})
const fallbackTransporter = computed(() =>
  palletOrders.value.map(o => (o.transporter ?? '').trim()).find(Boolean) ?? ''
)

/** ===== badge class helper ===== */
function orderStatusBadgeClass(status?: string) {
  if (status === 'Shipped') {
    return 'inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-semibold bg-emerald-50 text-emerald-700 border-emerald-200'
  }
  if (status === 'Packed') {
    return 'inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-semibold bg-indigo-50 text-indigo-700 border-indigo-200'
  }
  // Pending / default
  return 'inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-semibold bg-amber-50 text-amber-800 border-amber-200'
}

/** ===== selection ===== */
const selectedIds = ref<Set<string>>(new Set())
function setSelected(s: Set<string>) { selectedIds.value = new Set(s) }
watch(palletId, () => setSelected(new Set()))
const allChecked = computed(
  () => palletOrders.value.length > 0 && palletOrders.value.every(r => selectedIds.value.has(String(r.orderId)))
)
function toggleRow(id: string) {
  const next = new Set(selectedIds.value)
  next.has(id) ? next.delete(id) : next.add(id)
  setSelected(next)
}
function toggleAll() {
  const all = palletOrders.value.map(r => String(r.orderId))
  const next = allChecked.value ? new Set<string>() : new Set(all)
  setSelected(next)
}

/** ===== dialogs ===== */
const showAddDialog = ref(false)
const showConfirmShip = ref(false)
const showConfirmRemove = ref(false)

/** ===== header buttons state ===== */
const isShipped = computed(() => pallet.value?.status === 'Shipped')
const canAddOrders = computed(() => !isShipped.value)
const canRemoveSelected = computed(() => !isShipped.value && selectedIds.value.size > 0)
const canMarkShipped = computed(() => !isShipped.value && !overWeight.value && linesCount.value > 0)
const canReopen = computed(() => isShipped.value)

/** ===== Max Weight editor ===== */
const maxEdit = ref<string>('')
watch(pallet, (p) => {
  const base = p?.maxWeightKg ?? palletMaxKg.value ?? 1000
  maxEdit.value = String(Number(base))
}, { immediate: true })

function saveMax() {
  const p = pallet.value
  if (!p) return
  const n = Number(String(maxEdit.value).replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0) {
    error('กรุณากรอกค่าน้ำหนักมากสุดเป็นตัวเลขมากกว่า 0')
    const base = p?.maxWeightKg ?? palletMaxKg.value ?? 1000
    maxEdit.value = String(Number(base))
    return
  }
  pallets.setMaxWeight(p.id, n)     // ✅ เรียก action โดยไม่เช็ค return (แก้ TS1345)
  success(`ตั้ง Max Weight = ${n} kg สำเร็จ`)
}

/** ===== actions ===== */
function onAddOrders(ids: string[]) {
  const p = pallet.value
  if (!p || ids.length === 0) return
  pallets.addOrders(p.id, ids)      // ✅ ไม่เช็ค truthiness (action คืน void/number ก็ไม่ใช้เช็ค)
  success(`เพิ่มออเดอร์แล้ว ${ids.length} รายการ`)
}
function onRemoveSelected() { if (canRemoveSelected.value) showConfirmRemove.value = true }
function doRemoveSelected() {
  const p = pallet.value
  if (!p) return
  const ids = Array.from(selectedIds.value)
  pallets.removeOrders(p.id, ids)   // ✅ ไม่เช็ค truthiness
  setSelected(new Set())
  success(`ลบ ${ids.length} รายการออกจากพาเลทแล้ว`)
}
function onMarkShipped() {
  if (!canMarkShipped.value) {
    if (isShipped.value) return
    if (linesCount.value === 0) return warn('พาเลทยังว่างอยู่')
    if (overWeight.value) return warn('น้ำหนักรวมเกิน Max Weight')
    return
  }
  showConfirmShip.value = true
}

/** ===== mark pallet + orders shipped (แก้ TS1345: ไม่ตรวจค่าคืน) ===== */
function doMarkShipped() {
  const p = pallet.value
  if (!p) return

  // 1) Pallet -> Shipped
  pallets.markShipped(p.id)         // ✅ action คืน void → เรียกเปล่า

  // 2) Orders in pallet -> Shipped (+ set deliveryDate = today)
  const ids = p.orderIds.slice()
  if (ids.length > 0) {
    const shipDate = dayjs().format('YYYY-MM-DD')
    orders.markAsShipped(ids, shipDate)  // ✅ action คืน void → เรียกเปล่า
  }

  success('ทำเครื่องหมายพาเลทและออเดอร์ทั้งหมดเป็น Shipped แล้ว')
}
function onReopen() {
  if (!canReopen.value) return
  const p = pallet.value
  if (!p) return
  pallets.reopen(p.id)              // ✅ action คืน void → เรียกเปล่า
  success('เปิดพาเลทอีกครั้งแล้ว')
}
function openOrderDetail(id: string) {
  router.push({ name: 'order-detail', params: { id } })
}

/** ===== load data ===== */
onMounted(async () => {
  if (orders.orders.length === 0 && typeof orders.fetchOrders === 'function') {
    await orders.fetchOrders()
  }
  if (!pallets.byId(palletId.value)) {
    await pallets.fetchOne(palletId.value)
  }
  loading.value = false
})

/** ===== shortcuts ===== */
useShortcuts({
  onSelectAll: () => setSelected(new Set(palletOrders.value.map(o => String(o.orderId)))),
  onDelete: () => onRemoveSelected(),
  onEscape: () => setSelected(new Set()),
})
</script>

<template>
  <section class="space-y-4">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-bold text-slate-800">Pallet #{{ palletId }}</h1>

      <div class="flex items-center gap-2 flex-wrap">
        <!-- + Add Orders -->
        <button
          v-if="canAddOrders"
          class="btn btn-primary"
          @click="showAddDialog = true"
          title="Add pending orders into this pallet"
        >
          + Add Orders
        </button>

        <!-- Remove Selected -->
        <button
          class="btn bg-rose-500 text-white hover:bg-rose-600 disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="!canRemoveSelected"
          @click="onRemoveSelected"
          :title="isShipped ? 'Shipped: cannot remove' : (selectedIds.size===0 ? 'Select items to remove' : 'Remove selected orders')"
        >
          Remove Selected ({{ selectedIds.size }})
        </button>

        <!-- Mark Shipped / Reopen -->
        <button
          v-if="!isShipped"
          class="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="!canMarkShipped"
          @click="onMarkShipped"
          :title="overWeight ? 'Over max weight' : (linesCount===0 ? 'No lines' : 'Mark Shipped')"
        >
          Mark Shipped
        </button>
        <button
          v-else
          class="btn bg-green-500 text-white hover:bg-green-600"
          @click="onReopen"
          title="Reopen pallet"
        >
          Reopen
        </button>
      </div>
    </div>

    <!-- Max Weight editor -->
    <div class="rounded-lg border border-slate-200 bg-white p-3 flex items-center gap-3">
      <label class="text-sm text-slate-600">Max Weight (kg)</label>
      <input
        class="input w-32"
        v-model="maxEdit"
        inputmode="decimal"
        @keydown.enter.prevent="saveMax"
        :disabled="isShipped"
        :title="isShipped ? 'Pallet shipped: cannot change' : 'Set maximum weight of this pallet in kg'"
      />
      <button
        class="px-3 py-1.5 border border-slate-300 rounded-md bg-white hover:bg-slate-50 text-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
        :disabled="isShipped"
        @click="saveMax"
        title="Save max weight"
      >
        Save
      </button>
      <div class="ml-auto text-sm text-slate-500">
        Current: <b>{{ effectiveMax.toFixed(2) }}</b> kg
      </div>
    </div>

    <!-- Header info -->
    <PalletHeaderInfo
      v-if="pallet"
      :pallet="pallet"
      :orders-count="linesCount"
      :total-weight="totalWeightRows"
      :max-weight="effectiveMax"
      :fallback-transporter="fallbackTransporter"
    />

    <!-- Progress -->
    <div class="flex items-center gap-3">
      <div class="w-80 max-w-full">
        <ProgressBar :value="progress" />
      </div>
      <div class="text-sm" :class="overWeight ? 'text-rose-600 font-medium' : 'text-slate-500'">
        {{ totalWeightRows.toFixed(2) }} / {{ effectiveMax.toFixed(2) }} kg
        <span v-if="overWeight">– Over capacity</span>
      </div>
    </div>

    <!-- Table -->
    <div class="card p-0 rounded-lg overflow-hidden pallet-table">
      <div class="card-body p-0">
        <div class="max-h-[65vh] overflow-auto">
          <table class="table table-fixed w-full">
            <thead class="thead sticky top-0 z-20 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
              <tr>
                <th class="th w-10"><input type="checkbox" :checked="allChecked" @change="toggleAll" /></th>
                <th class="th">Order</th>
                <th class="th">Customer</th>
                <th class="th">Status</th>
                <th class="th">Transporter</th>
                <th class="th">Parcel No.</th>
                <th class="th">Delivery Date</th>
                <th class="th w-30 text-right sticky right-0 bg-white">Action</th>
              </tr>
            </thead>

            <tbody v-if="!loading && palletOrders.length>0">
              <tr
                v-for="(r, i) in palletOrders"
                :key="r.orderId"
                :class="[
                  'tr row-bg',
                  i % 2 === 0 ? 'zebra-odd' : 'zebra-even',
                  selectedIds.has(String(r.orderId)) && 'is-selected'
                ]"
              >
                <td class="td">
                  <input type="checkbox" :checked="selectedIds.has(String(r.orderId))" @change="toggleRow(String(r.orderId))" />
                </td>
                <td class="td font-semibold">#{{ r.orderId }}</td>
                <td class="td">{{ r.customer ?? '—' }}</td>
                <td class="td">
                  <span :class="orderStatusBadgeClass(r.status)">{{ r.status }}</span>
                </td>
                <td class="td">{{ r.transporter ?? pallet?.transporter ?? '—' }}</td>
                <td class="td">{{ r.parcelNo ?? '—' }}</td>
                <td class="td">{{ r.deliveryDate ?? '—' }}</td>
                <td class="td sticky right-0 sticky-action">
                  <div class="flex items-center justify-end gap-2 flex-nowrap whitespace-nowrap">
                    <button class="btn btn-ghost btn-sm" @click="openOrderDetail(String(r.orderId))">View</button>
                  </div>
                </td>
              </tr>
            </tbody>

            <tbody v-else-if="loading">
              <tr v-for="i in 6" :key="i" class="animate-pulse">
                <td class="td"><div class="h-4 w-4 bg-slate-200 rounded" /></td>
                <td class="td"><div class="h-4 w-24 bg-slate-200 rounded" /></td>
                <td class="td"><div class="h-4 w-32 bg-slate-200 rounded" /></td>
                <td class="td"><div class="h-5 w-20 bg-slate-200 rounded-full" /></td>
                <td class="td"><div class="h-4 w-24 bg-slate-200 rounded" /></td>
                <td class="td"><div class="h-4 w-28 bg-slate-200 rounded" /></td>
                <td class="td"><div class="h-4 w-24 bg-slate-200 rounded" /></td>
                <td class="td sticky right-0 bg-white"><div class="h-8 w-28 bg-slate-100 rounded" /></td>
              </tr>
            </tbody>

            <tbody v-else>
              <tr>
                <td class="td p-6 text-center" colspan="8">
                  <EmptyState title="No orders in this pallet" description="Add pending orders to start packing.">
                    <template #actions>
                      <button class="btn btn-primary" :disabled="!canAddOrders" @click="showAddDialog = true">
                        + Add Orders
                      </button>
                    </template>
                  </EmptyState>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- dialogs -->
    <AddOrdersToPalletDialog
      v-model="showAddDialog"
      :pallet-id="palletId"
      :existing-ids="pallet?.orderIds ?? []"
      @add="onAddOrders"
    />
    <ConfirmDialog
      v-model="showConfirmShip"
      title="Mark pallet as shipped"
      :message="`Ship pallet #${palletId}?`"
      confirm-text="Ship"
      cancel-text="Cancel"
      @confirm="doMarkShipped"
    />
    <ConfirmDialog
      v-model="showConfirmRemove"
      title="Remove orders"
      :message="`Remove ${selectedIds.size} orders from pallet #${palletId}?`"
      confirm-text="Remove"
      cancel-text="Cancel"
      @confirm="doRemoveSelected"
    />
  </section>
</template>

<style scoped>
/* zebra & layout */
tr.row-bg { --row-bg: #ffffff; }
tr.row-bg.zebra-even { --row-bg: #f8fafc; }
tr.row-bg.zebra-odd { --row-bg: #ffffff; }
tr.row-bg.is-selected { --row-bg: #eff6ff; }
tr.row-bg:hover { --row-bg: #f1f5f9; }

:deep(.pallet-table .tr .td) { background: var(--row-bg); background-clip: padding-box; }
:deep(.pallet-table .table th), :deep(.pallet-table .table td) { border-left: 0 !important; border-right: 0 !important; box-shadow: none !important; }
:deep(.pallet-table .table thead th::before), :deep(.pallet-table .table thead th::after),
:deep(.pallet-table .table tbody td::before), :deep(.pallet-table .table tbody td::after) { content: none !important; border: 0 !important; box-shadow: none !important; }
:deep(.pallet-table .divide-x > * + *), :deep(.pallet-table [class*="divide-x"] > * + *) { border-left-width: 0 !important; }

.td.sticky-action { background: var(--row-bg) !important; position: sticky; right: 0; z-index: 10; box-shadow: none !important; }
:deep(.pallet-table .table thead) { background-color: rgba(255, 255, 255, 0.95); backdrop-filter: saturate(180%) blur(4px); }
:deep(.pallet-table .table thead th) { border-bottom: 1px solid rgba(15,23,42,.12) !important; color: rgb(100 116 139); }
:deep(.pallet-table .table tbody td) { border-bottom: 1px solid rgba(15,23,42,.10) !important; }
:deep(.pallet-table .thead .th) { padding: 8px 12px; font-weight: 600; }
:deep(.pallet-table .tr .td) { padding: 8px 12px; }

/* buttons */
.btn { display:inline-flex; align-items:center; justify-content:center; border-radius:6px; padding:6px 12px; font-size:.875rem; font-weight:500; transition:.15s; }
.btn-sm { padding: 4px 10px; font-size: 0.8125rem; }
.btn-primary { background:#4f46e5; color:#fff; }
.btn-primary:hover { background:#4338ca; }
.btn-ghost { color:#0f172a; }
.btn-ghost:hover { background:#f1f5f9; }

:deep(.pallet-table .table){ border-collapse:separate; border-spacing:0; }
:deep(.pallet-table .max-h-\[65vh\]){ backface-visibility:hidden; transform:translateZ(0); }
</style>