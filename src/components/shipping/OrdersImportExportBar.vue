<script setup lang="ts">
import { ref } from 'vue'
import * as XLSX from 'xlsx'
import { useOrdersStore } from '@/stores/orders'
import { useToast } from '@/composables/useToast'

const orders = useOrdersStore()
const { success, error, info } = useToast()
const fileEl = ref<HTMLInputElement|null>(null)

/* =========================
   Export Orders (.xlsx) with styles
   ========================= */
function exportOrdersExcel() {
  const rows = orders.orders.map(o => ({
    "Order ID": o.orderId,
    Customer: o.customer ?? "",
    Status: o.status ?? "",
    Transporter: o.transporter ?? "",
    "Parcel No.": o.parcelNo ?? "",
    "Delivery Date": o.deliveryDate ?? "",
    WeightKg: typeof o.weightKg === 'number' ? o.weightKg : "",
  }))

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(rows)

  // header style
  const ref = ws['!ref']
  if (ref) {
    const range = XLSX.utils.decode_range(ref)
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const addr = XLSX.utils.encode_cell({ r: 0, c: C })
      const cell = (ws as any)[addr] || ((ws as any)[addr] = { t: 's', v: '' })
      cell.s = {
        fill: { fgColor: { rgb: "DBEAFE" } },           // blue-100
        font: { bold: true, color: { rgb: "111827" } }, // slate-900
        alignment: { vertical: "center", horizontal: "center", wrapText: true },
        border: {
          top:    { style: "thin", color: { rgb: "CBD5E1" } },
          bottom: { style: "thin", color: { rgb: "CBD5E1" } },
          left:   { style: "thin", color: { rgb: "CBD5E1" } },
          right:  { style: "thin", color: { rgb: "CBD5E1" } },
        },
      }
    }
  }

  // width + freeze + (optional) wrap
  ;(ws as any)['!cols'] = [
    { wch: 16 }, // Order ID
    { wch: 26 }, // Customer
    { wch: 12 }, // Status
    { wch: 18 }, // Transporter
    { wch: 16 }, // Parcel No.
    { wch: 14 }, // Delivery Date
    { wch: 10 }, // WeightKg
  ]
  ;(ws as any)['!freeze'] = { rows: 1, columns: 0 }

  XLSX.utils.book_append_sheet(wb, ws, "Orders")
  XLSX.writeFile(wb, "Orders.xlsx")
  success("Export Orders (.xlsx) สำเร็จ")
}

/* =========================
   Import Orders (.xlsx) from sheet 'Orders'
   ========================= */
async function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  if (!f) return
  try {
    const buf = await f.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })

    // หาแผ่นชื่อ Orders (ไม่สนตัวพิมพ์)
    const sheetName = wb.SheetNames.find(n => String(n).toLowerCase() === 'orders')
    if (!sheetName) {
      info("ไม่พบชีท 'Orders' ในไฟล์")
      return
    }

    // ✅ FIX: ทำให้ TypeScript มั่นใจว่า ws เป็น WorkSheet จริง
    const ws = wb.Sheets[sheetName] as XLSX.WorkSheet | undefined
    if (!ws) {
      info("ชีท 'Orders' ว่างหรืออ่านไม่ได้")
      return
    }

    const json = XLSX.utils.sheet_to_json<any>(ws, { defval: "" })

    // map -> upsert
    let count = 0
    for (const r of json) {
      const rec = {
        orderId: String(r["Order ID"] ?? r.OrderId ?? r.orderId ?? "").trim(),
        customer: String(r.Customer ?? "").trim(),
        status: String(r.Status ?? "Pending").trim(),
        transporter: String(r.Transporter ?? "").trim() || undefined,
        parcelNo: String(r["Parcel No."] ?? r.ParcelNo ?? "").trim() || undefined,
        deliveryDate: String(r["Delivery Date"] ?? r.deliveryDate ?? "").trim(),
        weightKg: r.WeightKg == null || r.WeightKg === "" ? undefined : Number(r.WeightKg),
        deletedAt: null,
      } as any
      if (!rec.orderId) continue
      orders.upsert(rec)
      count++
    }
    success(`Import Orders สำเร็จ: ${count} แถว`)
  } catch (err: any) {
    error(`Import ไม่สำเร็จ: ${err?.message ?? String(err)}`)
  } finally {
    if (fileEl.value) fileEl.value.value = ''
  }
}

function openPicker() { fileEl.value?.click() }
</script>

<template>
  <div class="rounded-xl border border-slate-200 bg-white p-3 shadow-sm flex items-center gap-2 flex-wrap">
    <input type="file" ref="fileEl" class="hidden" accept=".xlsx" @change="onFile" />
    <button class="btn btn-primary text-white text-slate-800 shadow-sm" @click="openPicker">
      Import Orders (.xlsx)
    </button>
    <button class="btn bg-green-500 text-white hover:bg-green-600 text-slate-800 shadow-sm" @click="exportOrdersExcel">
      Export Orders (.xlsx)
    </button>
  </div>
</template>