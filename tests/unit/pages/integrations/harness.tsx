import 'fake-indexeddb/auto'

import { fakeBrowser } from '@webext-core/fake-browser'
import { render } from 'preact'
import { vi } from 'vitest'

import { PREFS_KEY } from '@/pages/integrations/preferences'
import { resetSettingsCache, updateSettings } from '@/shared/settings'
import { deleteVaultDatabase, saveSecret } from '@/shared/storage/vault'

/**
 * عدّة اختبارات التكامل: متصفّحٌ مزيَّف بتخزينه الحقيقي، وخزنةٌ حقيقية، و`fetch` مسبوك — فالمسار من النقرة إلى
 * الطلب كما هو في المنتج، ولا يُستبدل منه إلا ما يخرج من الجهاز.
 */

export const TOKEN = 'github_pat_11ABCDEFG0123456789_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOP'

export interface Env {
  fetchSpy: ReturnType<typeof vi.fn>
  contains: ReturnType<typeof vi.fn>
  request: ReturnType<typeof vi.fn>
  tabsCreate: ReturnType<typeof vi.fn>
}

export const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers })

export async function setup(
  opts: { connected?: boolean; localOnly?: boolean; host?: boolean } = {},
): Promise<Env> {
  fakeBrowser.reset()
  resetSettingsCache()
  await deleteVaultDatabase()
  const contains = vi.fn().mockResolvedValue(opts.host ?? true)
  const request = vi.fn().mockResolvedValue(true)
  const noop = { addListener: vi.fn(), removeListener: vi.fn() }
  const tabsCreate = vi.fn().mockResolvedValue({ id: 1 })
  Object.assign(globalThis.chrome, {
    permissions: {
      contains,
      request,
      getAll: vi.fn().mockResolvedValue({ origins: [] }),
      onAdded: noop,
      onRemoved: noop,
    },
  })
  Object.assign(globalThis.chrome.tabs, { create: tabsCreate })
  await updateSettings((current) => ({
    privacy: { ...current.privacy, localOnly: opts.localOnly ?? false },
  }))
  if (opts.connected) await saveSecret('github', TOKEN)
  const fetchSpy = vi.fn()
  vi.stubGlobal('fetch', fetchSpy)
  return { fetchSpy, contains, request, tabsCreate }
}

export async function putPrefs(value: unknown): Promise<void> {
  await chrome.storage.local.set({ [PREFS_KEY]: value })
}

export async function storedPrefs(): Promise<Record<string, unknown>> {
  return ((await chrome.storage.local.get(PREFS_KEY))[PREFS_KEY] ?? {}) as Record<string, unknown>
}

let container: HTMLDivElement | null = null

export function mount(node: preact.ComponentChild): HTMLElement {
  container = document.createElement('div')
  document.body.appendChild(container)
  render(node, container)
  return container
}

export function unmount(): void {
  if (container) {
    render(null, container)
    container.remove()
    container = null
  }
  document.body.innerHTML = ''
}

export const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

/** ينتظر حتى يتحقّق الشرط — الواجهة تقرأ التخزين والخزنة بلا ترتيبٍ معلوم. */
export async function until(check: () => boolean, label = 'الشرط'): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (check()) return
    await new Promise((r) => setTimeout(r, 5))
  }
  throw new Error(`لم يتحقّق: ${label}`)
}

export function type(input: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
