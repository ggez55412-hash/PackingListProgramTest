<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { usePalletsStore } from '@/stores/pallets'
import { exportPalletLabels } from '@/utils/labels'
import { useToast } from '@/composables/useToast'
import EmptyState from '@/components/shared/EmptyState.vue'

const s = usePalletsStore()
const router = useRouter()
const { success, warn } = useToast()

const hasPallets = computed(() => s.palletsSummary.length > 0)

function openPallet(id: string) {
  router.push({ name: 'pallet-detail', params: { id } })
}

function split(id: string) {
  s.splitPalletOverMax(id)
  success(`Split: ${id}`)
}

async function exportLabels() {
  if (!hasPallets.value) return warn('No pallets to export.')
  await exportPalletLabels(s.palletsSummary)
  success('Exported labels')
}

function fmtDate(iso?: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString()
}

function badgeClass(status: string) {
  if (status === 'Shipped') return 'badge-green'
  if (status === 'Packed') return 'badge-indigo'
  return 'badge-amber'
}

function progressPct(weight: number, max: number) {
  if (!max) return 0
  return Math.min(100, Math.round((weight / max) * 100))
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center gap-3">
      <div class="text-sm text-slate-700">Max/Pallet (kg):</div>
      <input v-model.number="s.palletMaxKg" type="number" min="1" class="w-28 border rounded px-2 py-1" />

      <button class="px-3 py-1.5 border rounded bg-white hover:bg-gray-50" @click="exportLabels">
        Print Labels (PDF)
      </button>

      <div class="ml-auto text-sm text-slate-500">
        Unassigned rows: <b>{{ s.unassignedRows.length }}</b>
      </div>
    </div>

    <div v-if="!hasPallets" class="rounded-xl border border-slate-200 bg-white p-6">
      <EmptyState
        title="No pallets yet"
        description="Import Excel (.xlsx) first, then pallets will appear here."
      />
    </div>

    <div v-else class="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm">
      <table class="w-full border-collapse">
        <thead class="bg-slate-50">
          <tr class="text-left text-slate-600">
            <th class="px-3 py-3 border-b">Pallet</th>
            <th class="px-3 py-3 border-b">Status</th>
            <th class="px-3 py-3 border-b">Lines</th>
            <th class="px-3 py-3 border-b">Weight (kg)</th>
            <th class="px-3 py-3 border-b">Progress</th>
            <th class="px-3 py-3 border-b">Updated</th>
            <th class="px-3 py-3 border-b w-64">Action</th>
          </tr>
        </thead>

        <tbody>
          <tr
            v-for="p in s.palletsSummary"
            :key="p.pallet"
            class="border-b even:bg-slate-50/40 hover:bg-slate-50 transition"
          >
            <td class="px-3 py-2 font-medium text-slate-800">
              <button class="hover:underline" @click="openPallet(p.pallet)">{{ p.pallet }}</button>
              <span v-if="p.warn" class="ml-2 text-rose-600 font-semibold">⚠ Over</span>
            </td>

            <td class="px-3 py-2">
              <span :class="badgeClass(p.status)">{{ p.status }}</span>
            </td>

            <td class="px-3 py-2 text-slate-700">{{ p.lines }}</td>

            <td class="px-3 py-2">
              <div class="flex items-center gap-2">
                <span :class="p.warn ? 'text-rose-600 font-semibold' : 'text-slate-800'">
                  {{ p.weightKg.toFixed(2) }}
                </span>
                <span class="text-slate-400">/ {{ p.maxKg.toFixed(0) }}</span>
              </div>
            </td>

            <td class="px-3 py-2">
              <div class="w-40 max-w-full">
                <div class="w-full h-2 bg-slate-200 rounded">
                  <div
                    class="h-2 rounded transition-all"
                    :class="p.warn ? 'bg-rose-500' : 'bg-emerald-500'"
                    :style="{ width: progressPct(p.weightKg, p.maxKg) + '%' }"
                  />
                </div>
                <div class="text-xs text-slate-500 mt-1">
                  {{ progressPct(p.weightKg, p.maxKg) }}%
                </div>
              </div>
            </td>

            <td class="px-3 py-2 text-sm text-slate-600">{{ fmtDate(p.updatedAt) }}</td>

            <td class="px-3 py-2">
              <div class="flex items-center gap-2 flex-wrap">
                <button class="px-3 py-1.5 border rounded bg-white hover:bg-gray-50" @click="openPallet(p.pallet)">
                  View
                </button>

                <button
                  class="px-3 py-1.5 border rounded bg-white hover:bg-gray-50"
                  @click="split(p.pallet)"
                  :disabled="!p.warn || p.status === 'Shipped'"
                  :title="p.status==='Shipped' ? 'Shipped pallets are locked' : (!p.warn ? 'Not over max' : 'Split pallet')"
                >
                  Split
                </button>

                <button
                  class="px-3 py-1.5 border rounded bg-white hover:bg-gray-50"
                  @click="s.pack(p.pallet)"
                  :disabled="p.status === 'Shipped' || p.lines === 0"
                  title="Mark as Packed"
                >
                  Pack
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>