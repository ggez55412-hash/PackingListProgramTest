<!-- src/pages/PalletDetail.vue -->
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useOrdersStore } from '@/stores/orders'
import { usePalletsStore } from '@/stores/pallets'
import AddOrdersModal from '@/components/AddOrdersModal.vue'
import { useToast } from '@/composables/useToast'

const { success } = useToast()
const ordersStore = useOrdersStore()
const palletsStore = usePalletsStore()

const palletId = ref<string>('PLT-1002-S1')

const showAdd = ref(false)
const selectedIds = ref<Set<string>>(new Set())

const showDrawer = ref(false)
const viewingId = ref<string | null>(null)
const viewing = computed(() =>
  viewingId.value ? ordersStore.activeOrders.find(o => String(o.orderId) === String(viewingId.value)) ?? null : null
)

onMounted(async () => {
  if (ordersStore.orders.length === 0 && typeof ordersStore.fetchOrders === 'function') {
    await ordersStore.fetchOrders()
  }
  await palletsStore.fetchOne(palletId.value)
})

const pallet = computed(() => palletsStore.byId(palletId.value))
const palletOrderIds = computed<string[]>(() => pallet.value?.orderIds ?? [])
const existingIds = computed<string[]>(() => palletOrderIds.value)
const tableRows = computed(() => {
  const set = new Set(palletOrderIds.value.map(String))
  return ordersStore.activeOrders.filter(o => set.has(String(o.orderId)))
})

const totalWeight = computed(() => tableRows.value.reduce((s, r) => s + (r.weightKg ?? 0), 0))
const maxWeight   = computed(() => pallet.value?.maxWeightKg ?? palletsStore.palletMaxKg)
const isOver      = computed(() => totalWeight.value > maxWeight.value)

const transporterOptions = ['Kerry', 'Flash', 'J&T', 'DHL', 'Other']
const customTransporter = ref('')

function onChangeTransporter(v: string) {
  if (v === 'Other') return
  palletsStore.setTransporter(palletId.value, v)
}
function applyCustomTransporter() {
  palletsStore.setTransporter(palletId.value, customTransporter.value)
  customTransporter.value = ''
}
const maxWeightInput = ref('')
function applyMaxWeight() {
  const n = Number(maxWeightInput.value)
  if (!Number.isFinite(n) || n <= 0) { success('กรุณากรอก Max Weight เป็นตัวเลขมากกว่า 0'); return }
  palletsStore.setMaxWeight(palletId.value, n); maxWeightInput.value = ''
}

const allChecked = computed(
  () => tableRows.value.length > 0 && tableRows.value.every(r => selectedIds.value.has(String(r.orderId)))
)
function toggleAll(){ if (allChecked.value) tableRows.value.forEach(r=>selectedIds.value.delete(String(r.orderId))); else tableRows.value.forEach(r=>selectedIds.value.add(String(r.orderId))) }
function toggleOne(id: string){ const s=selectedIds.value; s.has(id)?s.delete(id):s.add(id) }

function onAddOrders(ids: string[]){ const moved=palletsStore.addOrders(palletId.value, ids); showAdd.value=false; success(`เพิ่มเข้าพาเลท ${moved} แถว`) }
function removeSelected(){ if(selectedIds.value.size===0) return; palletsStore.removeOrders(palletId.value, Array.from(selectedIds.value)); selectedIds.value.clear(); success('ลบรายการที่เลือกแล้ว') }
function markShipped(){ if(tableRows.value.length===0){ success('ไม่มีรายการในพาเลท'); return } palletsStore.markShipped(palletId.value); success('Mark pallet as Shipped') }

function openView(id:string){ viewingId.value=id; showDrawer.value=true }
function closeDrawer(){ showDrawer.value=false; viewingId.value=null }
</script>

