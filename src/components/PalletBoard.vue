<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { usePalletsStore } from '@/stores/pallets'
import { exportPalletLabels } from '@/utils/labels'
import { toCSV } from '@/utils/csv'
import { useToast } from '@/composables/useToast'
import EmptyState from '@/components/shared/EmptyState.vue'
import * as XLSX from "xlsx"

const s = usePalletsStore()
const router = useRouter()
const { success, warn, info } = useToast()

/* =========================
   Filters / Toggles (UI only)
   ========================= */
const statusFilter = ref<'ALL' | 'Open' | 'Packed' | 'Shipped'>('ALL')
const onlyOver = ref(false)
const hideShipped = ref(false) // Archive Shipped (UI filter)

/* =========================
   Derived lists (filtered)
   ========================= */
const rawList = computed(() => s.palletsSummary ?? [])
const listAfterStatus = computed(() => {
  if (statusFilter.value === 'ALL') return rawList.value
  return rawList.value.filter(p => p.status === statusFilter.value)
})
const listAfterOver = computed(() => {
  return onlyOver.value ? listAfterStatus.value.filter(p => p.warn) : listAfterStatus.value
})
const listAfterArchive = computed(() => {
  return hideShipped.value ? listAfterOver.value.filter(p => p.status !== 'Shipped') : listAfterOver.value
})
const viewList = computed(() => listAfterArchive.value)

const hasPallets = computed<boolean>(() => (viewList.value?.length ?? 0) > 0)
const shippedCount = computed(() => rawList.value.filter(p => p.status === 'Shipped').length)

/* =========================
   Row-level actions
   ========================= */
function openPallet(id: string) {
  router.push({ name: 'pallet-detail', params: { id } })
}
function canSplit(p: { warn: boolean; status: string }) {
  return p.warn && p.status !== 'Shipped'
}
function canPack(p: { status: string; lines: number }) {
  return p.status !== 'Shipped' && p.status !== 'Packed' && p.lines > 0
}

/* =========================
   Top actions (kept as-is)
   ========================= */
const newPalletId = ref('')
function createPallet() {
  const id = newPalletId.value.trim()
  if (!id) { warn('กรุณากรอก Pallet ID'); return }
  s.setMaxWeight(id, s.palletMaxKg) // ensure meta
  newPalletId.value = ''
  success(`สร้างพาเลตใหม่ #${id}`)
}

const assignTargetId = ref('')
const isAssigning = ref(false)
async function bulkAssignUnassigned() {
  const pid = assignTargetId.value.trim()
  if (!pid) { warn('กรุณาเลือก/กรอก Pallet ID ปลายทาง'); return }
  if (s.unassignedRows.length === 0) { info('ไม่มีแถวที่ยังไม่อยู่พาเลต'); return }

  try {
    isAssigning.value = true
    s.setMaxWeight(pid, s.palletMaxKg) // ensure meta exists
    let moved = 0
    for (const r of s.unassignedRows) {
      ;(r as any)['Pallet Number'] = pid
      moved++
    }
    s.bulkFix()
    success(`Assign แถวที่ยังไม่อยู่พาเลตแล้ว ${moved} รายการ → #${pid}`)
  } finally {
    isAssigning.value = false
  }
}

function toggleArchiveShipped() {
  hideShipped.value = !hideShipped.value
  info(hideShipped.value ? 'ซ่อนพาเลตที่ Shipped แล้ว' : 'แสดงพาเลตที่ Shipped')
}

