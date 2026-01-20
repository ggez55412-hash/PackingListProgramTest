<script setup lang="ts">
import PalletImport from '@/components/PalletImport.vue'
import PalletBoard from '@/components/PalletBoard.vue'
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-semibold text-slate-800">Pallets</h1>
    </div>

    <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <PalletImport />
    </div>

    <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <PalletBoard />
    </div>
  </div>
</template>
