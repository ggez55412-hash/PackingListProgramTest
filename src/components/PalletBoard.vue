<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { usePalletsStore } from '@/stores/pallets'
import { exportPalletLabels } from '@/utils/labels'
import { useToast } from '@/composables/useToast'
import EmptyState from '@/components/shared/EmptyState.vue'
import ProgressBar from '@/components/pallets/ProgressBar.vue'

const s = usePalletsStore()
const router = useRouter()
const { success, warn } = useToast()

const hasPallets = computed(() => s.palletsSummary.length > 0)

function openPallet(id: string) {
  router.push({ name: 'pallet-detail', params: { id } })
}

function split(id: string) {
  const moved = s.splitPalletOverMax(id)
  if (moved > 0) {
    success(`Split ${id} → ย้าย ${moved} แถวไปยังพาเลทย่อยแล้ว`)
  } else {
    const p = s.palletsSummary.find(x => x.pallet === id)
    if (!p) return warn('ไม่พบพาเลทนี้')
    if (p.status === 'Shipped') return warn('พาเลทถูกล็อก (Shipped)')
    if (p.weightKg <= p.maxKg) return warn('พาเลทไม่เกิน Max ไม่สามารถ Split ได้')
    warn('ไม่สามารถ Split พาเลทได้')
  }
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
  // Packed = เขียว (เหมือน Shipped), Open = เหลือง
  if (status === 'Shipped' || status === 'Packed') return 'badge-green'
  return 'badge-amber'
}

function progressPct(weight: number, max: number) {
  if (!Number.isFinite(max) || max <= 0) return 0
  const pct = (Number(weight) / Number(max)) * 100
  return Math.min(100, Math.max(0, Math.round(Number.isFinite(pct) ? pct : 0)))
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
              <span class="badge" :class="badgeClass(p.status)">{{ p.status }}</span>
            </td>

            <td class="px-3 py-2 text-slate-700">{{ p.lines }}</td>

            <td class="px-3 py-2">
              <div class="flex items-center gap-2">
                <span :class="p.warn ? 'text-rose-600 font-semibold' : 'text-slate-800'">
                  {{ Number(p.weightKg).toFixed(2) }}
                </span>
                <span class="text-slate-400">/ {{ Number(p.maxKg).toFixed(0) }}</span>
              </div>
            </td>

            <td class="px-3 py-2">
              <div class="w-40 max-w-full">
                <ProgressBar :value="progressPct(p.weightKg, p.maxKg)" :danger="p.warn" />
                <div class="text-xs text-slate-500 mt-1">
                  {{ progressPct(p.weightKg, p.maxKg) }}%
                </div>
              </div>
            </td>

            <td class="px-3 py-2 text-sm text-slate-600">
              {{ fmtDate(p.updatedAt) }}
            </td>

            <td class="px-3 py-2">
              <div class="flex items-center gap-2 flex-wrap">
                <button class="px-3 py-1.5 border rounded bg-white hover:bg-gray-50" @click="openPallet(p.pallet)">
                  View
                </button>

                <button
                  class="px-3 py-1.5 border rounded bg-white hover:bg-gray-50"
                  @click="split(p.pallet)"
                  :disabled="p.status === 'Shipped' || p.weightKg <= p.maxKg"
                  :title="p.weightKg <= p.maxKg ? 'Not over max' : 'Split pallet'"
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