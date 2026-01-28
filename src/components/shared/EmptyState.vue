
<script setup lang="ts">
defineProps<{ title: string; description?: string }>()
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-2">
    <div class="text-5xl">📦</div>
    <div class="font-semibold">{{ title }}</div>
    <div v-if="description" class="text-slate-500 text-sm">{{ description }}</div>
    <div class="mt-2"><slot name="actions" /></div>
  </div>
</template>
