<script setup lang="ts">
import { useToast } from '@/composables/useToast'
const { toasts, remove } = useToast()
</script>

<template>
  <div class="fixed right-4 bottom-4 space-y-2 z-50">
    <div
      v-for="t in toasts"
      :key="t.id"
      :class="[
        'px-4 py-2 rounded shadow text-white cursor-pointer',
        t.type === 'success'
          ? 'bg-emerald-600'
          : t.type === 'error'
            ? 'bg-rose-600'
            : 'bg-slate-800',
      ]"
      @click="remove(t.id)"
    >
      {{ t.message }}
    </div>
  </div>
</template>
