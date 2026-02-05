<script setup lang="ts"></script>

<template>
  <nav class="p-4 space-y-3">
    <div class="text-xs uppercase tracking-wider text-slate-500">Navigation</div>

    <!-- Dashboard (การ์ด) -->
    <RouterLink
      to="/dashboard"
      class="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-700 hover:bg-slate-100"
      active-class="bg-slate-900 text-white hover:bg-slate-900"
    >
      <span class="w-2 h-2 rounded-full bg-indigo-400"></span>
      Dashboard
    </RouterLink>

    <!-- ✅ Shipping (ตารางเดิมทั้งหมด) -->
    <RouterLink
      to="/shipping"
      class="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-700 hover:bg-slate-100"
      active-class="bg-slate-900 text-white hover:bg-slate-900"
    >
      <span class="w-2 h-2 rounded-full bg-blue-400"></span>
      Shipping
    </RouterLink>

    <!-- Pallets -->
    <RouterLink
      to="/pallets"
      class="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-700 hover:bg-slate-100"
      active-class="bg-slate-900 text-white hover:bg-slate-900"
    >
      <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
      Pallets
    </RouterLink>

    <div class="pt-2 pl-6 text-slate-400 text-sm">Orders</div>
  </nav>
</template>