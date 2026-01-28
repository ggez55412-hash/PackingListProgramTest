
<script setup lang="ts">
import type { Pallet } from '@/types/pallet'
defineProps<{
  pallet: Pallet
  ordersCount: number
  totalWeight: number
  maxWeight: number
}>()
</script>

<template>
  <div class="group-box">
    <div class="group-body grid md:grid-cols-4 gap-4 text-sm">
      <div>
        <div class="text-slate-500">Pallet ID</div>
        <div class="font-semibold">#{{ pallet.id }}</div>
      </div>
      <div>
        <div class="text-slate-500">Status</div>
        <div>
          <span :class="{
            'badge-green': pallet.status === 'Shipped',
            'badge-amber': pallet.status === 'Open' || pallet.status === 'Packed'
          }">
            {{ pallet.status }}
          </span>
        </div>
      </div>
      <div>
        <div class="text-slate-500">Transporter</div>
        <div class="font-medium">{{ pallet.transporter || '—' }}</div>
      </div>
      <div>
        <div class="text-slate-500">Created</div>
        <div class="font-medium">{{ pallet.createdAt }}</div>
      </div>
      <div class="md:col-span-4 text-slate-600">
        {{ ordersCount }} orders · {{ totalWeight.toFixed(2) }} / {{ maxWeight.toFixed(2) }} kg
      </div>
    </div>
  </div>
</template>
