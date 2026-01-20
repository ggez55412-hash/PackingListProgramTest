<script setup lang="ts">
import Dashboard from '@/components/Dashboard.vue'
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-semibold text-slate-800">Dashboard</h1>
    </div>

    <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <Dashboard />
    </div>
  </div>
</template>
