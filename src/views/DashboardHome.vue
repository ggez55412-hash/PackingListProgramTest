<script setup lang="ts">
import { computed } from 'vue'
import { useOrdersStore } from '@/stores/orders'
import { usePalletsStore } from '@/stores/pallets'

const orders = useOrdersStore()
const palletsStore = usePalletsStore()

/* ========= KPI Cards ========= */
const totalShipments = computed(() => orders.count)
const pendingCount   = computed(() => orders.pendingCount)
const shippedCount   = computed(() => orders.shippedCount)
const totalWeight    = computed(() => orders.totalWeight)

/* ========= Summary ========= */
const palletCount = computed(() => palletsStore.palletsSummary.length)
const overweightCount = computed(() => palletsStore.palletsSummary.filter(p => p.warn).length)

/* ========= Shipped Today ========= */
const todayStr = computed(() => {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
})
const shippedToday = computed(() =>
  orders.activeOrders.filter(o =>
    String(o.status) === 'Shipped' && String(o.deliveryDate || '') === todayStr.value
  ).length
)
</script>

<template>
  <div class="dashboard-wrapper">
    <h1 class="text-3xl font-extrabold text-slate-800 tracking-tight mb-8">Dashboard</h1>

    <!-- KPI CARDS -->
    <div class="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 mb-10">
      <div class="card anim-card anim-delay-0">
        <div class="card-head">
          <div class="icon icon-purple">📦</div>
          <span class="trend up">↑ 12%</span>
        </div>
        <div class="card-title">Total Shipments</div>
        <div class="card-value">{{ totalShipments }}</div>
        <span class="sheen" aria-hidden="true" />
      </div>

      <div class="card anim-card anim-delay-1">
        <div class="card-head">
          <div class="icon icon-amber">⏱️</div>
          <span class="trend down">↓ 5%</span>
        </div>
        <div class="card-title">Pending Orders</div>
        <div class="card-value">{{ pendingCount }}</div>
        <span class="sheen" aria-hidden="true" />
      </div>

      <div class="card anim-card anim-delay-2">
        <div class="card-head">
          <div class="icon icon-blue">🚚</div>
          <span class="trend up">↑ 8%</span>
        </div>
        <div class="card-title">Shipped</div>
        <div class="card-value">{{ shippedCount }}</div>
        <span class="sheen" aria-hidden="true" />
      </div>

      <div class="card anim-card anim-delay-3">
        <div class="card-head">
          <div class="icon icon-green">🧱</div>
          <span class="trend up">↑ 2.4%</span>
        </div>
        <div class="card-title">Total Weight</div>
        <div class="card-value">
          {{ totalWeight.toFixed(1) }} <span class="unit">kg</span>
        </div>
        <span class="sheen" aria-hidden="true" />
      </div>
    </div>

    <!-- Summary row (+ Shipped Today) -->
    <div class="summary-row">
      <div class="s-box">
        <div class="s-title">Total Pallets</div>
        <div class="s-value">{{ palletCount }}</div>
      </div>

      <div class="s-box">
        <div class="s-title">Overweight Pallets</div>
        <div class="s-value" :class="overweightCount > 0 ? 'text-rose-600' : ''">
          {{ overweightCount }}
        </div>
      </div>

      <div class="s-box">
        <div class="s-title">Shipped Today ({{ todayStr }})</div>
        <div class="s-value text-emerald-700">{{ shippedToday }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@reference '../assets/tailwind.css';

/* ===== BG / WRAPPER ===== */
.dashboard-wrapper {
  @apply w-full h-full p-8;
  background: radial-gradient(80% 60% at 0% 0%, #eef2ff 0%, #fafafa 55%, #f1f5f9 100%);
}

/* ===== CARDS (base + animation) ===== */
.card {
  @apply rounded-3xl p-6 border border-white/50 shadow-lg bg-white/70 backdrop-blur-md;
  @apply transition-all duration-200 ease-out hover:shadow-2xl hover:-translate-y-[3px];
  position: relative; overflow: hidden;
}
.card::after {
  content: ''; @apply absolute inset-0 rounded-3xl pointer-events-none;
  background: linear-gradient(120deg, rgba(255,255,255,.5), rgba(255,255,255,0));
}
.card-head { @apply flex items-start justify-between; }
.card-title { @apply mt-3 text-slate-600 font-medium; }
.card-value { @apply mt-1 text-5xl font-extrabold text-slate-900 leading-tight; font-variant-numeric: tabular-nums; font-feature-settings:"tnum"; }
.unit { @apply text-xl text-slate-500 pl-1; }

.icon { @apply inline-flex items-center justify-center w-14 h-14 rounded-3xl text-[1.5rem] shadow-md border border-white/40; backdrop-filter: saturate(180%) blur(2px); }
.icon-purple { background: #ede9fe; @apply text-indigo-700; }
.icon-amber  { background: #fef3c7; @apply text-amber-700; }
.icon-blue   { background: #dbeafe; @apply text-blue-700; }
.icon-green  { background: #d1fae5; @apply text-emerald-700; }

.trend { @apply text-xs px-2 py-1 rounded-full border bg-white/40 backdrop-blur-sm font-semibold; }
.trend.up   { @apply text-emerald-700 border-emerald-300; }
.trend.down { @apply text-rose-700    border-rose-300; }

/* ===== SUMMARY ROW ===== */
.summary-row { @apply mt-6 p-5 rounded-2xl bg-white shadow-sm border border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4; }
.s-box { @apply flex flex-col; }
.s-title { @apply text-slate-500 text-sm; }
.s-value { @apply text-3xl font-bold text-slate-800 mt-1; font-variant-numeric: tabular-nums; font-feature-settings:"tnum"; }

/* ===== Animations ===== */
.anim-card {
  animation: card-fade-up 520ms cubic-bezier(.22,.9,.28,1) both, card-float 6.5s ease-in-out infinite;
  will-change: transform, opacity;
}
.anim-card:hover { animation-play-state: paused; }
.anim-delay-0 { animation-delay: 0ms, 0ms; }
.anim-delay-1 { animation-delay: 60ms, 0ms; }
.anim-delay-2 { animation-delay: 120ms, 0ms; }
.anim-delay-3 { animation-delay: 180ms, 0ms; }
.sheen { position: absolute; inset: -20%; background: linear-gradient(120deg, transparent 40%, rgba(255,255,255,.45) 50%, transparent 60%); transform: translateX(-120%) rotate(10deg); animation: card-sheen 7.5s ease-in-out infinite; pointer-events:none; }

@keyframes card-fade-up { from{opacity:0; transform:translateY(10px) scale(.98)} to{opacity:1; transform:translateY(0) scale(1)} }
@keyframes card-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }
@keyframes card-sheen { 0%,20%{transform:translateX(-120%) rotate(10deg); opacity:0} 25%{opacity:.25} 45%{opacity:.35} 55%{opacity:.25} 60%,100%{transform:translateX(120%) rotate(10deg); opacity:0} }

@media (prefers-reduced-motion: reduce) { .anim-card, .sheen { animation: none !important; } }
</style>