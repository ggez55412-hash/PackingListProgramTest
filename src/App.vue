<script setup lang="ts">
import Sidebar from '@/components/Sidebar.vue'
import { RouterView } from 'vue-router'
import ToastHost from '@/components/ToastHost.vue'
</script>

<template>
  <!-- Top bar -->
  <header class="h-14 bg-white/80 backdrop-blur border-b border-slate-200 flex items-center px-4">
    <div class="text-xl font-semibold tracking-tight">
      <span class="text-slate-900">Shipping</span>
      <span class="text-indigo-600"> Management</span>
      <span class="ml-1 text-slate-400">System</span>
    </div>

    <nav class="ml-auto flex items-center gap-4 text-sm">
      <RouterLink
        to="/about"
        class="text-slate-600 hover:text-slate-900"
        active-class="text-indigo-600 font-semibold"
      >
        About Us
      </RouterLink>
    </nav>
  </header>

  <!-- Main layout -->
  <div class="flex min-h-[calc(100vh-56px)] bg-slate-50">
    <aside class="w-64 border-r border-slate-200 bg-white">
      <Sidebar />
    </aside>
    <main class="flex-1 p-6">
      <div class="mx-auto max-w-7xl">
        <RouterView />
      </div>
    </main>
  </div>

  <ToastHost />
</template>
