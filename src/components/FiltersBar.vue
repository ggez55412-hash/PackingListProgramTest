<script setup lang="ts">
import { ref, watch } from 'vue'
import type { ShipmentStatus } from '@/types/order'
import {
  parseCSV,
  toCSV,
} from '@/utils/csv' /* ถ้ายังไม่มี csv.ts ให้ลบส่วน Export/Import ตรงนี้ออก หรือบอกผมจะส่งไฟล์ csv.ts ให้ */

const props = defineProps<{
  transporters: string[]
  exportRows?: any[]
}>()

const emit = defineEmits<{
  (e: 'update:keyword', v: string): void
  (e: 'update:status', v: ShipmentStatus | 'ALL'): void
  (e: 'update:transporter', v: string | 'ALL'): void
  (e: 'importRows', v: any[]): void
}>()

const keyword = ref(''),
  status = ref<'ALL' | ShipmentStatus>('ALL'),
  transporter = ref<'ALL' | string>('ALL')
watch(keyword, (v) => emit('update:keyword', v))
watch(status, (v) => emit('update:status', v))
watch(transporter, (v) => emit('update:transporter', v))

// ===== ปุ่ม Import / Export (ถ้ายังไม่ได้ใช้ csv.ts ให้คอมเมนต์โค้ดส่วนนี้ไว้ก่อนได้) =====
const fileEl = ref<HTMLInputElement | null>(null)
function browseCsv() {
  fileEl.value?.click()
}
function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const fr = new FileReader()
  fr.onload = () => {
    try {
      const text = String(fr.result || '')
      const rows = parseCSV(text)
      emit('importRows', rows)
    } finally {
      input.value = ''
    }
  }
  fr.readAsText(file)
}
function onExport() {
  if (!props.exportRows) return
  const csv = toCSV(props.exportRows as any[])
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'orders.csv'
  a.click()
  URL.revokeObjectURL(a.href)
}
</script>

<template>
  <div class="flex flex-wrap items-end gap-3">
    <div>
      <label class="block text-sm text-slate-600 mb-1">ค้นหา</label>
      <input v-model="keyword" placeholder="Order ID / Customer" class="input w-64" />
    </div>

    <div>
      <label class="block text-sm text-slate-600 mb-1">Status</label>
      <select v-model="status" class="select">
        <option value="ALL">All</option>
        <option value="Pending">Pending</option>
        <option value="Shipped">Shipped</option>
      </select>
    </div>

    <div>
      <label class="block text-sm text-slate-600 mb-1">Transporter</label>
      <select v-model="transporter" class="select">
        <option value="ALL">All</option>
        <option v-for="t in transporters" :key="t" :value="t">{{ t }}</option>
      </select>
    </div>

    <div class="ml-auto flex gap-2">
      <input type="file" ref="fileEl" class="hidden" accept=".csv" @change="onFile" />
      <button class="btn btn-ghost" @click="browseCsv">Import CSV</button>
      <button class="btn btn-ghost" @click="onExport">Export CSV</button>
    </div>
  </div>
</template>
