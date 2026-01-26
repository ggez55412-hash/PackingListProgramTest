
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    title?: string
    message?: string
    confirmText?: string
    cancelText?: string
    danger?: boolean        // เพิ่ม: สีโทนลบ (ปุ่มยืนยันเป็นแดง)
    closeOnBackdrop?: boolean // เพิ่ม: คลิกฉากหลังเพื่อปิด (default: true)
    disabled?: boolean      // เพิ่ม: ปุ่มระหว่างโหลด/ยืนยัน
  }>(),
  {
    title: 'Confirm',
    confirmText: 'OK',
    cancelText: 'Cancel',
    danger: false,
    closeOnBackdrop: true,
    disabled: false,
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'confirm'): void
  (e: 'cancel'): void           // เพิ่ม: แจ้งฝั่งผู้ใช้เมื่อกดยกเลิก/ปิด
}>()

const dialogRef = ref<HTMLElement | null>(null)
const confirmBtnRef = ref<HTMLButtonElement | null>(null)

function close() {
  emit('update:modelValue', false)
  emit('cancel') // แจ้ง event ยกเลิก (ไม่กระทบโค้ดเดิมถ้าไม่ได้ฟัง)
}
function confirm() {
  if (props.disabled) return
  emit('confirm')
  emit('update:modelValue', false)
}

// ปิดด้วย ESC / Enter (Enter = confirm)
function onKeydown(e: KeyboardEvent) {
  if (!props.modelValue) return
  if (e.key === 'Escape') {
    e.preventDefault()
    close()
  } else if (e.key === 'Enter') {
    e.preventDefault()
    confirm()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})

// โฟกัสอัตโนมัติที่ปุ่มยืนยันเมื่อเปิด
watch(
  () => props.modelValue,
  (v) => {
    if (v) {
      requestAnimationFrame(() => {
        confirmBtnRef.value?.focus()
      })
    }
  },
)
</script>

<template>
  <Teleport to="body">
    <transition name="fade">
      <div v-if="modelValue" class="fixed inset-0 z-[10000]">
        <!-- Backdrop -->
        <div
          class="fixed inset-0 bg-black/40"
          @click="closeOnBackdrop ? close() : undefined"
        />
        <!-- Dialog -->
        <section
          ref="dialogRef"
          class="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
                 w-[min(92vw,480px)] bg-white border border-gray-200 rounded-xl shadow-2xl"
          role="dialog"
          aria-modal="true"
          :aria-label="props.title"
        >
          <header class="px-5 py-3 border-b font-semibold">
            {{ props.title }}
          </header>

          <!-- เนื้อหา: รองรับทั้ง message และ slot -->
          <div class="p-5 text-slate-700">
            <slot>
              {{ props.message }}
            </slot>
          </div>

          <footer class="px-5 py-3 border-t flex justify-end gap-2">
            <button
              type="button"
              class="px-3 py-1.5 border rounded"
              :disabled="disabled"
              @click="close"
            >
              {{ props.cancelText }}
            </button>

            <button
              ref="confirmBtnRef"
              type="button"
              :class="[
                'px-3 py-1.5 border rounded text-white',
                props.danger ? 'bg-rose-600 hover:bg-rose-700 border-rose-600' : 'bg-gray-900 hover:bg-black border-gray-900',
                disabled && 'opacity-60 cursor-not-allowed hover:none'
              ]"
              :disabled="disabled"
              @click="confirm"
            >
              {{ props.confirmText }}
            </button>
          </footer>
        </section>
      </div>
    </transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity .18s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
