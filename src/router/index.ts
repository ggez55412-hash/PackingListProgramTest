import { createRouter, createWebHistory } from 'vue-router'
import DashboardView from '@/views/DashboardView.vue'
import PalletsView from '@/views/PalletsView.vue'

export default createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: '/dashboard' },
    { path: '/dashboard', name: 'dashboard', component: DashboardView },
    { path: '/pallets', name: 'pallets', component: PalletsView },
    { path: '/about', name: 'about', component: () => import('@/views/AboutView.vue') },
    {path: '/pallets/:id',name: 'pallet-detail', component: () => import('@/views/PalletDetailView.vue')}
],
})
