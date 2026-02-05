<script setup lang="ts">
import OrdersImportExportBar from '@/components/shipping/OrdersImportExportBar.vue'
import Dashboard from '@/components/Dashboard.vue'  // ⬅ ตารางเดิมของคุณ (ไม่แก้)
</script>

<template>
  <section class="space-y-6">
    <header class="flex items-center justify-between">
      <h1 class="text-2xl font-semibold text-slate-800">Shipping</h1>
    </header>

    <!-- ✅ แถบ Import/Export ของ Shipping -->
    <OrdersImportExportBar />

    <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <Dashboard />
    </div>
  </section>
</template>