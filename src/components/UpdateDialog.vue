<script setup lang="ts">
import { reactive, watch, computed } from 'vue'
import type { OrderRow } from '@/types/order'

const props = defineProps<{
  modelValue: boolean
  order: OrderRow | null
  existingParcelNos: Set<string>
}>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'save', v: OrderRow): void
}>()

const form = reactive<OrderRow>({
  orderId: '',
  customer: '',
  status: 'Pending',
  transporter: '',
  parcelNo: '',
  deliveryDate: '',
  weightKg: undefined,
})
type Errors = { transporter?: string; parcelNo?: string; deliveryDate?: string }
const errors = reactive<Errors>({})
const touched = reactive({ transporter: false, parcelNo: false, deliveryDate: false })
let dirty = false

watch(
  () => props.order,
  (o) => {
    if (!o) return
    Object.assign(form, JSON.parse(JSON.stringify(o)))
    errors.transporter = errors.parcelNo = errors.deliveryDate = undefined
    touched.transporter = touched.parcelNo = touched.deliveryDate = false
    dirty = false
  },
  { immediate: true },
)

function validateTransporter(v?: string) {
  if (!v || !v.trim()) return 'กรุณาเลือกผู้ให้บริการขนส่ง'
  return ''
}
function validateParcelNo(v?: string) {
  const value = (v || '').trim().toUpperCase()
  if (!value) return 'กรุณากรอกเลขพัสดุ'
  if (!/^[A-Z0-9-]+$/.test(value)) return 'ใช้ A–Z, 0–9 และ - เท่านั้น'
  if (value.length < 3 || value.length > 20) return 'ความยาว 3–20'
  const isDuplicate =
    props.existingParcelNos.has(value) && value !== (props.order?.parcelNo || '').toUpperCase()
  if (isDuplicate) return 'เลขพัสดุซ้ำ'
  return ''
}
function validateDeliveryDate(v?: string) {
  const value = (v || '').trim()
  if (!value) return 'กรุณาเลือกวันที่ส่งของ'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(value)
  if (isNaN(d.getTime())) return 'รูปแบบวันที่ไม่ถูกต้อง'
  d.setHours(0, 0, 0, 0)
  if (d < today) return 'วันที่ต้องไม่ย้อนหลัง'
  return ''
}
function validateField(name: keyof Errors) {
  if (name === 'transporter') errors.transporter = validateTransporter(form.transporter)
  if (name === 'parcelNo') errors.parcelNo = validateParcelNo(form.parcelNo)
  if (name === 'deliveryDate') errors.deliveryDate = validateDeliveryDate(form.deliveryDate)
}
function validateAll() {
  errors.transporter = validateTransporter(form.transporter)
  errors.parcelNo = validateParcelNo(form.parcelNo)
  errors.deliveryDate = validateDeliveryDate(form.deliveryDate)
  return !errors.transporter && !errors.parcelNo && !errors.deliveryDate
}
function normalizeParcelNo() {
  if (form.parcelNo == null) return
  form.parcelNo = form.parcelNo.toUpperCase().trim()
}
function markDirty() {
  dirty = true
}
function close() {
  emit('update:modelValue', false)
}
function onTransporterChange() {
  touched.transporter = true
  validateField('transporter')
  markDirty()
}
function onParcelBlur() {
  normalizeParcelNo()
  touched.parcelNo = true
  validateField('parcelNo')
}
function onDateChange() {
  touched.deliveryDate = true
  validateField('deliveryDate')
  markDirty()
}
function onBackdropClick() {
  if (dirty) return
  close()
}
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.stopPropagation()
    close()
  }
  if (e.key === 'Enter') {
    e.preventDefault()
    save()
  }
}

const isValid = computed(
  () =>
    validateTransporter(form.transporter) === '' &&
    validateParcelNo(form.parcelNo) === '' &&
    validateDeliveryDate(form.deliveryDate) === '',
)
function save() {
  normalizeParcelNo()
  touched.transporter = touched.parcelNo = touched.deliveryDate = true
  if (!validateAll()) return
  emit('save', { ...form })
  close()
}
</script>

<template>
  <div v-if="modelValue" @keydown.capture="onKeydown">
    <div class="fixed inset-0 bg-black/40 z-40" @click="onBackdropClick"></div>
    <section
      class="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] bg-white border border-gray-300 rounded-xl shadow-2xl"
    >
      <header class="px-5 py-3 border-b font-semibold">
        Update Shipping Info: {{ form.orderId || (props.order && props.order.orderId) || '' }}
      </header>
      <div class="p-5">
        <div class="grid grid-cols-[160px_1fr] gap-x-3 gap-y-3">
          <label class="self-center text-gray-700">Order ID</label>
          <div class="self-center">{{ form.orderId }}</div>
          <label class="self-center text-gray-700">Customer</label>
          <div class="self-center">{{ form.customer }}</div>
          <label class="self-center text-gray-700">Transporter</label>
          <div>
            <select
              v-model="form.transporter"
              @change="onTransporterChange"
              class="w-full border rounded px-2 py-1.5"
            >
              <option value="">-- Select --</option>
              <option>Flash</option>
              <option>Kerry</option>
              <option>J&amp;T</option>
              <option>Thailand Post</option>
            </select>
            <div v-if="touched.transporter && errors.transporter" class="text-red-600 text-sm mt-1">
              {{ errors.transporter }}
            </div>
          </div>
          <label class="self-center text-gray-700">Parcel No.</label>
          <div>
            <input
              v-model="form.parcelNo"
              @input="markDirty()"
              @blur="onParcelBlur"
              placeholder="e.g. KRY12345"
              class="w-full border rounded px-2 py-1.5"
            />
            <div class="text-gray-500 text-xs mt-1">ใช้ A–Z, 0–9 และ - เท่านั้น</div>
            <div v-if="touched.parcelNo && errors.parcelNo" class="text-red-600 text-sm mt-1">
              {{ errors.parcelNo }}
            </div>
          </div>
          <label class="self-center text-gray-700">Delivery Date</label>
          <div>
            <input
              type="date"
              v-model="form.deliveryDate"
              @change="onDateChange"
              class="w-full border rounded px-2 py-1.5"
            />
            <div
              v-if="touched.deliveryDate && errors.deliveryDate"
              class="text-red-600 text-sm mt-1"
            >
              {{ errors.deliveryDate }}
            </div>
          </div>
        </div>
      </div>
      <footer class="px-5 py-3 border-t flex justify-end gap-2">
        <button class="px-3 py-1.5 border rounded" @click="close">Cancel</button>
        <button
          class="px-3 py-1.5 rounded border"
          :class="
            isValid
              ? 'bg-gray-900 text-white border-gray-900 hover:bg-black'
              : 'bg-gray-100 text-gray-400 border-gray-300 cursor-not-allowed'
          "
          :disabled="!isValid"
          @click="save"
        >
          Save
        </button>
      </footer>
    </section>
  </div>
</template>
