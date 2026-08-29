/**
 * محاكاة `chrome.runtime.connect` / `onConnect` في الذاكرة.
 *
 * `@webext-core/fake-browser` لا يطبّق القنوات، وهي جوهر المرحلة 3: بقاء
 * الـservice worker حيًّا يعتمد عليها. المحاكاة تربط طرفَين حقيقيَّين وتسمح
 * بقطع الاتصال برمجيًا — وهو ما يحاكي إعادة تشغيل الـservice worker.
 */

type Listener<T> = (arg: T) => void

interface FakePort extends chrome.runtime.Port {
  __deliver(message: unknown): void
  __drop(): void
}

function makePort(name: string): FakePort {
  const messageListeners = new Set<Listener<unknown>>()
  const disconnectListeners = new Set<Listener<chrome.runtime.Port>>()
  let peer: FakePort | null = null
  let alive = true

  const port = {
    name,
    onMessage: {
      addListener: (fn: Listener<unknown>) => messageListeners.add(fn),
      removeListener: (fn: Listener<unknown>) => messageListeners.delete(fn),
      hasListener: (fn: Listener<unknown>) => messageListeners.has(fn),
    },
    onDisconnect: {
      addListener: (fn: Listener<chrome.runtime.Port>) => disconnectListeners.add(fn),
      removeListener: (fn: Listener<chrome.runtime.Port>) => disconnectListeners.delete(fn),
      hasListener: (fn: Listener<chrome.runtime.Port>) => disconnectListeners.has(fn),
    },
    postMessage(message: unknown) {
      if (!alive) throw new Error('Attempting to use a disconnected port object')
      peer?.__deliver(message)
    },
    disconnect() {
      if (!alive) return
      alive = false
      peer?.__drop()
    },
    __deliver(message: unknown) {
      for (const fn of messageListeners) fn(message)
    },
    __drop() {
      if (!alive) return
      alive = false
      for (const fn of disconnectListeners) fn(port)
    },
    __setPeer(other: FakePort) {
      peer = other
    },
  } as unknown as FakePort & { __setPeer(other: FakePort): void }

  return port
}

export interface FakePortNetwork {
  /** كل الأزواج المفتوحة الآن. */
  pairs(): { client: FakePort; host: FakePort }[]
  /** يقطع كل القنوات — يحاكي إعادة تشغيل الـservice worker. */
  dropAll(): void
  restore(): void
}

/** يركّب المحاكاة على `globalThis.chrome` ويُرجع أدوات التحكّم. */
export function installFakePorts(): FakePortNetwork {
  const connectListeners = new Set<Listener<chrome.runtime.Port>>()
  const open: { client: FakePort; host: FakePort }[] = []

  const runtime = (globalThis.chrome as { runtime: Record<string, unknown> }).runtime
  const original = { connect: runtime.connect, onConnect: runtime.onConnect }

  runtime.onConnect = {
    addListener: (fn: Listener<chrome.runtime.Port>) => connectListeners.add(fn),
    removeListener: (fn: Listener<chrome.runtime.Port>) => connectListeners.delete(fn),
    hasListener: (fn: Listener<chrome.runtime.Port>) => connectListeners.has(fn),
  }

  runtime.connect = (info?: { name?: string }) => {
    const name = info?.name ?? ''
    const client = makePort(name)
    const host = makePort(name)
    ;(client as unknown as { __setPeer(p: FakePort): void }).__setPeer(host)
    ;(host as unknown as { __setPeer(p: FakePort): void }).__setPeer(client)

    const pair = { client, host }
    open.push(pair)

    client.onDisconnect.addListener(() => {
      const i = open.indexOf(pair)
      if (i >= 0) open.splice(i, 1)
    })

    // التسليم متزامن — يبسّط الاختبار ويطابق ترتيب Chrome.
    for (const fn of connectListeners) fn(host)
    return client as unknown as chrome.runtime.Port
  }

  return {
    pairs: () => [...open],
    dropAll() {
      // في Chrome يُخطَر **الطرف المقابل** عند قطع أحد الطرفين، لا الطرف نفسه.
      for (const pair of [...open]) pair.host.disconnect()
      open.length = 0
    },
    restore() {
      runtime.connect = original.connect
      runtime.onConnect = original.onConnect
    },
  }
}
