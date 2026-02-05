import { createRouter, createWebHistory } from 'vue-router'

// ✅ Dashboard: การ์ดสรุปอย่างเดียว
import DashboardHome from '@/views/DashboardHome.vue'

// ✅ Shipping: ครอบตารางเดิม
import ShippingDashboard from '@/views/ShippingDashboard.vue'

// ของเดิม
import PalletsView from '@/views/PalletsView.vue'

export default createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: '/dashboard' },

    // Dashboard (การ์ดอย่างเดียว)
    { path: '/dashboard', name: 'dashboard', component: DashboardHome },

    // Shipping (ตารางเดิมทั้งหมด)
    { path: '/shipping', name: 'shipping', component: ShippingDashboard },

    // Pallets (เดิม)
    { path: '/pallets', name: 'pallets', component: PalletsView },
    { path: '/pallets/:id', name: 'pallet-detail', component: () => import('@/views/PalletDetailView.vue') },

    // About (เดิม)
    { path: '/about', name: 'about', component: () => import('@/views/AboutView.vue') },
  ],
})