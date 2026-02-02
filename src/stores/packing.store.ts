import { defineStore } from 'pinia';

export interface Item {
  id: string;
  sku: string;
  description: string;
  qty: number;
  uom: string;
  weightKg?: number;
}

export const usePackingStore = defineStore('packing', {
  state: () => ({
    items: [] as Item[],
    selectedItemIds: [] as string[],
    palletItems: [] as Item[],
  }),
  getters: {
    selectedItems(state): Item[] {
      const set = new Set(state.selectedItemIds);
      return state.items.filter(i => set.has(i.id));
    },
  },
  actions: {
    loadMockItems() {
      if (this.items.length) return;
      this.items = [
        { id: 'ITM-1', sku: 'SKU-001', description: 'Widget A', qty: 10, uom: 'pcs', weightKg: 0.2 },
        { id: 'ITM-2', sku: 'SKU-002', description: 'Widget B', qty: 5,  uom: 'pcs', weightKg: 0.5 },
        { id: 'ITM-3', sku: 'SKU-003', description: 'Widget C', qty: 12, uom: 'pcs', weightKg: 0.1 },
      ];
    },
    setSelection(ids: string[]) { this.selectedItemIds = ids; },
    clearSelection() { this.selectedItemIds = []; },
    addSelectedToPallet() {
      const existed = new Set(this.palletItems.map(i => i.id));
      const toAdd = this.selectedItems.filter(i => !existed.has(i.id));
      this.palletItems.push(...toAdd);
      this.clearSelection();
    },
    removeFromPallet(id: string) {
      this.palletItems = this.palletItems.filter(i => i.id !== id);
    },
  },
});