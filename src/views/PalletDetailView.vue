<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
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
const { success, warn } = useToast()

const palletId = computed(() => String(route.params.id))

const loading = ref(true)
onMounted(async () => {
  if (!pallets.byId(palletId.value)) {
    await pallets.fetchOne(palletId.value)
  }
  loading.value = false
})

// เปลี่ยน pallet แล้วล้าง selection
watch(palletId, () => setSelected(new Set()))

const pallet = computed<Pallet | null>(() => pallets.byId(palletId.value))

// NOTE: ถ้ามี getter orders.byIdMap ใน store ให้ใช้แทน เพื่อประสิทธิภาพ
const palletOrders = computed<OrderRow[]>(() => {
  const p = pallet.value
  if (!p) return []
  const index = new Map(orders.orders.map(o => [String(o.orderId), o]))
  return p.orderIds.map(id => index.get(String(id))).filter(Boolean) as OrderRow[]
})

/** ใช้ transporter ตัวแรกจากออเดอร์เป็น fallback ของ header */
const fallbackTransporter = computed(() =>
  palletOrders.value.map(o => (o.transporter || '').trim()).find(Boolean) || ''
)

const maxWeight = computed(() => {
  const raw = pallet.value?.maxWeightKg ?? 1000
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : 1000
})
const totalWeight = computed(() => palletOrders.value.reduce((s, o) => s + (Number(o.weightKg) || 0), 0))
const overWeight = computed(() => totalWeight.value > maxWeight.value)
const progress = computed(() => {
  const pct = (totalWeight.value / maxWeight.value) * 100
  const safe = Number.isFinite(pct) ? pct : 0
  return Math.min(100, Math.max(0, Math.round(safe)))
})

// selection (แก้บั๊ก: reassign new Set เสมอ)
const selectedIds = ref<Set<string>>(new Set())
function setSelected(s: Set<string>) { selectedIds.value = new Set(s) }
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

// dialogs
const showAddDialog = ref(false)
const showConfirmShip = ref(false)
const showConfirmRemove = ref(false)

// actions
async function onAddOrders(ids: string[]) {
  if (!pallet.value || ids.length === 0) return
  pallets.addOrders(pallet.value.id, ids)
  success(`เพิ่มออเดอร์แล้ว ${ids.length} รายการ`)
}
function onRemoveSelected() {
  if (!pallet.value || selectedIds.value.size === 0) return
  showConfirmRemove.value = true
}
function doRemoveSelected() {
  const p = pallet.value
  if (!p) return
  const ids = Array.from(selectedIds.value)
  pallets.removeOrders(p.id, ids)
  setSelected(new Set())
  success(`ลบ ${ids.length} รายการออกจากพาเลทแล้ว`)
}
function onMarkShipped() {
  if (!pallet.value) return
  if (palletOrders.value.length === 0) return warn('พาเลทยังว่างอยู่')
  if (overWeight.value) return warn('น้ำหนักรวมเกิน Max Weight')
  showConfirmShip.value = true
}
function doMarkShipped() {
  const p = pallet.value
  if (!p) return
  pallets.markShipped(p.id)
  success('ทำเครื่องหมายพาเลทเป็น Shipped แล้ว')
}
function onReopen() {
  const p = pallet.value
  if (!p) return
  pallets.reopen(p.id)
  success('เปิดพาเลทอีกครั้งแล้ว')
}

function openOrderDetail(id: string) {
  router.push({ name: 'order-detail', params: { id } })
}

// shortcuts
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
      <div class="flex items-center gap-2">
        <button
          class="btn bg-rose-500 text-white hover:bg-rose-600"
          :disabled="!pallet || pallet.status==='Shipped' || selectedIds.size===0"
          title="Remove selected from pallet"
          @click="onRemoveSelected">
          Remove Selected ({{ selectedIds.size }})
        </button>
        <button
          v-if="pallet?.status !== 'Shipped'"
          class="btn btn-primary"
          :disabled="!pallet || palletOrders.length===0 || overWeight"
          :title="overWeight ? 'Over max weight' : 'Mark shipped'"
          @click="onMarkShipped">
          Mark Shipped
        </button>
        <button
          v-else
          class="btn bg-green-500 text-white hover:bg-green-600"
          @click="onReopen"
          title="Reopen pallet">
          Reopen
        </button>
      </div>
    </div>

    <!-- Header info -->
    <PalletHeaderInfo
      v-if="pallet"
      :pallet="pallet"
      :orders-count="palletOrders.length"
      :total-weight="totalWeight"
      :max-weight="maxWeight"
      :fallback-transporter="fallbackTransporter"
    />

    <!-- Progress -->
    <div class="flex items-center gap-3">
      <div class="w-80 max-w-full">
        <ProgressBar :value="progress" />
      </div>
      <div class="text-sm" :class="overWeight ? 'text-rose-600 font-medium' : 'text-slate-500'">
        {{ totalWeight.toFixed(2) }} / {{ maxWeight.toFixed(2) }} kg
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
                <th class="th w-[120px] text-right sticky right-0 bg-white">Action</th>
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
                ]">
                <td class="td">
                  <input type="checkbox" :checked="selectedIds.has(String(r.orderId))" @change="toggleRow(String(r.orderId))" />
                </td>
                <td class="td font-semibold cursor-pointer hover:underline" @click="openOrderDetail(String(r.orderId))">#{{ r.orderId }}</td>
                <td class="td">{{ r.customer || '—' }}</td>
                <td class="td">
                  <span :class="r.status === 'Pending' ? 'badge-amber' : 'badge-green'">{{ r.status }}</span>
                </td>
                <td class="td">{{ r.transporter || pallet?.transporter || '—' }}</td>
                <td class="td">{{ r.parcelNo || '—' }}</td>
                <td class="td">{{ r.deliveryDate || '—' }}</td>
                <td class="td sticky right-0 sticky-action">
                  <div class="flex items-center justify-end gap-2 flex-nowrap whitespace-nowrap">
                    <button class="btn btn-ghost btn-sm" @click="openOrderDetail(String(r.orderId))">View</button>
                  </div>
                </td>
              </tr>
            </tbody>

            <tbody v-else-if="loading">
              <tr v-for="i in 6" :key="i" class="animate-pulse">
                <td class="td"><div class="h-4 w-4 bg-slate-200 rounded"></div></td>
                <td class="td"><div class="h-4 w-24 bg-slate-200 rounded"></div></td>
                <td class="td"><div class="h-4 w-32 bg-slate-200 rounded"></div></td>
                <td class="td"><div class="h-5 w-20 bg-slate-200 rounded-full"></div></td>
                <td class="td"><div class="h-4 w-24 bg-slate-200 rounded"></div></td>
                <td class="td"><div class="h-4 w-28 bg-slate-200 rounded"></div></td>
                <td class="td"><div class="h-4 w-24 bg-slate-200 rounded"></div></td>
                <td class="td sticky right-0 bg-white"><div class="h-8 w-28 bg-slate-100 rounded"></div></td>
              </tr>
            </tbody>

            <tbody v-else>
              <tr>
                <td class="td p-6 text-center" colspan="8">
                  <EmptyState title="No orders in this pallet" description="Add pending orders to start packing.">
                    <template #actions>
                      <button class="btn btn-primary" :disabled="!pallet || pallet.status === 'Shipped'" @click="showAddDialog = true">
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
/* ================================
   TABLE COLOR SYSTEM & VERTICAL LINE FIX
   ================================ */

