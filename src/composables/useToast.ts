import { reactive, readonly } from 'vue'

export type ToastType = 'success' | 'error' | 'info'
interface ToastItem {
  id: number
  type: ToastType
  message: string
  timeout: number
}

const state = reactive({ list: [] as ToastItem[], nextId: 1 })

function push(type: ToastType, message: string, ms = 3000) {
  const id = state.nextId++
  state.list.push({ id, type, message, timeout: ms })
  setTimeout(() => remove(id), ms)
}
function remove(id: number) {
  const i = state.list.findIndex((t) => t.id === id)
  if (i !== -1) state.list.splice(i, 1)
}

export function useToast() {
  return {
    toasts: readonly(state.list),
    success: (m: string, ms?: number) => push('success', m, ms),
    error: (m: string, ms?: number) => push('error', m, ms),
    info: (m: string, ms?: number) => push('info', m, ms),
    remove,
  }
}
