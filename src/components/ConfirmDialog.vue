<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch, nextTick } from 'vue'

const props = defineProps<{
  modelValue: boolean
  title?: string
  message?: string
  confirmText?: string
  cancelText?: string
  closeOnBackdrop?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'confirm'): void
}>()

const confirmBtnRef = ref<HTMLButtonElement | null>(null)

function close() { emit('update:modelValue', false) }
function confirm() { emit('confirm'); close() }

function onKeydown(e: KeyboardEvent) {
  if (!props.modelValue) return
  if (e.key === 'Escape') {
    e.preventDefault()
    close()
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

watch(() => props.modelValue, (v) => {
  if (v) nextTick(() => confirmBtnRef.value?.focus())
})
</script>

<template>
  <Teleport to="body">
    <!-- container -->
    <Transition name="layer-fade" appear>
      <div
        v-if="modelValue"
        class="fixed inset-0 z-[1000] flex items-center justify-center"
        aria-modal="true" role="dialog"
      >
        <!-- overlay -->
        <Transition name="layer-fade" appear>
          <div
            class="fixed inset-0 bg-slate-900/45 backdrop-blur-[2px]"
            @click="(closeOnBackdrop ?? true) && close()"
          />
        </Transition>

        <!-- dialog -->
        <Transition name="elevate-zoom" appear>
          <div
            class="relative z-[1001] w-[min(92vw,560px)] rounded-2xl bg-white shadow-2xl
                   will-change-transform will-change-opacity transform-gpu"
          >
            <header class="px-5 py-4 border-b text-slate-800 font-semibold">
              {{ title ?? 'Confirm' }}
            </header>

            <section class="px-5 py-4 text-slate-700">
              <slot name="message">
                {{ message ?? '' }}
              </slot>
            </section>

            <footer class="px-5 py-4 flex justify-end gap-2 border-t">
              <button type="button" class="btn btn-ghost" @click="close">
                {{ cancelText ?? 'Cancel' }}
              </button>
              <button
                ref="confirmBtnRef"
                type="button"
                class="btn btn-primary"
                @click="confirm"
              >
                {{ confirmText ?? 'OK' }}
              </button>
            </footer>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* ===== Global motion safety ===== */
@media (prefers-reduced-motion: reduce) {
  .layer-fade-enter-active,
  .layer-fade-leave-active,
  .elevate-zoom-enter-active,
  .elevate-zoom-leave-active {
    transition: none !important;
  }
}

/* ===== Overlay / container fade (ซ้อนแอนิเมชัน) ===== */
.layer-fade-enter-active { transition: opacity 220ms cubic-bezier(.4,0,.2,1); }
.layer-fade-leave-active { transition: opacity 180ms cubic-bezier(.4,0,.2,1); }
.layer-fade-enter-from,
.layer-fade-leave-to { opacity: 0; }

/* ===== Dialog: elevation zoom (เนียนและมีมิติ) ===== */
.elevate-zoom-enter-active {
  transition:
    opacity 260ms cubic-bezier(.22,.9,.28,1),
    transform 260ms cubic-bezier(.22,.9,.28,1);
}
.elevate-zoom-leave-active {
  transition:
    opacity 180ms cubic-bezier(.4,0,.2,1),
    transform 180ms cubic-bezier(.4,0,.2,1);
}
.elevate-zoom-enter-from,
.elevate-zoom-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(.975); /* ปรับได้: translateY(10px) scale(.97) */
}
</style>