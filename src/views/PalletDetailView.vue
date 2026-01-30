<script setup lang="ts">
import { onMounted, ref, computed, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { usePalletsStore } from '@/stores/pallets'
import { useOrdersStore } from '@/stores/orders'
import type { Pallet } from '@/types/pallet'
import type { OrderRow } from '@/types/order'
import PalletHeaderInfo from '@/components/pallets/PalletHeaderInfo.vue'
import AddOrdersToPalletDialog from '@/components/pallets/AddOrdersToPalletDialog.vue'
import ProgressBar from '@/components/pallets/ProgressBar.vue'
import EmptyState from '@/components/shared/EmptyState.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue' // you already have this
import { useShortcuts } from '@/composables/useShortcuts'
import { useToast } from '@/composables/useToast' // you already have this in dashboard

const route = useRoute()
const router = useRouter()
const pallets = usePalletsStore()
const orders = useOrdersStore()
const { success, warn } = useToast()

const palletId = computed(() => String(route.params.id))

const loading = ref(true)
onMounted(async () => {
  if (!pallets.byId(palletId.value)) {
    await pallets.fetchOne(palletId.value) // no-op if you keep it frontend only
  }
  loading.value = false
})

const pallet = computed<Pallet | null>(() => pallets.byId(palletId.value))
const palletOrders = computed<OrderRow[]>(() => {
  const p = pallet.value
  if (!p) return []
  const index = new Map(orders.orders.map(o => [o.orderId, o]))
  return p.orderIds.map(id => index.get(id)).filter(Boolean) as OrderRow[]
})

const totalWeight = computed(() => palletOrders.value.reduce((s, o) => s + (Number(o.weightKg) || 0), 0))
const maxWeight = computed(() => pallet.value?.maxWeightKg ?? 1000)
const overWeight = computed(() => totalWeight.value > maxWeight.value)
const progress = computed(() => Math.min(100, Math.round((totalWeight.value / maxWeight.value) * 100 || 0)))

// selection
const selectedIds = ref<Set<string>>(new Set())
function setSelected(s: Set<string>) { selectedIds.value = new Set(s) }
const allChecked = computed(() => palletOrders.value.length > 0 && palletOrders.value.every(r => selectedIds.value.has(r.orderId)))
function toggleRow(id: string) { const s = new Set(selectedIds.value); s.has(id) ? s.delete(id) : s.add(id); setSelected(s) }
function toggleAll() { allChecked.value ? setSelected(new Set()) : setSelected(new Set(palletOrders.value.map(r => r.orderId))) }

// dialogs
const showAddDialog = ref(false)
const showConfirmShip = ref(false)
const showConfirmRemove = ref(false)

// actions
async function onAddOrders(ids: string[]) {
  if (!pallet.value || ids.length === 0) return
  pallets.addOrders(pallet.value.id, ids)
  success(`Added ${ids.length} orders`)
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
  success(`Removed ${ids.length} orders`)
}
function onMarkShipped() {
  if (!pallet.value) return
  if (palletOrders.value.length === 0) return warn('Pallet is empty.')
  if (overWeight.value) return warn('Pallet exceeds max weight.')
  showConfirmShip.value = true
}
function doMarkShipped() {
  const p = pallet.value
  if (!p) return
  pallets.markShipped(p.id)
  success('Pallet marked as shipped')
}
function onReopen() {
  const p = pallet.value
  if (!p) return
  pallets.reopen(p.id)
  success('Pallet reopened')
}

function openOrderDetail(id: string) {
  router.push({ name: 'order-detail', params: { id } })
}

// shortcuts
useShortcuts({
  onSelectAll: () => setSelected(new Set(palletOrders.value.map(o => o.orderId))),
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
          class="btn bg-red-500 text-white hover:bg-red-600"
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
        <button v-else class="btn btn-ghost" @click="onReopen" title="Reopen pallet">
          Reopen
        </button>
      </div>
    </div>

    <PalletHeaderInfo
      v-if="pallet"
      :pallet="pallet"
      :orders-count="palletOrders.length"
      :total-weight="totalWeight"
      :max-weight="maxWeight"
    />

    <div class="flex items-center gap-3">
      <div class="w-80 max-w-full">
        <ProgressBar :value="progress" />
      </div>
      <div class="text-sm" :class="overWeight ? 'text-rose-600 font-medium' : 'text-slate-500'">
        {{ totalWeight.toFixed(2) }} / {{ maxWeight.toFixed(2) }} kg
        <span v-if="overWeight">– Over capacity</span>
      </div>
    </div>

    <div class="card p-0">
      <div class="card-body p-0">
        <div class="max-h-[65vh] overflow-auto">
          <table class="table table-fixed w-full">
            <thead class="thead sticky top-0 z-20 bg-white">
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
                  selectedIds.has(r.orderId) && 'is-selected'
                ]">
                <td class="td">
                  <input type="checkbox" :checked="selectedIds.has(r.orderId)" @change="toggleRow(r.orderId)" />
                </td>
                <td class="td font-semibold cursor-pointer hover:underline" @click="openOrderDetail(r.orderId)">#{{ r.orderId }}</td>
                <td class="td">{{ r.customer || '—' }}</td>
                <td class="td">
                  <span :class="r.status === 'Pending' ? 'badge-amber' : 'badge-green'">{{ r.status }}</span>
                </td>
                <td class="td">{{ r.transporter || '—' }}</td>
                <td class="td">{{ r.parcelNo || '—' }}</td>
                <td class="td">{{ r.deliveryDate || '—' }}</td>

                <!-- sticky action that inherits row bg -->
                <td class="td sticky right-0 sticky-action border-l border-slate-200">
                  <div class="flex items-center justify-end gap-2 flex-nowrap whitespace-nowrap">
                    <button class="btn btn-ghost btn-sm" @click="openOrderDetail(r.orderId)">View</button>
                    <button class="btn btn-outline btn-sm" @click="toggleRow(r.orderId); onRemoveSelected()">Remove</button>
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

      <div class="card-footer flex items-center gap-3">
        <div class="text-sm text-slate-600">
          {{ palletOrders.length }} orders · {{ totalWeight.toFixed(2) }} kg
        </div>
        <div class="ml-auto text-sm text-slate-500">
          Use Ctrl+A to select all · Delete to remove
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
/* unify row background for sticky cells via --row-bg */
tr.row-bg { --row-bg: #ffffff; }
tr.row-bg.zebra-even { --row-bg: #f8fafc; }  /* slate-50 */
tr.row-bg.zebra-odd  { --row-bg: #ffffff; }
tr.row-bg.is-selected { --row-bg: #eff6ff; } /* blue-50 */
tr.row-bg:hover { --row-bg: #f1f5f9; }       /* slate-100 */
.td.sticky-action { background: var(--row-bg) !important; }
</style>
