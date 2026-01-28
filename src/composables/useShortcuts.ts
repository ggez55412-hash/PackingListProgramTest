
import { onMounted, onBeforeUnmount } from 'vue'

type Handlers = { onSelectAll?: () => void; onDelete?: () => void; onEscape?: () => void }

export function useShortcuts(h: Handlers) {
  function onKeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') { e.preventDefault(); h.onSelectAll?.(); return }
    if ((e.key === 'Delete' || e.key === 'Backspace') && (e.target as HTMLElement).tagName !== 'INPUT') {
      e.preventDefault(); h.onDelete?.(); return
    }
    if (e.key === 'Escape') h.onEscape?.()
  }
  onMounted(() => window.addEventListener('keydown', onKeydown))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
}
