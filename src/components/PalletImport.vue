<script setup lang="ts">
import { ref, computed } from 'vue'
import { parseXlsx } from '@/utils/xlsx'
import { usePalletsStore } from '@/stores/pallets'
import { useToast } from '@/composables/useToast'

const s = usePalletsStore()
const { success, error } = useToast()
const fileEl = ref<HTMLInputElement | null>(null)
const hasData = computed(() => s.rows.length > 0)

async function onFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f) return
  try {
    const rows = await parseXlsx(f)
    s.replaceAll(rows)
    success(`นำเข้า ${rows.length} แถว`)
  } catch (e: any) {
    error(`นำเข้าไม่สำเร็จ: ${e?.message || e}`)
  } finally {
    ;(e.target as HTMLInputElement).value = ''
  }
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center gap-2">
      <input ref="fileEl" type="file" class="hidden" accept=".xlsx" @change="onFile" />
      <button class="px-3 py-1.5 border rounded bg-white hover:bg-gray-50" @click="fileEl?.click()">
        Import Excel (.xlsx)
      </button>
      <button
        class="px-3 py-1.5 border rounded bg-white hover:bg-gray-50"
        @click="s.bulkFix"
        :disabled="!hasData"
      >
        Normalize & Recalc
      </button>
    </div>

    <div v-if="hasData" class="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
      <div class="px-3 py-2 bg-white border rounded">
        Rows: <b>{{ s.rows.length }}</b>
      </div>
      <div class="px-3 py-2 bg-white border rounded">
        Pallets: <b>{{ s.palletsSummary.length }}</b>
      </div>
      <div class="px-3 py-2 bg-white border rounded">
        Errors: <b>{{ s.errors.length }}</b>
      </div>
    </div>
  </div>
</template>
