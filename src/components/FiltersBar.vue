
<script setup lang="ts">
import { ref, watch } from 'vue'
import type { ShipmentStatus } from '@/types/order'
import { parseCSV, toCSV } from '@/utils/csv'

const props = withDefaults(defineProps<{
  transporters: string[]
  exportRows?: any[]
}>(), {
  transporters: () => [],
  exportRows: undefined
})

const emit = defineEmits<{
  (e: 'update:keyword', v: string): void
  (e: 'update:status', v: ShipmentStatus | 'ALL'): void
  (e: 'update:transporter', v: string | 'ALL'): void
  (e: 'importRows', v: any[]): void
}>()

const keyword = ref<string>('')
const status = ref<'ALL' | ShipmentStatus>('ALL')
const transporter = ref<'ALL' | string>('ALL')

watch(keyword, v => emit('update:keyword', v))
watch(status, v => emit('update:status', v))
watch(transporter, v => emit('update:transporter', v))

const fileEl = ref<HTMLInputElement | null>(null)
const isImporting = ref(false)
const isExporting = ref(false)
const importError = ref<string>('')

function browseCsv(): void {
  if (isImporting.value) return
  fileEl.value?.click()
}

function onFile(e: Event): void {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  importError.value = ''
  isImporting.value = true

  const fr = new FileReader()
  fr.onload = () => {
    try {
      const text = String(fr.result ?? '')
      const rows = parseCSV(text) // รับ string ตรง ๆ ได้แล้ว
      if (!Array.isArray(rows)) {
        importError.value = 'นำเข้าไม่สำเร็จ: รูปแบบไฟล์ไม่ถูกต้อง'
        return
      }
      emit('importRows', rows)
    } catch (err) {
      importError.value = `นำเข้าไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}`
    } finally {
      if (input) input.value = ''
      isImporting.value = false
    }
  }
  fr.onerror = () => {
    importError.value = 'ไม่สามารถอ่านไฟล์ได้'
    if (input) input.value = ''
    isImporting.value = false
  }
  fr.readAsText(file)
}

function onExport(): void {
  if (isExporting.value) return
  const data = props.exportRows
  if (!Array.isArray(data) || data.length === 0) return

  isExporting.value = true
  try {
    const csv = toCSV(data)
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'orders.csv'
    a.click()
    URL.revokeObjectURL(a.href)
  } finally {
    isExporting.value = false
  }
}
</script>

<template>
  <div class="flex flex-wrap items-end gap-3">
    <div>
      <label class="block text-sm text-slate-600 mb-1">ค้นหา</label>
      <input v-model="keyword" placeholder="Order ID / Customer" class="input w-64" type="text" />
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
        <option v-for="t in props.transporters" :key="t" :value="t">{{ t }}</option>
      </select>
    </div>

    <div class="ml-auto flex items-center gap-2">
      <input type="file" ref="fileEl" class="hidden" accept=".csv,text/csv" @change="onFile" />
      <button class="btn btn-primary" :disabled="isImporting" @click="browseCsv">
        {{ isImporting ? 'กำลังนำเข้า...' : 'Import CSV' }}
      </button>
      <button class="btn bg-green-500 text-white hover:bg-green-600" :disabled="isExporting || !props.exportRows?.length" @click="onExport">
        {{ isExporting ? 'กำลังส่งออก...' : 'Export CSV' }}
      </button>
    </div>

    <p v-if="importError" class="w-full text-sm text-red-600 mt-1">
      {{ importError }}
    </p>
  </div>
</template>
