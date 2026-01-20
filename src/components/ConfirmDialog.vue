<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    modelValue: boolean
    title?: string
    message?: string
    confirmText?: string
    cancelText?: string
  }>(),
  { title: 'Confirm', confirmText: 'OK', cancelText: 'Cancel' },
)

const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void; (e: 'confirm'): void }>()
function close() {
  emit('update:modelValue', false)
}
function confirm() {
  emit('confirm')
  close()
}
</script>

<template>
  <div v-if="modelValue">
    <div class="fixed inset-0 bg-black/40 z-40" @click="close"></div>
    <section
      class="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[440px] bg-white border border-gray-300 rounded-xl shadow-2xl"
    >
      <header class="px-5 py-3 border-b font-semibold">{{ props.title }}</header>
      <div class="p-5 text-slate-700">{{ props.message }}</div>
      <footer class="px-5 py-3 border-t flex justify-end gap-2">
        <button class="px-3 py-1.5 border rounded" @click="close">{{ props.cancelText }}</button>
        <button class="px-3 py-1.5 border rounded bg-gray-900 text-white" @click="confirm">
          {{ props.confirmText }}
        </button>
      </footer>
    </section>
  </div>
</template>
