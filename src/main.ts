import { createApp, type ComponentPublicInstance } from 'vue'
import App from './App.vue'
import router from './router'
import pinia from './stores'

import './assets/tailwind.css'

const app = createApp(App)

// ===== Global error handlers (dev only) =====
if (import.meta.env.DEV) {
  // จับ error ภายในคอมโพเนนต์ของ Vue ทั้งหมด
  app.config.errorHandler = (
    err: unknown,
    instance: ComponentPublicInstance | null,
    info: string
  ) => {
    console.group('%c[GlobalErrorHandler]', 'color:#fff;background:#ef4444;padding:2px 6px;border-radius:4px;')
    console.error('💥 Error:', err)
    console.info('ℹ️ Info:', info)
    // instance อาจเป็น null ตอน error นอกคอมโพเนนต์
    if (instance) 
    {
      const name = instance?.$?.type?.name || '(anonymous component)'
      console.info('📦 Component:', name, instance)
    }
    console.groupEnd()
  }

  // จับ Promise ที่ไม่มี catch (เช่น await ล้มเหลว)
  window.addEventListener('unhandledrejection', (e) => {
    console.group('%c[Unhandled Rejection]', 'color:#111;background:#fbbf24;padding:2px 6px;border-radius:4px;')
    console.error('💥 Reason:', e.reason)
    console.groupEnd()
  })

  // จับ error ระดับหน้าต่าง (สคริปต์/ปลั๊กอินภายนอก)
  window.addEventListener('error', (e) => {
    console.group('%c[Window Error]', 'color:#fff;background:#3b82f6;padding:2px 6px;border-radius:4px;')
    console.error('💥 Error:', e.error || e.message)
    console.groupEnd()
  })
}

// mount app
app.use(pinia).use(router).mount('#app')
