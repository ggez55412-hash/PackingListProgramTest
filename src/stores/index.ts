import { createPinia } from 'pinia'
import { persistLocal } from './plugins/persistLocal'

const pinia = createPinia()
pinia.use(persistLocal('shipping_app_v1'))

export default pinia
