<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { usePackingStore } from '@/stores/packing.store';

const router = useRouter();
const store = usePackingStore();
const selectedIds = ref<string[]>([]);

onMounted(() => {
  store.loadMockItems(); // โหลดข้อมูลทดลอง
});

function toggleSelect(id: string, checked: boolean) {
  if (checked) selectedIds.value = [...selectedIds.value, id];
  else selectedIds.value = selectedIds.value.filter(x => x !== id);
}

function goToPalletEdit() {
  store.setSelection(selectedIds.value);
  router.push({ name: 'pallet-edit' });
}
</script>

<template>
  <section class="p-4">
    <h1 class="text-xl font-semibold">Dashboard</h1>

    <table class="mt-4 w-full border">
      <thead>
        <tr>
          <th></th>
          <th>SKU</th>
          <th>Description</th>
          <th>Qty</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="it in store.items" :key="it.id">
          <td>
            <input
              type="checkbox"
              @change="e => toggleSelect(it.id, (e.target as HTMLInputElement).checked)"
            />
          </td>
          <td>{{ it.sku }}</td>
          <td>{{ it.description }}</td>
          <td>{{ it.qty }}</td>
        </tr>
      </tbody>
    </table>

    <button class="mt-4 border px-3 py-1" @click="goToPalletEdit">
      ใส่รายการที่เลือกไปที่ Pallet
    </button>
  </section>
</template>