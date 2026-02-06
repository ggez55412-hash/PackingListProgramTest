<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { usePalletsStore } from '@/stores/pallets'
import { exportPalletLabels } from '@/utils/labels'
import { useToast } from '@/composables/useToast'
import EmptyState from '@/components/shared/EmptyState.vue'
import * as XLSX from "xlsx"

const s = usePalletsStore()
const router = useRouter()
const { success, warn, info } = useToast()

/* =========================
   Filters
   ========================= */
const statusFilter = ref<'ALL' | 'Open' | 'Packed' | 'Shipped'>('ALL')
const onlyOver = ref(false)
const hideShipped = ref(false)

/* =========================
   Derived lists
   ========================= */
const rawList = computed(() => s.palletsSummary ?? [])
const listAfterStatus = computed(() =>
  statusFilter.value === 'ALL'
    ? rawList.value
    : rawList.value.filter(p => p.status === statusFilter.value)
)
const listAfterOver = computed(() =>
  onlyOver.value ? listAfterStatus.value.filter(p => p.warn) : listAfterStatus.value
)
const listAfterArchive = computed(() =>
  hideShipped.value ? listAfterOver.value.filter(p => p.status !== 'Shipped') : listAfterOver.value
)
const viewList = computed(() => listAfterArchive.value)

const hasPallets = computed(() => (viewList.value?.length ?? 0) > 0)
const shippedCount = computed(() => rawList.value.filter(p => p.status === 'Shipped').length)

/* =========================
   Actions
   ========================= */
function openPallet(id: string) {
  router.push({ name: 'pallet-detail', params: { id } })
}
function canSplit(p: any) {
  return p.warn && p.status !== 'Shipped'
}
function canPack(p: any) {
  return p.status !== 'Shipped' && p.status !== 'Packed' && p.lines > 0
}

/* =========================
   Create / Assign
   ========================= */
const newPalletId = ref('')
function createPallet() {
  const id = newPalletId.value.trim()
  if (!id) return warn("กรุณากรอก Pallet ID")
  s.setMaxWeight(id, s.palletMaxKg)
  success(`สร้างพาเลตใหม่ #${id}`)
  newPalletId.value = ''
}

const assignTargetId = ref('')
const isAssigning = ref(false)
async function bulkAssignUnassigned() {
  const pid = assignTargetId.value.trim()
  if (!pid) return warn("เลือก Pallet ID ปลายทาง")
  if (s.unassignedRows.length === 0) return info("ไม่มีแถวที่ยังไม่อยู่พาเลต")
  try {
    isAssigning.value = true
    s.setMaxWeight(pid, s.palletMaxKg)
    let moved = 0
    for (const r of s.unassignedRows) {
      ;(r as any)["Pallet Number"] = pid
      moved++
    }
    s.bulkFix()
    success(`Assign แล้ว ${moved} แถว → #${pid}`)
  } finally {
    isAssigning.value = false
  }
}

/* =========================
   Archive
   ========================= */
function toggleArchiveShipped() {
  hideShipped.value = !hideShipped.value
  info(hideShipped.value ? "ซ่อน Shipped แล้ว" : "แสดง Shipped")
}

/* =========================
   Export Excel (Styled)
   ========================= */