<template>
  <section class="space-y-4">
    <!-- Header -->
    <div class="flex items-start justify-between gap-4">
      <div class="space-y-2">
        <div class="text-xl font-bold text-slate-700">Pallet #{{ palletId }}</div>

        <div class="text-sm text-slate-600 flex items-center gap-3 flex-wrap">
          <span>Status:
            <span :class="['badge', pallet?.status==='Shipped' ? 'badge-green' : 'badge-amber']">
              {{ pallet?.status ?? 'Open' }}
            </span>
          </span>
          <span>· Transporter: <b>{{ pallet?.transporter || '—' }}</b></span>
          <span>· Created: {{ pallet?.createdAt || '—' }}</span>
          <span v-if="pallet?.updatedAt">· Updated: {{ pallet?.updatedAt }}</span>
        </div>

        <!-- Weight summary -->
        <div>
          <div class="text-sm text-slate-600 mb-1">
            <b>{{ tableRows.length }}</b> orders ·
            <b>{{ totalWeight.toFixed(2) }}</b> / {{ maxWeight.toFixed(2) }} kg
          </div>
          <div class="h-2 w-full bg-slate-100 rounded">
            <div
              class="h-2 rounded"
              :class="isOver ? 'bg-rose-500' : 'bg-emerald-500'"
              :style="{ width: Math.min(100, (totalWeight / maxWeight) * 100 || 0) + '%' }"
            />
          </div>
        </div>

        <!-- Transporter & MaxWeight -->
        <div class="flex items-center gap-3 flex-wrap">
          <label class="text-sm">Transporter:</label>
          <select class="input !w-44" @change="onChangeTransporter(($event.target as HTMLSelectElement).value)">
            <option disabled selected>-- Select --</option>
            <option v-for="t in transporterOptions" :key="t" :value="t">{{ t }}</option>
          </select>
          <input v-if="(pallet?.transporter ?? '')==='Other'"
                 v-model="customTransporter" class="input !w-44" placeholder="Custom transporter" />
          <button v-if="customTransporter" class="btn btn-sm btn-primary" @click="applyCustomTransporter">Apply</button>

          <span class="mx-2 text-slate-400">|</span>

          <label class="text-sm">Max Weight (kg):</label>
          <input v-model="maxWeightInput" class="input !w-28" inputmode="decimal" placeholder="e.g. 1200" />
          <button class="btn btn-sm btn-outline" @click="applyMaxWeight">Apply</button>
        </div>
      </div>

      <!-- Head actions -->
      <div class="flex items-center gap-2 flex-wrap">
        <button class="btn btn-sm bg-rose-500 text-white hover:bg-rose-600"
                :disabled="selectedIds.size===0" @click="removeSelected">
          Remove Selected ({{ selectedIds.size }})
        </button>
        <button class="btn btn-sm btn-primary"
                :disabled="(pallet?.status ?? 'Open')==='Shipped' || tableRows.length===0"
                @click="markShipped">
          Mark Shipped
        </button>
        <button class="btn btn-primary" @click="showAdd = true">+ Add Orders</button>
      </div>
    </div>

    <!-- Table (กล่องครอบ: โค้ง + ซ่อน overflow) -->
    <div class="card pallet-table rounded-lg overflow-hidden">
      <div class="card-body p-0">
        <table class="table table-fixed w-full">
          <thead class="thead sticky top-0 bg-white z-10">
            <tr>
              <th class="th w-8"><input type="checkbox" :checked="allChecked" @change="toggleAll" /></th>
              <th class="th w-28">Order</th>
              <th class="th">Customer</th>
              <th class="th w-28">Status</th>
              <th class="th w-32">Transporter</th>
              <th class="th w-32">Parcel No.</th>
              <th class="th w-32">Delivery Date</th>
              <th class="th w-32 text-center">Action</th>
            </tr>
          </thead>

          <tbody>
            <tr v-for="r in tableRows" :key="r.orderId" class="tr">
              <td class="td">
                <input type="checkbox" :checked="selectedIds.has(String(r.orderId))" @change="toggleOne(String(r.orderId))" />
              </td>
              <td class="td font-semibold whitespace-nowrap">#{{ r.orderId }}</td>
              <td class="td">{{ r.customer || '—' }}</td>
              <td class="td">
                <span :class="['badge',
                  r.status === 'Pending' ? 'badge-amber' :
                  r.status === 'Shipped' ? 'badge-green' : 'badge-gray']">
                  {{ r.status }}
                </span>
              </td>
              <td class="td">{{ r.transporter || pallet?.transporter || '—' }}</td>
              <td class="td">{{ r.parcelNo || '—' }}</td>
              <td class="td whitespace-nowrap">{{ r.deliveryDate || '—' }}</td>

              <td class="td">
                <div class="action-buttons">
                  <button type="button" class="btn btn-sm btn-outline min-w-[72px]"
                          @click="openView(String(r.orderId))">View</button>
                </div>
              </td>
            </tr>

            <tr v-if="tableRows.length === 0">
              <td class="td p-6 text-center text-slate-500" colspan="8">
                No orders in this pallet · <span class="underline cursor-pointer" @click="showAdd=true">Add Orders</span>
              </td>
            </tr>
          </tbody>
        </table>

        <!-- ⛔️ ตัด footer hint เดิมออกตามที่ขอ -->
      </div>
    </div>

    <!-- Modal -->
    <AddOrdersModal v-model="showAdd" :palletId="palletId" :existingIds="existingIds" @add="onAddOrders" />

    <!-- Drawer -->
    <div v-if="showDrawer" class="fixed inset-0 z-[10000] flex" @click.self="closeDrawer">
      <div class="flex-1 bg-black/30" @click="closeDrawer"></div>
      <aside class="w-[min(92vw,420px)] bg-white border-l shadow-xl p-4 overflow-auto">
        <div class="flex items-center justify-between mb-3">
          <div class="text-lg font-semibold">Order #{{ viewing?.orderId }}</div>
          <button class="btn btn-sm btn-ghost" @click="closeDrawer">✕</button>
        </div>
        <div class="space-y-2 text-sm text-slate-700">
          <div><b>Customer:</b> {{ viewing?.customer || '—' }}</div>
          <div><b>Status:</b> {{ viewing?.status }}</div>
          <div><b>Transporter:</b> {{ viewing?.transporter || pallet?.transporter || '—' }}</div>
          <div><b>Parcel No.:</b> {{ viewing?.parcelNo || '—' }}</div>
          <div><b>Delivery Date:</b> {{ viewing?.deliveryDate || '—' }}</div>
          <div><b>Weight:</b> {{ (Number(viewing?.weightKg)||0).toFixed(2) }} kg</div>
        </div>
        <div class="mt-4 text-right">
          <button class="btn btn-sm btn-outline" @click="closeDrawer">Close</button>
        </div>
      </aside>
    </div>
  </section>
</template>

<style scoped>
/* badges */
.badge { @apply inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border; }
.badge-amber { @apply bg-amber-50 text-amber-700 border-amber-200; }
.badge-green { @apply bg-emerald-50 text-emerald-700 border-emerald-200; }
.badge-gray  { @apply bg-slate-50 text-slate-600 border-slate-200; }

/* buttons */
.btn { @apply inline-flex items-center justify-center rounded px-3 py-1.5 text-sm font-medium transition; }
.btn-sm { @apply px-2.5 py-1 text-sm; }
.btn-primary { @apply bg-indigo-600 text-white hover:bg-indigo-700; }
.btn-outline { @apply border border-slate-300 text-slate-700 bg-white hover:bg-slate-50; }
.btn-ghost { @apply text-slate-700 hover:bg-slate-100; }

/* card/table */
.card      { @apply border bg-white; }
.card-body { @apply p-0; }
.table     { @apply border-collapse; }
.thead .th { @apply text-left text-slate-500 font-semibold px-3 py-2 border-b; }
.tr .td    { @apply px-3 py-2 border-b align-middle; }
</style>