function exportBoardExcel() {
  if (!hasPallets.value) {
    info("ไม่มีข้อมูลให้ส่งออก")
    return
  }

  /* -------------------------------
     Sheet 1 : Pallet Summary
  --------------------------------*/
  const palletSheet = viewList.value.map(p => ({
    Pallet      : p.pallet,
    Status      : p.status,
    Lines       : p.lines,
    WeightKg    : Number(p.weightKg.toFixed(2)),
    MaxKg       : p.maxKg,
    ProgressPct : Math.min(100, Math.round((p.weightKg / (p.maxKg || 1)) * 100)),
    UpdatedAt   : p.updatedAt ?? "",
  }))

  /* -------------------------------
     Sheet 2 : Orders (SAFE TYPE)
  --------------------------------*/
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

  const wb = XLSX.utils.book_new()

  /* -------------------------------
     Utility: convert + styling
  --------------------------------*/
  function toStyledSheet(name: string, data: any[], colWidths: number[], wrapCols: number[] = []) {
    // ❗ important: remove "origin"
    const ws = XLSX.utils.json_to_sheet(data)

    const range = XLSX.utils.decode_range(ws["!ref"]!)

    // header style
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: 0, c: C })
      const cell = ws[addr] || (ws[addr] = { t: "s", v: "" } as any)

      cell.s = {
        fill: { fgColor: { rgb: "EEF2FF" } },          // header color
        font: { bold: true, color: { rgb: "111827" } },// darker text
        alignment: { vertical: "center", horizontal: "center", wrapText: true },
        border: {
          top:    { style: "thin", color: { rgb: "CBD5E1" } },
          bottom: { style: "thin", color: { rgb: "CBD5E1" } },
          left:   { style: "thin", color: { rgb: "CBD5E1" } },
          right:  { style: "thin", color: { rgb: "CBD5E1" } },
        },
      }
    }

    // wrap text columns
    for (let R = 1; R <= range.e.r; R++) {
      for (const col of wrapCols) {
        const addr = XLSX.utils.encode_cell({ r: R, c: col })
        const cell = ws[addr]
        if (!cell) continue
        cell.s = {
          ...(cell.s || {}),
          alignment: { ...(cell.s?.alignment || {}), wrapText: true },
        }
      }
    }

    // column width
    ws["!cols"] = colWidths.map(w => ({ wch: w }))

    // freeze top row
    ;(ws as any)["!freeze"] = { rows: 1, columns: 0 }

    XLSX.utils.book_append_sheet(wb, ws, name)
  }

  /* -------------------------------
     Build both sheets
  --------------------------------*/
  toStyledSheet("Pallets", palletSheet,
    /* widths */ [18, 12, 8, 12, 10, 12, 26],
    /* wrapCols */ [6] // UpdatedAt
  )

  toStyledSheet("Orders", orderSheet,
    /* widths */ [16, 18, 22, 12, 16, 16, 14, 10, 8],
    /* wrapCols */ [2, 3, 4, 5] // Customer, Transporter, ParcelNo, DeliveryDate
  )

  XLSX.writeFile(wb, "Pallets_with_Orders.xlsx")
  success("Export Excel สำเร็จ (พร้อม format)")
}

async function exportLabels() {
  if (!hasPallets.value) { warn('No pallets to export.'); return }
  await exportPalletLabels(viewList.value)
  success('Exported labels')
}

function fmtDate(iso?: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString()
}
function progressPct(weight: number, max: number) {
  if (!max) return 0
  const pct = (weight / max) * 100
  return Math.min(100, Math.round(Number.isFinite(pct) ? pct : 0))
}

/** 🔖 badge ด้วย utility (รองรับ Packed/Shipped/Open) */
function statusBadgeClass(status?: string) {
  if (status === 'Shipped') {
    return 'inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-semibold bg-emerald-50 text-emerald-700 border-emerald-200'
  }
  if (status === 'Packed') {
    return 'inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-semibold bg-indigo-50 text-indigo-700 border-indigo-200'
  }
  // Open/อื่น ๆ → โทน amber
  return 'inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-semibold bg-amber-50 text-amber-800 border-amber-200'
}
</script>

