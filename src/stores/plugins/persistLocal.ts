import type { PiniaPluginContext } from 'pinia'

export function persistLocal(namespace = 'app') {
  return (ctx: PiniaPluginContext) => {
    const key = `${namespace}:${ctx.store.$id}`

    try {
      const saved = localStorage.getItem(key)
      if (saved) ctx.store.$patch(JSON.parse(saved))
    } catch {}

    ctx.store.$subscribe((_m, state) => {
      try {
        localStorage.setItem(key, JSON.stringify(state))
      } catch {}
    })
  }
}
;``