function exportBoardExcel() {
  if (!hasPallets.value) return info("ไม่มีข้อมูลให้ส่งออก")

  // Sheet 1: Pallet summary
  const palletSheet = viewList.value.map(p => ({
    Pallet      : p.pallet,
    Status      : p.status,
    Lines       : p.lines,
    WeightKg    : Number(p.weightKg.toFixed(2)),
    MaxKg       : p.maxKg,
    ProgressPct : Math.min(100, Math.round((p.weightKg / (p.maxKg || 1)) * 100)),
    UpdatedAt   : p.updatedAt ?? "",
  }))

  // Sheet 2: Orders rows
  const orderSheet: any[] = []
  for (const r of s.rows) {
    const palletId =
      (r as any)["Pallet Number"] ??
      (r as any).PalletNumber ??
      (r as any).pallet ??
      (r as any).Pallet ?? ""

    orderSheet.push({
      Pallet      : palletId,
      OrderID     : (r as any).orderId ?? (r as any).OrderId ?? "",
      Customer    : (r as any).customer ?? "",
      Status      : (r as any).status ?? "",
      Transporter : (r as any).transporter ?? "",
      ParcelNo    : (r as any).parcelNo ?? "",
      DeliveryDate: (r as any).deliveryDate ?? "",
      WeightKg    : (r as any).Weight ?? (r as any).weight ?? 0,
      QTY         : (r as any).QTY ?? 1,
    })
  }

  // Workbook
  const wb = XLSX.utils.book_new()

  /* Utility: build sheet + apply style */
  function toSheet(name: string, rows: any[], width: number[], wrap: number[]) {
    const ws = XLSX.utils.json_to_sheet(rows)
    const ref = ws["!ref"]
    if (ref) {
      const range = XLSX.utils.decode_range(ref)

      // Header
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const addr = XLSX.utils.encode_cell({ r: 0, c: C })
        const cell = (ws as any)[addr] || ((ws as any)[addr] = { t: 's', v: '' })
        cell.s = {
          fill: { fgColor: { rgb: "EEF2FF" } },
          font: { bold: true, color: { rgb: "111827" } },
          alignment: { vertical: "center", horizontal: "center", wrapText: true },
          border: {
            top:    { style: "thin", color: { rgb: "CBD5E1" } },
            bottom: { style: "thin", color: { rgb: "CBD5E1" } },
            left:   { style: "thin", color: { rgb: "CBD5E1" } },
            right:  { style: "thin", color: { rgb: "CBD5E1" } },
          },
        }
      }

      // Wrap text for certain cols
      for (let R = 1; R <= range.e.r; R++) {
        for (const C of wrap) {
          const addr = XLSX.utils.encode_cell({ r: R, c: C })
          const cell = (ws as any)[addr]
          if (cell) {
            cell.s = {
              ...(cell.s || {}),
              alignment: { ...(cell.s?.alignment || {}), wrapText: true }
            }
          }
        }
      }
    }

    ws["!cols"] = width.map(w => ({ wch: w }))
    ;(ws as any)["!freeze"] = { rows: 1, columns: 0 }

    XLSX.utils.book_append_sheet(wb, ws, name)
  }

  toSheet("Pallets", palletSheet,
    [16, 12, 8, 12, 10, 12, 24],
    [6]
  )

  toSheet("Orders", orderSheet,
    [16, 16, 24, 12, 16, 14, 10, 6],
    [2,3,4,5]
  )

  XLSX.writeFile(wb, "Pallets_with_Orders.xlsx")
  success("Export Excel สำเร็จ")
}

/* =========================
   Print Labels
   ========================= */
async function exportLabels() {
  if (!hasPallets.value) return warn("No pallets")
  await exportPalletLabels(viewList.value)
  success("Exported labels")
}

/* =========================
   Helpers
   ========================= */
function fmtDate(iso?: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString()
}
function progressPct(weight: number, max: number) {
  if (!max) return 0
  const pct = (weight / max) * 100
  return Math.min(100, Math.round(pct))
}
function statusBadgeClass(status?: string) {
  if (status === 'Shipped') {
    return 'inline-flex px-2 py-0.5 rounded-full border text-xs font-semibold bg-emerald-50 text-emerald-700 border-emerald-200'
  }
  if (status === 'Packed') {
    return 'inline-flex px-2 py-0.5 rounded-full border text-xs font-semibold bg-indigo-50 text-indigo-700 border-indigo-200'
  }
  return 'inline-flex px-2 py-0.5 rounded-full border text-xs font-semibold bg-amber-50 text-amber-800 border-amber-200'
}
</script>

