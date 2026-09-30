/**
 * نقل الإعدادات إلى متصفّح آخر — ملفّ JSON برقم صيغة، واستيراده عبر `parseSettings` مع عرض ما أُسقط.
 *
 * ```json
 * { "format": "rasd.settings", "version": 1, "exportedAt": 1780000000000, "app": "0.1.0",
 *   "settings": { "schemaVersion": 1, "capture": {…}, "annotation": {…}, "colors": {…},
 *                 "appearance": {…}, "shortcuts": {…}, "privacy": {…} } }
 * ```
 *
 * **ما يُنقل التفضيلات وحدها:** جولة التعريف و«ما الجديد» حالةُ هذا المتصفّح لا تفضيل — نقلُها كان يعيد
 * الترحيبيّة على جهازٍ أكملها، أو يُظهر بطاقة ترقيةٍ لم تقع عليه.
 *
 * **والاستيراد دمجٌ فوق الحالية لا استبدالٌ بالافتراضي:** ما أُسقط من الملفّ يبقى على قيمته هنا، وما غاب عنه
 * كذلك. وقائمة المواقع المستثناة **تُجمع ولا تُستبدل** — استبدالها كان يمحو موقعًا حماه المستخدم على هذا
 * الجهاز باستيراد ملفٍّ من جهازٍ لم يُحمَ فيه، والقائمة الفارغة سماحٌ لا حياد (ADR 0020 البند 5).
 * وكل نمطٍ فيها يمرّ بالتطبيع نفسه الذي يمرّ به ما يُكتب باليد (`savedSitePattern`).
 *
 * **والكتابة في الطابور على قراءةٍ طازجة** (`updateSettings`): الخطّة تُعرض على حالةٍ قُرئت قبل التأكيد،
 * والدمج يُعاد وقت الكتابة على ما هو قائمٌ فعلًا — الثوابت الثلاثة كلّها.
 */

import { err, ok, type Result } from '../result'
import { savedSitePattern } from '../site-match'

import { defaultSettings, parseSettings, parseSettingsDetailed, type Settings } from './schema'

import { updateSettings } from './index'

export const SETTINGS_FORMAT = 'rasd.settings'
export const SETTINGS_FILE_VERSION = 1

/** الأقسام التي تنتقل — التفضيلات. والحالة (`onboarding` · `whatsNew`) تبقى على جهازها. */
export const TRANSFERABLE = [
  'capture',
  'annotation',
  'colors',
  'appearance',
  'shortcuts',
  'privacy',
] as const

const SITES_PATH = 'privacy.excludedSites'

type Plain = Record<string, unknown>
const isPlain = (value: unknown): value is Plain =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** مسارات الأوراق بالنقاط — والمصفوفة ورقةٌ واحدة. */
function leafPaths(value: unknown, prefix = ''): string[] {
  if (!isPlain(value)) return prefix ? [prefix] : []
  return Object.entries(value).flatMap(([key, child]) =>
    leafPaths(child, prefix ? `${prefix}.${key}` : key),
  )
}

function transferable(settings: Plain): Plain {
  return Object.fromEntries(TRANSFERABLE.filter((s) => s in settings).map((s) => [s, settings[s]]))
}

/** كل ورقةٍ في الأقسام المنقولة — ما «يُقبل» من الملفّ مقيسًا بها. */
export const TRANSFERABLE_LEAVES: readonly string[] = leafPaths(transferable(defaultSettings()))

/** اسم الملفّ المقترَح بتاريخ اليوم المحلّي. */
export function settingsFilename(now: number): string {
  const d = new Date(now)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `rasd-settings-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`
}

/** نصّ الملفّ — مقروءٌ بالعين، والمفاتيح بترتيب المخطّط. */
export function settingsFile(settings: Settings, now: number, app: string): string {
  const body = { schemaVersion: settings.schemaVersion, ...transferable(settings) }
  return `${JSON.stringify(
    {
      format: SETTINGS_FORMAT,
      version: SETTINGS_FILE_VERSION,
      exportedAt: now,
      app,
      settings: body,
    },
    null,
    2,
  )}\n`
}

/**
 * لماذا أُسقطت قيمة — تُعرض سطرًا تحت اسمها في `data / import-settings`:
 * - `option` ليست من خيارات رصد · `type` من نوعٍ آخر · `range` خارج المدى · `format` بغير الشكل المطلوب
 * - `site` نمط موقعٍ لا يصلح · `unknown` مفتاحٌ لا يعرفه هذا الإصدار
 */
export type DropReason = 'option' | 'type' | 'range' | 'format' | 'site' | 'unknown'

export interface DroppedSetting {
  /** الورقة التي يتبعها — `privacy.excludedSites` لعنصرٍ منها. */
  readonly path: string
  readonly reason: DropReason
  /** القيمة كما في الملفّ — للعرض لا للتنفيذ. */
  readonly received: unknown
}

export interface SettingsImportPlan {
  /** الإعدادات كما ستُحفظ لو أُكّد الاستيراد الآن. */
  readonly settings: Settings
  /** الأوراق التي قُبلت من الملفّ. */
  readonly accepted: readonly string[]
  readonly dropped: readonly DroppedSetting[]
  /** ما قُبل من الملفّ خامًا — يُدمج ثانيةً وقت الكتابة على الحالة القائمة يومئذٍ. */
  readonly incoming: Plain
}

