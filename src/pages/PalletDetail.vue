<!-- src/pages/PalletDetail.vue -->
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

/** ===== rows in this pallet ===== */
const palletRows = computed(() => {
  const id = palletId.value
  return rows.value.filter(r => {
    const v = (r as any)['Pallet Number'] ?? (r as any).PalletNumber ?? (r as any).pallet ?? (r as any).Pallet
    return (v == null ? '' : String(v).trim()) === id
  })
})

/** ===== orders in this pallet ===== */
const palletOrders = computed<OrderRow[]>(() => {
  const p = pallet.value
  if (!p) return []
  const index = new Map(orders.orders.map(o => [String(o.orderId), o]))
  return p.orderIds.map(id => index.get(String(id))).filter(Boolean) as OrderRow[]
})

/** ===== weight & progress (HYBRID) ===== */
const totalWeightOrders = computed(() =>
  palletOrders.value.reduce((s, o) => s + (Number(o.weightKg) || 0), 0)
)
const totalWeightRows = computed(() =>
  palletRows.value.reduce((s, r) => s + (Number((r as any).__lineWeightKg) || 0), 0)
)
const totalWeight = computed(() => {
  const a = totalWeightOrders.value
  return a > 0 ? a : totalWeightRows.value
})
const linesCount = computed(() => palletRows.value.length)
const effectiveMax = computed(() => {
  const raw = pallet.value?.maxWeightKg ?? palletMaxKg.value ?? 1000
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : 1000
})
const overWeight = computed(() => totalWeight.value > effectiveMax.value)
const progress = computed(() => {
  const pct = (totalWeight.value / effectiveMax.value) * 100
  const safe = Number.isFinite(pct) ? pct : 0
  return Math.min(100, Math.max(0, Math.round(safe)))
})

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

/** ===== badge class helper ===== */
function orderStatusBadgeClass(status?: string) {
  if (status === 'Shipped')
    return 'inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-semibold bg-emerald-50 text-emerald-700 border-emerald-200'
  if (status === 'Packed')
    return 'inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-semibold bg-indigo-50 text-indigo-700 border-indigo-200'
  return 'inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-semibold bg-amber-50 text-amber-800 border-amber-200'
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
  pallets.setMaxWeight(p.id, n)
  success(`ตั้ง Max Weight = ${n} kg สำเร็จ`)
}

/** ===== actions ===== */
function onAddOrders(ids: string[]) {
  const p = pallet.value
  if (!p || ids.length === 0) return
  pallets.addOrders(p.id, ids)
  success(`เพิ่มออเดอร์แล้ว ${ids.length} รายการ`)
}
function onRemoveSelected() { if (canRemoveSelected.value) showConfirmRemove.value = true }
function doRemoveSelected() {
  const p = pallet.value
  if (!p) return
  const ids = Array.from(selectedIds.value)
  pallets.removeOrders(p.id, ids)
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
function doMarkShipped() {
  const p = pallet.value
  if (!p) return
  pallets.markShipped(p.id)
  const ids = p.orderIds.slice()
  if (ids.length > 0) {
    const shipDate = dayjs().format('YYYY-MM-DD')
    orders.markAsShipped(ids, shipDate)
  }
  success('ทำเครื่องหมายพาเลทและออเดอร์ทั้งหมดเป็น Shipped แล้ว')
}
function onReopen() {
  if (!canReopen.value) return
  const p = pallet.value
  if (!p) return
  pallets.reopen(p.id)
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
    if (typeof (pallets as any).fetchOne === 'function') {
      await (pallets as any).fetchOne(palletId.value)
    } else if (typeof (pallets as any).setMaxWeight === 'function') {
      ;(pallets as any).setMaxWeight(palletId.value, pallets.palletMaxKg)
    }
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
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-bold text-slate-800">Pallet #{{ palletId }}</h1>
      <div class="flex items-center gap-2 flex-wrap">
        <button v-if="canAddOrders" class="btn btn-primary" @click="showAddDialog = true" title="Add pending orders into this pallet">
          + Add Orders
        </button>
        <button class="btn bg-rose-500 text-white hover:bg-rose-600 disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="!canRemoveSelected" @click="onRemoveSelected"
                :title="isShipped ? 'Shipped: cannot remove' : (selectedIds.size===0 ? 'Select items to remove' : 'Remove selected orders')">
          Remove Selected ({{ selectedIds.size }})
        </button>
        <button v-if="!isShipped" class="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="!canMarkShipped" @click="onMarkShipped"
                :title="overWeight ? 'Over max weight' : (linesCount===0 ? 'No lines' : 'Mark Shipped')">
          Mark Shipped
        </button>
        <button v-else class="btn bg-green-500 text-white hover:bg-green-600" @click="onReopen" title="Reopen pallet">
          Reopen
        </button>
      </div>
    </div>

    <div class="rounded-lg border border-slate-200 bg-white p-3 flex items-center gap-3">
      <label class="text-sm text-slate-600">Max Weight (kg)</label>
      <input class="input w-32" v-model="maxEdit" inputmode="decimal" @keydown.enter.prevent="saveMax"
             :disabled="isShipped" :title="isShipped ? 'Pallet shipped: cannot change' : 'Set maximum weight of this pallet in kg'"/>
      <button class="px-3 py-1.5 border border-slate-300 rounded-md bg-white hover:bg-slate-50 text-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
              :disabled="isShipped" @click="saveMax" title="Save max weight">
        Save
      </button>
      <div class="ml-auto text-sm text-slate-500">
        Current: <b>{{ effectiveMax.toFixed(2) }}</b> kg
      </div>
    </div>

    <PalletHeaderInfo v-if="pallet" :pallet="pallet"
      :orders-count="linesCount" :total-weight="totalWeight" :max-weight="effectiveMax"
      :fallback-transporter="palletOrders.map(o => (o.transporter ?? '').trim()).find(Boolean) ?? ''" />

    <div class="flex items-center gap-3">
      <div class="w-80 max-w-full"><ProgressBar :value="progress" /></div>
      <div class="text-sm" :class="overWeight ? 'text-rose-600 font-medium' : 'text-slate-500'">
        {{ totalWeight.toFixed(2) }} / {{ effectiveMax.toFixed(2) }} kg
        <span v-if="overWeight">– Over capacity</span>
      </div>
    </div>

    <!-- table (เหมือนเดิม) ... -->
    <!-- (คงส่วนตารางเดิมของคุณได้เลย) -->
  </section>
</template>

<style scoped>
/* (คงสไตล์เดิมของคุณ) */
</style>