<template>
  <div class="space-y-3">

    <!-- Action Bar (⭐ ใหม่ ดูดีมาก) -->
    <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div class="flex flex-wrap items-center gap-3">

        <!-- New pallet -->
        <div class="flex items-center gap-2">
          <input v-model="newPalletId" placeholder="New Pallet ID" class="input w-44" />
          <button class="btn-primary" @click="createPallet">New Pallet</button>
        </div>

        <!-- Assign -->
        <div class="flex items-center gap-2">
          <input v-model="assignTargetId" placeholder="Assign to Pallet ID" class="input w-48" />
          <button class="btn-primary" :disabled="s.unassignedRows.length===0||isAssigning" @click="bulkAssignUnassigned">
            {{ isAssigning ? 'Assigning…' : 'Bulk Assign Unassigned' }}
          </button>
        </div>

        <!-- Archive Shipped -->
        <button class="btn-normal" @click="toggleArchiveShipped">
          {{ hideShipped ? 'Show Shipped' : `Archive Shipped (${shippedCount})` }}
        </button>

        <!-- Export Excel -->
        <button class="btn-normal" :disabled="!hasPallets" @click="exportBoardExcel">
          Export Excel
        </button>

        <!-- Print labels -->
        <button class="btn-normal" @click="exportLabels">
          Print Labels (PDF)
        </button>

        <!-- Spacer -->
        <div class="flex-1"></div>

        <!-- Status filter -->
        <select v-model="statusFilter" class="input w-32">
          <option value="ALL">All</option>
          <option>Open</option>
          <option>Packed</option>
          <option>Shipped</option>
        </select>

        <!-- Only overweight -->
        <label class="flex items-center gap-2 text-slate-700 text-sm">
          <input type="checkbox" v-model="onlyOver" />
          Only Overweight
        </label>

      </div>
    </div>

    <!-- Table -->
    <div v-if="!hasPallets" class="rounded-xl border border-slate-200 bg-white p-6">
      <EmptyState title="No pallets to show" description="Import or create pallets to start." />
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
            <th class="px-3 py-3 border-b w-[200px]">Action</th>
          </tr>
        </thead>

        <tbody>
          <tr
            v-for="p in viewList"
            :key="p.pallet"
            class="border-b even:bg-slate-50/40 hover:bg-slate-50 transition"
          >
            <td class="px-3 py-2 font-semibold text-slate-800">
              {{ p.pallet }}
              <span v-if="p.warn" class="ml-2 text-rose-600 font-semibold">⚠ Over</span>
            </td>
            <td class="px-3 py-2">
              <span :class="statusBadgeClass(p.status)">{{ p.status }}</span>
            </td>
            <td class="px-3 py-2">{{ p.lines }}</td>
            <td class="px-3 py-2">
              <div class="flex items-center gap-2">
                <span :class="p.warn ? 'text-rose-600 font-semibold' : 'text-slate-800'">
                  {{ p.weightKg.toFixed(2) }}
                </span>
                <span class="text-slate-400">/ {{ p.maxKg.toFixed(0) }}</span>
              </div>
            </td>
            <td class="px-3 py-2">
              <div class="w-40">
                <div class="w-full h-2 bg-slate-200 rounded">
                  <div
                    class="h-2 rounded"
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
              <div class="flex items-center gap-2">
                <button class="btn-table" @click="openPallet(p.pallet)">View</button>
                <button v-if="canSplit(p)" class="btn-table" @click="s.splitPalletOverMax(p.pallet)">Split</button>
                <button class="btn-table" :disabled="!canPack(p)" @click="canPack(p) && s.pack(p.pallet)">Pack</button>
              </div>
            </td>
          </tr>
        </tbody>

      </table>
    </div>
  </div>
</template>

<style scoped>
@reference '../assets/tailwind.css';

/* Inputs */
.input {
  @apply px-3 py-2 rounded-lg border border-slate-300 bg-white shadow-sm text-sm focus:ring-2 focus:ring-indigo-400;
}

/* Buttons */
.btn-normal {
  @apply px-4 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 shadow-sm transition;
}
.btn-primary {
  @apply px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm transition border border-indigo-600;
}
.btn-table {
  @apply px-3 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-sm;
}
</style>