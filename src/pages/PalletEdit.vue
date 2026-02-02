<script setup lang="ts">
import { onMounted } from 'vue';
import { usePackingStore } from '@/stores/packing.store';

const store = usePackingStore();

onMounted(() => {
  if (store.items.length === 0) store.loadMockItems();
  if (store.selectedItemIds.length > 0) {
    store.addSelectedToPallet();
  }
});
</script>

<template>
  <section class="p-4">
    <h2 class="text-lg font-semibold">Pallet Editor</h2>
    <div class="mt-2 text-sm text-gray-700">
      จำนวนรายการใน Pallet: {{ store.palletItems.length }}
    </div>

    <table class="mt-3 w-full border">
      <thead>
        <tr>
          <th>SKU</th>
          <th>Description</th>
          <th>Qty</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="it in store.palletItems" :key="it.id">
          <td>{{ it.sku }}</td>
          <td>{{ it.description }}</td>
          <td>{{ it.qty }}</td>
          <td><button @click="store.removeFromPallet(it.id)">ลบ</button></td>
        </tr>
      </tbody>
    </table>
  </section>
</template>