/* ให้ทุกแถวมีพื้นหลังเดียว (ใช้ var) เพื่อ sync กับเซลล์ sticky */
tr.row-bg { --row-bg: #ffffff; }
tr.row-bg.zebra-even { --row-bg: #f8fafc; }  /* slate-50 */
tr.row-bg.zebra-odd  { --row-bg: #ffffff; }  /* white */
tr.row-bg.is-selected { --row-bg: #eff6ff; } /* blue-50 */
tr.row-bg:hover { --row-bg: #f1f5f9; }       /* slate-100 */

/* บังคับพื้นหลังทุก td เท่ากับแถว ลดรอยต่อ/เส้นผี */
:deep(.pallet-table .tr .td) {
  background: var(--row-bg);
  background-clip: padding-box;
}

/* ลบเส้นแนวตั้งจากธีม (border/box-shadow/pseudo-elements) */
:deep(.pallet-table .table th),
:deep(.pallet-table .table td) {
  border-left: 0 !important;
  border-right: 0 !important;
  box-shadow: none !important;
}
:deep(.pallet-table .table thead th::before),
:deep(.pallet-table .table thead th::after),
:deep(.pallet-table .table tbody td::before),
:deep(.pallet-table .table tbody td::after) {
  content: none !important;
  border: 0 !important;
  box-shadow: none !important;
}
/* ปิด utility divide-x ทุกรูปแบบ */
:deep(.pallet-table .divide-x > * + *),
:deep(.pallet-table [class*="divide-x"] > * + *) { border-left-width: 0 !important; }

/* Sticky action ใช้พื้นหลังตามแถว และเอาเส้นคั่นซ้ายออก */
.td.sticky-action {
  background: var(--row-bg) !important;
  position: sticky;
  right: 0;
  z-index: 10; /* thead ใช้ z-20 */
  box-shadow: none !important; /* << เอาเส้นกลางออก */
}

/* Thead: พื้นขาวโปร่ง + เส้นขอบล่าง */
:deep(.pallet-table .table thead) {
  background-color: rgba(255, 255, 255, 0.95);
  backdrop-filter: saturate(180%) blur(4px);
}
:deep(.pallet-table .table thead th) {
  border-bottom: 1px solid rgba(15,23,42,.12) !important; /* slate border */
  color: rgb(100 116 139); /* slate-500 */
}

/* เส้นคั่นแนวนอนของ tbody */
:deep(.pallet-table .table tbody td) {
  border-bottom: 1px solid rgba(15,23,42,.10) !important;
}

/* ปิดเส้น/เงาพิเศษอื่น ๆ จากธีม */
:deep(.pallet-table .table thead th::before),
:deep(.pallet-table .table thead th::after),
:deep(.pallet-table .table tbody td::before),
:deep(.pallet-table .table tbody td::after) {
  content: none !important;
  box-shadow: none !important;
}

/* spacing/typography */
:deep(.pallet-table .thead .th) { padding: 8px 12px; font-weight: 600; }
:deep(.pallet-table .tr .td)    { padding: 8px 12px; }

/* badges */
.badge-amber { background: #fffbeb; color: #92400e; border: 1px solid #fcd34d; }
.badge-green { background: #ecfdf5; color: #065f46; border: 1px solid #6ee7b7; }

/* buttons */
.btn { display: inline-flex; align-items: center; justify-content: center; border-radius: 6px; padding: 6px 12px; font-size: 0.875rem; font-weight: 500; transition: .15s; }
.btn-sm { padding: 4px 10px; font-size: 0.8125rem; }
.btn-primary { background: #4f46e5; color: #fff; }
.btn-primary:hover { background: #4338ca; }
.btn-ghost { color: #0f172a; }
.btn-ghost:hover { background: #f1f5f9; }

/* ลดเส้นผีจาก sub-pixel บางเบราว์เซอร์ */
:deep(.pallet-table .table) { border-collapse: separate; border-spacing: 0; }
:deep(.pallet-table .max-h-\[65vh\]) { backface-visibility: hidden; transform: translateZ(0); }
</style>