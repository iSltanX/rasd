/**
 * قراءة الإعدادات وكتابتها وبثّ تغيّرها.
 *
 * `chrome.storage.local` مصدر الحقيقة، و`onChanged` يبثّ إلى كل السياقات
 * (النافذة، الصفحات، الـservice worker، الطبقة داخل الصفحة) بلا رسائل يدوية.
 */

import { attempt, ok, type Result } from '../result'

import { defaultSettings, parseSettings, type Settings } from './schema'

export * from './schema'

const KEY = 'rasd:settings'

let cache: Settings | null = null
const listeners = new Set<(settings: Settings) => void>()
let watching = false

/** يقرأ الإعدادات. القيمة التالفة تُصحَّح ولا تُسقط شيئًا. */
export async function getSettings(): Promise<Settings> {
  if (cache) return cache
  const stored = await attempt(async () => (await chrome.storage.local.get(KEY))[KEY])
  const { settings, issues } = parseSettings(stored.ok ? stored.value : {})
  if (issues.length > 0) {
    console.warn(`[رصد] إعدادات غير صالحة صُحّحت: ${issues.join(' · ')}`)
  }
  cache = settings
  return settings
}

/** يدمج تعديلًا جزئيًا (دمج عميق بمستوى واحد يكفي بنية المخطّط). */
export async function patchSettings(patch: Partial<Settings>): Promise<Result<Settings>> {
  const current = await getSettings()
  const merged: Record<string, unknown> = { ...current }
  for (const [key, value] of Object.entries(patch)) {
    const existing = merged[key]
    merged[key] =
      value && typeof value === 'object' && !Array.isArray(value) && existing
        ? { ...existing, ...(value as object) }
        : value
  }
  const { settings } = parseSettings(merged)
  const written = await attempt(() => chrome.storage.local.set({ [KEY]: settings }))
  if (!written.ok) return written
  cache = settings
  return ok(settings)
}

/** يعيد كل شيء إلى الافتراضي. */
export async function resetSettings(): Promise<Result<Settings>> {
  const settings = defaultSettings()
  const written = await attempt(() => chrome.storage.local.set({ [KEY]: settings }))
  if (!written.ok) return written
  cache = settings
  return ok(settings)
}

/** يشترك في تغيّر الإعدادات — يُستدعى فورًا بالقيمة الحالية. */
export function watchSettings(listener: (settings: Settings) => void): () => void {
  listeners.add(listener)
  ensureWatcher()
  void getSettings().then(listener)
  return () => listeners.delete(listener)
}

function ensureWatcher() {
  if (watching) return
  watching = true
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !(KEY in changes)) return
    const { settings } = parseSettings(changes[KEY]?.newValue)
    cache = settings
    for (const listener of listeners) listener(settings)
  })
}

/** للاختبارات: يُفرِغ الذاكرة المؤقّتة والمشتركين. */
export function resetSettingsCache() {
  cache = null
  listeners.clear()
  watching = false
}