<template>
  <div class="space-y-3">
    <!-- Action bar (top) -->
    <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
      <div class="flex items-center gap-2 flex-wrap">

        <!-- New Pallet -->
        <div class="flex items-center gap-2">
          <input
            v-model="newPalletId"
            placeholder="New Pallet ID"
            class="input w-44"
          />
          <button
            class="px-3 py-1.5 border !border-slate-300 rounded-md !bg-white hover:!bg-slate-50 !text-slate-800 shadow-sm"
            @click="createPallet"
            title="Create a new empty pallet"
          >
            New Pallet
          </button>
        </div>

        <!-- Bulk Assign Unassigned -->
        <div class="flex items-center gap-2">
          <input
            v-model="assignTargetId"
            placeholder="Assign to Pallet ID"
            class="input w-48"
          />
          <button
            class="px-3 py-1.5 border !border-slate-300 rounded-md !bg-white hover:!bg-slate-50 !text-slate-800 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="s.unassignedRows.length === 0 || isAssigning"
            @click="bulkAssignUnassigned"
            title="Assign all unassigned rows into a pallet"
          >
            {{ isAssigning ? 'Assigning…' : 'Bulk Assign Unassigned' }}
          </button>
          <div class="text-sm text-slate-400" v-if="s.unassignedRows.length > 0">
            Unassigned rows: <b>{{ s.unassignedRows.length }}</b>
          </div>
        </div>

        <!-- Archive Shipped (UI Filter) -->
        <button
          class="px-3 py-1.5 border !border-slate-300 rounded-md !bg-white hover:!bg-slate-50 !text-slate-800 shadow-sm"
          @click="toggleArchiveShipped"
          :title="hideShipped ? 'Show shipped pallets' : 'Hide shipped pallets'"
        >
          {{ hideShipped ? 'Show Shipped' : `Archive Shipped (${shippedCount})` }}
        </button>

        <!-- Export/Print -->
        
<button
  class="px-3 py-1.5 border border-slate-300 rounded-md bg-white hover:bg-slate-50 text-slate-800 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
  :disabled="!hasPallets"
  @click="exportBoardExcel"
  title="Export current board view to Excel (styled)"
>
  Export Excel
</button>

        <button
          class="px-3 py-1.5 border !border-slate-300 rounded-md !bg-white hover:!bg-slate-50 !text-slate-800 shadow-sm"
          @click="exportLabels"
        >
          Print Labels (PDF)
        </button>

        <!-- Filters -->
        <div class="ml-auto flex items-center gap-2">
          <select v-model="statusFilter" class="select">
            <option value="ALL">All</option>
            <option>Open</option>
            <option>Packed</option>
            <option>Shipped</option>
          </select>
          <label class="inline-flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" v-model="onlyOver" />
            Only Overweight
          </label>
        </div>
      </div>
    </div>

    <!-- Board table -->
    <div v-if="!hasPallets" class="rounded-xl border border-slate-200 bg-white p-6">
      <EmptyState
        title="No pallets to show"
        description="Import or create pallets to start."
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
            <th class="px-3 py-3 border-b w-[200px]">Action</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="p in viewList"
            :key="p.pallet"
            class="border-b even:bg-slate-50/40 hover:bg-slate-50 transition"
          >
            <!-- Pallet text -->
            <td class="px-3 py-2">
              <span class="font-semibold text-slate-800">{{ p.pallet }}</span>
              <span v-if="p.warn" class="ml-2 text-rose-600 font-semibold">⚠ Over</span>
            </td>

            <!-- Status badge -->
            <td class="px-3 py-2">
              <span :class="statusBadgeClass(p.status)">{{ p.status }}</span>
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

            <!-- Action: คง View / Split / Pack (❌ ไม่มี Set Max แล้ว) -->
            <td class="px-3 py-2">
              <div class="flex items-center gap-2 flex-wrap">
                <button
                  class="px-3 py-1.5 border border-slate-300 rounded-md bg-white hover:bg-slate-50 text-slate-800"
                  @click="openPallet(p.pallet)"
                  title="View pallet detail"
                >
                  View
                </button>

                <button
                  v-if="canSplit(p)"
                  class="px-3 py-1.5 border border-slate-300 rounded-md bg-white hover:bg-slate-50 text-slate-800"
                  @click="s.splitPalletOverMax(p.pallet)"
                  title="Split pallet (over max)"
                >
                  Split
                </button>

                <button
                  class="px-3 py-1.5 border border-slate-300 rounded-md bg-white hover:bg-slate-50 text-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  :disabled="!canPack(p)"
                  @click="canPack(p) && s.pack(p.pallet)"
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