/** `not-json` ليس JSON · `not-settings` ليس ملفّ إعدادات رصد · `newer` من إصدارٍ أحدث. */
export type SettingsFileFailure = 'not-json' | 'not-settings' | 'newer'

function reasonFor(type: string): DropReason {
  if (type === 'picklist' || type === 'literal') return 'option'
  if (type === 'regex') return 'format'
  if (['min_value', 'max_value', 'integer', 'min_length', 'max_length'].includes(type)) {
    return 'range'
  }
  return 'type'
}

function valueAt(root: unknown, path: string): unknown {
  let node = root
  for (const segment of path.split('.')) {
    if (node === null || typeof node !== 'object') return undefined
    node = (node as Plain)[segment]
  }
  return node
}

/** الورقة التي يتبعها مسار عطب: `privacy.excludedSites.2` ← `privacy.excludedSites`. */
function leafOf(path: string): string {
  const parts = path.split('.')
  while (parts.length > 0 && /^\d+$/u.test(parts[parts.length - 1] ?? '')) parts.pop()
  return parts.join('.')
}

/** يدمج `over` فوق `base` عمقًا: الكائنات تُدمج، وما سواها يُستبدل. */
function deepMerge(base: unknown, over: unknown): unknown {
  if (!isPlain(base) || !isPlain(over)) return over
  const out: Plain = { ...base }
  for (const [key, value] of Object.entries(over)) out[key] = deepMerge(base[key], value)
  return out
}

/** الدمج نفسه وقت العرض ووقت الكتابة — والقائمة تُجمع بترتيبها: الحالية أوّلًا ثمّ الجديد من الملفّ. */
function mergeInto(current: Settings, incoming: Plain): Settings {
  const merged = deepMerge(current, incoming) as Plain
  const sites = [...current.privacy.excludedSites]
  const fromFile = valueAt(incoming, SITES_PATH)
  for (const site of Array.isArray(fromFile) ? (fromFile as string[]) : []) {
    if (!sites.includes(site)) sites.push(site)
  }
  const privacy = { ...(merged.privacy as Plain), excludedSites: sites }
  return parseSettings({ ...merged, privacy }).settings
}

/**
 * يقرأ نصّ الملفّ ويبني الخطّة — **بلا كتابة**. ما لا يصلح يُسقط وحده ويُعدّ بسببه، والباقي يُقبل.
 */
export function planSettingsImport(
  text: string,
  current: Settings,
): Result<SettingsImportPlan, SettingsFileFailure> {
  let file: unknown
  try {
    file = JSON.parse(text)
  } catch {
    return err('not-json')
  }
  if (!isPlain(file) || file.format !== SETTINGS_FORMAT) return err('not-settings')
  if (typeof file.version === 'number' && file.version > SETTINGS_FILE_VERSION) return err('newer')
  if (!isPlain(file.settings)) return err('not-settings')
  const schemaVersion = file.settings.schemaVersion
  if (typeof schemaVersion === 'number' && schemaVersion > defaultSettings().schemaVersion) {
    return err('newer')
  }

  const raw = file.settings
  const dropped: DroppedSetting[] = []
  const detailed = parseSettingsDetailed(transferable(raw))
  for (const issue of detailed.issues) {
    dropped.push({
      path: leafOf(issue.path),
      reason: reasonFor(issue.type),
      received: valueAt(raw, issue.path),
    })
  }
  // الورقة التي سقطت كلّها — لا عنصرٌ منها.
  const fully = new Set(detailed.issues.filter((i) => leafOf(i.path) === i.path).map((i) => i.path))

  // مفتاحٌ لا يعرفه المخطّط يحذفه `valibot` بلا عطب — فيُعدّ هنا كي لا يختفي من الشاشة كما يختفي من الحفظ.
  const known = new Set(TRANSFERABLE_LEAVES)
  for (const path of leafPaths(raw)) {
    if (path === 'schemaVersion' || known.has(path) || fully.has(path)) continue
    const [section] = path.split('.')
    if (section === 'onboarding' || section === 'whatsNew') continue
    dropped.push({ path, reason: 'unknown', received: valueAt(raw, path) })
  }

  const incoming = isPlain(detailed.salvaged) ? transferable(detailed.salvaged) : {}
  const sites = valueAt(incoming, SITES_PATH)
  if (Array.isArray(sites)) {
    const normalized: string[] = []
    for (const site of sites as string[]) {
      const saved = savedSitePattern(site)
      if (saved === null) dropped.push({ path: SITES_PATH, reason: 'site', received: site })
      else if (!normalized.includes(saved)) normalized.push(saved)
    }
    incoming.privacy = { ...(incoming.privacy as Plain), excludedSites: normalized }
  }

  const accepted = leafPaths(transferable(raw)).filter((p) => known.has(p) && !fully.has(p))

  return ok({ settings: mergeInto(current, incoming), accepted, dropped, incoming })
}

/** يحفظ ما قُبل — دمجًا على الحالة القائمة وقت الكتابة، في طابور الإعدادات. */
export function applySettingsImport(plan: SettingsImportPlan): Promise<Result<Settings>> {
  return updateSettings((current) => mergeInto(current, plan.incoming))
}
