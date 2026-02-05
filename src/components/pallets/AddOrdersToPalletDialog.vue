<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useOrdersStore } from '@/stores/orders'

const props = defineProps<{
  modelValue: boolean
  palletId: string | number
  existingIds: string[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'add', ids: string[]): void
}>()

const orders = useOrdersStore()

const keyword = ref('')
const selected = ref<Set<string>>(new Set())

const existingSet = computed(() => new Set(props.existingIds.map(String)))

const candidates = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return orders.activeOrders
    .filter(o => o.status !== 'Shipped')
    .filter(o => !existingSet.value.has(String(o.orderId)))
    .filter(o => {
      if (!kw) return true
      const idStr = String(o.orderId).toLowerCase()
      const cust  = (o.customer ?? '').toLowerCase()
      return idStr.includes(kw) || cust.includes(kw)
    })
})

function close() { emit('update:modelValue', false) }
function add() {
  const ids = Array.from(selected.value)
  if (ids.length === 0) return
  emit('add', ids)
  selected.value = new Set()
  close()
}
function toggle(id: string) {
  const v = String(id)
  if (selected.value.has(v)) selected.value.delete(v)
  else selected.value.add(v)
  selected.value = new Set(selected.value)
}
function selectAllVisible() {
  const all = candidates.value.map(o => String(o.orderId))
  const merged = new Set(selected.value)
  all.forEach(id => merged.add(id))
  selected.value = new Set(merged)
}
function unselectAllVisible() {
  const visible = new Set(candidates.value.map(o => String(o.orderId)))
  const next = new Set<string>()
  selected.value.forEach(id => { if (!visible.has(id)) next.add(id) })
  selected.value = next
}

watch(() => props.modelValue, async open => {
  if (open) {
    keyword.value = ''
    selected.value = new Set()
    if (orders.orders.length === 0 && typeof orders.fetchOrders === 'function') {
      try { await orders.fetchOrders() } catch { /* noop */ }
    }
  }
}, { immediate: true })

function badgeClass(status?: string) {
  if (status === 'Shipped') return 'badge-green'
  if (status === 'Packed')  return 'badge-indigo'
  if (status === 'Pending') return 'badge-amber'
  return 'badge-gray'
}
</script>

<template>
  <div v-if="modelValue" class="fixed inset-0 z-[10000]">
    <div class="absolute inset-0 bg-black/40" @click="close"></div>

    <section class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
                    w-[min(92vw,900px)] bg-white rounded-xl shadow-xl border"
             role="dialog" aria-modal="true">
      <header class="px-5 py-3 border-b font-semibold">
        Add Orders to Pallet #{{ palletId }}
      </header>

      <div class="p-5 space-y-4">
        <div class="flex items-center gap-3">
          <input class="input w-72" placeholder="Search order / customer" v-model="keyword" />
          <button class="btn btn-ghost btn-sm" @click="selectAllVisible" :disabled="candidates.length===0">Select all</button>
          <button class="btn btn-ghost btn-sm" @click="unselectAllVisible" :disabled="candidates.length===0">Unselect all</button>
          <div class="text-sm text-slate-500 ml-auto">Selected: {{ selected.size }}</div>
        </div>

        <div class="max-h-[55vh] overflow-auto border rounded">
          <table class="table table-fixed w-full">
            <thead class="thead sticky top-0 bg-white z-10">
              <tr>
                <th class="th w-10"></th>
                <th class="th">Order</th>
                <th class="th">Customer</th>
                <th class="th">Status</th>
                <th class="th">Weight</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in candidates" :key="r.orderId" class="tr">
                <td class="td">
                  <input type="checkbox" :checked="selected.has(String(r.orderId))" @change="toggle(String(r.orderId))" @click.stop />
                </td>
                <td class="td font-semibold">#{{ r.orderId }}</td>
                <td class="td">{{ r.customer ?? '—' }}</td>
                <td class="td"><span :class="badgeClass(r.status)">{{ r.status }}</span></td>
                <td class="td">{{ (Number(r.weightKg) || 0).toFixed(2) }} kg</td>
              </tr>
              <tr v-if="candidates.length === 0">
                <td class="td p-6 text-center text-slate-500" colspan="5">No available orders to add</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <footer class="px-5 py-3 border-t flex justify-end gap-2">
        <button class="btn btn-ghost" @click="close">Cancel</button>
        <button class="btn btn-primary" :disabled="selected.size === 0" @click="add">Add ({{ selected.size }})</button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.btn { display:inline-flex; align-items:center; justify-content:center; border-radius:6px; padding:6px 12px; font-size:.875rem; font-weight:500; transition:.15s; }
.btn-sm { padding: 4px 10px; font-size: 0.8125rem; }
.btn-primary { background:#4f46e5; color:#fff; }
.btn-primary:hover { background:#4338ca; }
.btn-ghost { color:#0f172a; }
.btn-ghost:hover { background:#f1f5f9; }

/* badge styles (รวม Packed) */
.badge-amber  { background:#fffbeb; color:#92400e; border:1px solid #fcd34d; padding:.125rem .5rem; border-radius:9999px; font-weight:600; font-size:.75rem; }
.badge-green  { background:#ecfdf5; color:#065f46; border:1px solid #6ee7b7; padding:.125rem .5rem; border-radius:9999px; font-weight:600; font-size:.75rem; }
.badge-indigo { background:#eef2ff; color:#3730a3; border:1px solid #a5b4fc; padding:.125rem .5rem; border-radius:9999px; font-weight:600; font-size:.75rem; }
.badge-gray   { background:#f1f5f9; color:#334155; border:1px solid #cbd5e1; padding:.125rem .5rem; border-radius:9999px; font-weight:600; font-size:.75rem; }
</style>