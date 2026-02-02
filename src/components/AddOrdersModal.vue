<!-- src/components/AddOrdersModal.vue -->
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

const store = useOrdersStore()

const keyword = ref('')
const selectedIds = ref<string[]>([])

const candidates = computed(() => {
  const existing = new Set(props.existingIds.map(String))
  return store.pendingOrders
    .filter(o => !existing.has(String(o.orderId)))
    .filter(o => {
      const kw = keyword.value.trim().toLowerCase()
      if (!kw) return true
      const idStr = String(o.orderId)
      return idStr.toLowerCase().includes(kw) || (o.customer || '').toLowerCase().includes(kw)
    })
})

function close() { emit('update:modelValue', false) }

function selectAllVisible() {
  const all = candidates.value.map(o => String(o.orderId))
  selectedIds.value = Array.from(new Set([...selectedIds.value, ...all]))
}
function unselectAllVisible() {
  const visible = new Set(candidates.value.map(o => String(o.orderId)))
  selectedIds.value = selectedIds.value.filter(id => !visible.has(id))
}

function add() {
  if (selectedIds.value.length === 0) return
  emit('add', selectedIds.value)
  selectedIds.value = []
  close()
}

watch(() => props.modelValue, async (open) => {
  if (open) {
    if (store.orders.length === 0 && typeof store.fetchOrders === 'function') {
      try { await store.fetchOrders() } catch (e) { console.error('[AddOrdersModal] fetchOrders failed', e) }
    }
    keyword.value = ''
    selectedIds.value = []
  }
}, { immediate: true })
</script>

<template>
  <div v-if="modelValue" class="fixed inset-0 z-[10000]">
    <div class="absolute inset-0 bg-black/40" @click="close"></div>

    <section
      class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
             w-[min(92vw,900px)] bg-white rounded-xl shadow-xl border"
      role="dialog" aria-modal="true"
    >
      <header class="px-5 py-3 border-b font-semibold">
        Add Orders to Pallet #{{ palletId }}
      </header>

      <div class="p-5 space-y-4">
        <div class="flex items-center gap-3">
          <input class="input w-72" placeholder="Search order / customer" v-model="keyword" />
          <button class="btn btn-ghost btn-sm" @click="selectAllVisible" :disabled="candidates.length===0">Select all</button>
          <button class="btn btn-ghost btn-sm" @click="unselectAllVisible" :disabled="candidates.length===0">Unselect all</button>
          <div class="text-sm text-slate-500 ml-auto">Selected: {{ selectedIds.length }}</div>
        </div>

        <div class="max-h-[55vh] overflow-auto border rounded">
          <table class="table table-fixed w-full">
            <thead class="thead sticky top-0 bg-white z-10">
              <tr>
                <th class="th w-10"></th>
                <th class="th">Order</th>
                <th class="th">Customer</th>
                <th class="th">Weight</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in candidates" :key="r.orderId" class="tr">
                <td class="td">
                  <input type="checkbox" v-model="selectedIds" :value="String(r.orderId)" @click.stop />
                </td>
                <td class="td font-semibold">#{{ r.orderId }}</td>
                <td class="td">{{ r.customer || '—' }}</td>
                <td class="td">{{ (Number(r.weightKg)||0).toFixed(2) }} kg</td>
              </tr>

              <tr v-if="candidates.length===0">
                <td class="td p-6 text-center text-slate-500" colspan="4">No pending orders available</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <footer class="px-5 py-3 border-t flex justify-end gap-2">
        <button class="btn btn-ghost" @click="close">Cancel</button>
        <button class="btn btn-primary" :disabled="selectedIds.length === 0" @click="add">
          Add ({{ selectedIds.length }})
        </button>
      </footer>
    </section>
  </div>
</template>