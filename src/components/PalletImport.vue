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
    error(`นำเข้าไม่สำเร็จ: ${e?.message ?? e}`)
  } finally {
    ;(e.target as HTMLInputElement).value = ''
  }
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center gap-2 flex-wrap">
      <!-- ซ่อน input -->
      <input
        ref="fileEl"
        type="file"
        class="hidden"
        accept=".xlsx"
        @change="onFile"
      />

      <!-- ปุ่ม Import: บังคับสไตล์ให้เหมือน New Pallet (ใช้ ! เพื่อชนชนะสไตล์เดิม) -->
      <button
        class="px-3 py-1.5 border !border-slate-300 rounded-md !bg-white hover:!bg-slate-50 !text-slate-800 shadow-sm"
        @click="fileEl?.click()"
        title="นำเข้าไฟล์ Excel (.xlsx)"
      >
        Import Excel (.xlsx)
      </button>

      <!-- ปุ่ม Normalize: สไตล์เดียวกับ New Pallet -->
      <button
        class="px-3 py-1.5 border !border-slate-300 rounded-md !bg-white hover:!bg-slate-50 !text-slate-800 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
        @click="s.bulkFix"
        :disabled="!hasData"
        title="Normalize & Recalculate"
      >
        Normalize & Recalc
      </button>
    </div>

    <!-- กล่องสรุป (เดิม) -->
    <div v-if="hasData" class="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
      <div class="px-3 py-1.5 border !border-slate-300 rounded-md !bg-white hover:!bg-slate-50 !text-slate-800 shadow-sm">Rows: <b>{{ s.rows.length }}</b></div>
      <div class="px-3 py-1.5 border !border-slate-300 rounded-md !bg-white hover:!bg-slate-50 !text-slate-800 shadow-sm">Pallets: <b>{{ s.palletsSummary.length }}</b></div>
      <div class="px-3 py-1.5 border !border-slate-300 rounded-md !bg-white hover:!bg-slate-50 !text-slate-800 shadow-sm">Errors: <b>{{ s.errors.length }}</b></div>
    </div>
  </div>
</template>