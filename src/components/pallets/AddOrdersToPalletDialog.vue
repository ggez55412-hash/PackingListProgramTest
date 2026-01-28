
<script setup lang="ts">
import { ref, computed } from 'vue'
import { useOrdersStore } from '@/stores/orders'

const props = defineProps<{
  modelValue: boolean
  palletId: string | number
  existingIds: string[]
}>()
const emit = defineEmits<{ (e:'update:modelValue', v:boolean):void; (e:'add', ids:string[]):void }>()
const store = useOrdersStore()

const keyword = ref('')
const selected = ref<Set<string>>(new Set())

const candidates = computed(() => {
  const set = new Set(props.existingIds)
  return store.orders
    .filter(o => o.status === 'Pending' && !set.has(o.orderId))
    .filter(o => {
      const kw = keyword.value.trim().toLowerCase()
      if (!kw) return true
      return o.orderId.toLowerCase().includes(kw) || (o.customer || '').toLowerCase().includes(kw)
    })
})
function toggle(id: string) {
  const s = new Set(selected.value)
  s.has(id) ? s.delete(id) : s.add(id)
  selected.value = s
}
function close() { emit('update:modelValue', false) }
function addAll() { selected.value = new Set(candidates.value.map(o => o.orderId)) }
function add() {
  if (!selected.value.size) return
  emit('add', Array.from(selected.value))
  selected.value = new Set()
  close()
}
</script>

<template>
  <div v-if="modelValue" class="fixed inset-0 z-[10000]">
    <div class="absolute inset-0 bg-black/40" @click="close"></div>
    <section class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
                    w-[min(92vw,900px)] bg-white rounded-xl shadow-xl border">
      <header class="px-5 py-3 border-b font-semibold">
        Add Orders to Pallet #{{ palletId }}
      </header>

      <div class="p-5 space-y-4">
        <div class="flex items-center gap-3">
          <input class="input w-72" placeholder="Search order / customer" v-model="keyword" />
          <button class="btn btn-ghost btn-sm" @click="addAll" :disabled="candidates.length===0">Select all</button>
          <div class="text-sm text-slate-500 ml-auto">Selected: {{ selected.size }}</div>
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
                <td class="td"><input type="checkbox" :checked="selected.has(r.orderId)" @change="toggle(r.orderId)" /></td>
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
        <button class="btn btn-primary" :disabled="!selected.size" @click="add">
          Add ({{ selected.size }})
        </button>
      </footer>
    </section>
  </div>
</template>
