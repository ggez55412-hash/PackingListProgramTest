
<script setup lang="ts">
defineProps<{ value: number }>() // 0..100
</script>

<template>
  <div class="w-full h-2 bg-slate-200 rounded">
    <div class="h-2 rounded bg-emerald-500 transition-all" :style="{ width: Math.min(100, Math.max(0, value)) + '%' }" />
  </div>
</template>
