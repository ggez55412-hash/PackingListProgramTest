<script setup lang="ts">
import { usePalletsStore } from '@/stores/pallets'
import { exportPalletLabels } from '@/utils/labels'
import { useToast } from '@/composables/useToast'

const s = usePalletsStore()
const { success } = useToast()

function split(p: string) {
  s.splitPalletOverMax(p)
  success(`Split: ${p}`)
}
async function exportLabels() {
  await exportPalletLabels(s.palletsSummary)
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center gap-2">
      <div>Max/Pallet (kg):</div>
      <input
        v-model.number="s.palletMaxKg"
        type="number"
        min="1"
        class="w-28 border rounded px-2 py-1"
      />
      <button class="px-3 py-1.5 border rounded bg-white hover:bg-gray-50" @click="exportLabels">
        Print Labels (PDF)
      </button>
    </div>

    <div class="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm">
      <table class="w-full border-collapse">
        <thead class="bg-slate-50">
          <tr class="text-left text-slate-600">
            <th class="px-3 py-3 border-b">Pallet</th>
            <th class="px-3 py-3 border-b">Lines</th>
            <th class="px-3 py-3 border-b">Weight (kg)</th>
            <th class="px-3 py-3 border-b w-56">Action</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="p in s.palletsSummary"
            :key="p.pallet"
            class="border-b even:bg-slate-50/40 hover:bg-slate-50 transition"
          >
            <td class="px-3 py-2 font-medium text-slate-800">{{ p.pallet }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
