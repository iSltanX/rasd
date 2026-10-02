// @vitest-environment node
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest'

import defaultManifest, { buildManifest } from '../../../manifest.config'
import {
  BUILD_TARGETS,
  DEFAULT_TARGET,
  type BuildTarget as ToolTarget,
  OUT_DIRS,
  parseBuildTarget,
  resolveBuildTarget,
} from '../../../scripts/build-target'

import type { BuildTarget as RuntimeTarget } from '@/shared/platform/target'

/**
 * **بيانان من دالّة واحدة** — `Docs/Browsers/Architecture.md` §4.4.
 *
 * خمسة مفاتيح تفترق بين `chromium` و`firefox`، وكلّ ما سواها متطابق. هذا الاختبار يفرض الجدول **قبل البناء**، و
 * `verify:dist --target` يفرضه بعده على ما بُني — فلا يمرّ بيانٌ مخالف من أيٍّ منهما. وبيان `chromium` هو ما كان قبل
 * وجود هدفٍ ثانٍ حرفًا: بصمة حزمته شاهدٌ يُقارن في معايير SS1 (`shasum -a 256 -c`)، وهنا يُحرَس ما يُنتج بصمتها.
 */

type Json = Record<string, unknown>
const manifestOf = (target: RuntimeTarget): Json => buildManifest(target) as unknown as Json

/** المفاتيح الخمسة التي تفترق — وما عداها يجب أن يتساوى. */
const DIVERGING = [
  'background',
  'minimum_chrome_version',
  'browser_specific_settings',
  'incognito',
  'web_accessible_resources',
] as const

/** البيان بلا المفاتيح المفترقة، و`web_accessible_resources` بلا `use_dynamic_url` (مفتاحها المفترق الوحيد داخلها). */
function shared(manifest: Json): Json {
  const copy: Json = { ...manifest }
  for (const key of DIVERGING) delete copy[key]
  copy.web_accessible_resources = (manifest.web_accessible_resources as Json[]).map((group) => {
    const rest: Json = { ...group }
    delete rest.use_dynamic_url
    return rest
  })
  return copy
}

describe('بيان chromium — كما كان', () => {
  const m = manifestOf('chromium')

  it('عامل خدمة وحدة، بلا scripts', () => {
    expect(m.background).toEqual({ service_worker: 'src/background/index.ts', type: 'module' })
  })

  it('minimum_chrome_version = 116 وincognito = split', () => {
    expect(m.minimum_chrome_version).toBe('116')
    expect(m.incognito).toBe('split')
  })

  it('لا browser_specific_settings — لا يُشحن ما لا يقرؤه Chrome', () => {
    expect(m).not.toHaveProperty('browser_specific_settings')
  })

  it('use_dynamic_url = true في كل مجموعة موارد', () => {
    const groups = m.web_accessible_resources as Json[]
    expect(groups.length).toBeGreaterThan(0)
    for (const group of groups) expect(group.use_dynamic_url).toBe(true)
  })

  it('التصدير الافتراضي هو بيان chromium نفسه', () => {
    expect(defaultManifest).toEqual(m)
  })

  /**
   * `toEqual` لا يرى الترتيب، وترتيب المفاتيح العليا يعبر إلى `dist/manifest.json` بايتًا بايتًا فيدخل بصمة الزيب (أثبت
   * المراجع: نقل `incognito` قبل `commands` يبقي `toEqual` أخضر ويغيّر البصمة). فالترتيب يُثبَّت حرفًا — ومن أضاف
   * مفتاحًا لـchromium عمدًا يحدّث القائمة هنا ويعلم أن البصمة ستتغيّر.
   */
  it('ترتيب المفاتيح العليا كما كان — لأنه يدخل بصمة الحزمة', () => {
    expect(Object.keys(m)).toEqual([
      'manifest_version',
      'default_locale',
      'name',
      'short_name',
      'description',
      'version',
      'minimum_chrome_version',
      'icons',
      'action',
      'background',
      'permissions',
      'optional_permissions',
      'optional_host_permissions',
      'commands',
      'web_accessible_resources',
      'content_security_policy',
      'incognito',
    ])
    expect(Object.keys(m.background as Json)).toEqual(['service_worker', 'type'])
    expect(Object.keys((m.web_accessible_resources as Json[])[0] as Json)).toEqual([
      'resources',
      'matches',
      'use_dynamic_url',
    ])
  })
})

describe('بيان firefox — جدول §4.4', () => {
  const m = manifestOf('firefox')

  it('scripts لا service_worker (CRXJS يكتب المحمِّل والنوع)', () => {
    expect(m.background).toEqual({ scripts: ['src/background/index.ts'] })
  })

  it('لا minimum_chrome_version', () => {
    expect(m).not.toHaveProperty('minimum_chrome_version')
  })

  it('incognito = not_allowed صريحًا لا ضمنًا', () => {
    expect(m.incognito).toBe('not_allowed')
  })

  it('لا use_dynamic_url في أيّ مجموعة موارد', () => {
    for (const group of m.web_accessible_resources as Json[]) {
      expect(group).not.toHaveProperty('use_dynamic_url')
    }
  })

  /**
   * **المعرّف دائم** — قرار المالك 2026-10-02: لا يُغيَّر بعد أوّل توقيع في AMO، وتغييره إضافةٌ جديدة بمستخدمين جدد لا تحديث.
   * فيُكتب حرفًا هنا ليسقط أي تعديلٍ له.
   */
  it('gecko.id = rasd@bysltan.com — دائم', () => {
    const settings = m.browser_specific_settings as { gecko: Json }
    expect(settings.gecko.id).toBe('rasd@bysltan.com')
  })

  it('gecko: الحدّ الأدنى 140 وdata_collection_permissions (لا شيء مطلوب)', () => {
    const { gecko } = m.browser_specific_settings as { gecko: Json }
    expect(gecko.strict_min_version).toBe('140.0')
    expect(gecko.data_collection_permissions).toEqual({
      required: ['none'],
      optional: ['technicalAndInteraction', 'websiteContent'],
    })
  })

  it('gecko_android بحدٍّ أدنى 142 — يمنع تحذير المدقّق (قِيس في web-ext lint 10.7.0)', () => {
    const settings = m.browser_specific_settings as { gecko_android: Json }
    expect(settings.gecko_android).toEqual({ strict_min_version: '142.0' })
  })
})

describe('ما عدا الخمسة متطابق في الهدفين', () => {
  it('الباقي مطابقٌ بنيويًّا', () => {
    expect(shared(manifestOf('firefox'))).toEqual(shared(manifestOf('chromium')))
  })

  it('والمطابقة غير فارغة: الصلاحيات والاختصارات وCSP والأيقونات فيها فعلًا', () => {
    const common = shared(manifestOf('chromium'))
    for (const key of [
      'permissions',
      'optional_permissions',
      'optional_host_permissions',
      'commands',
      'content_security_policy',
      'icons',
      'action',
      'version',
    ]) {
      expect(common, key).toHaveProperty(key)
    }
  })

  it('سالب: مفتاحٌ يخصّ firefox وحده خارج الخمسة يُسقط المطابقة', () => {
    const drifted = { ...manifestOf('firefox'), extra_firefox_only: true }
    expect(shared(drifted)).not.toEqual(shared(manifestOf('chromium')))
  })

  it('سالب: صلاحيةٌ زائدة في أحدهما تُسقطها', () => {
    const drifted = { ...manifestOf('firefox'), permissions: ['tabs'] }
    expect(shared(drifted)).not.toEqual(shared(manifestOf('chromium')))
  })
})

describe('هدفٌ ليس هدفًا', () => {
  it.each(['Firefox', 'FIREFOX', 'firefox ', 'opera', '', 'chrome', undefined, null, 0])(
    'سالب: %j يُرفض بدل أن يُحمَل على chromium صامتًا',
    (bad) => {
      expect(() => buildManifest(bad as never)).toThrow(/ليس هدف بناء/u)
    },
  )
})

describe('مفاتيح لا تجتمع في بيانٍ واحد', () => {
  const cases: [RuntimeTarget, string[]][] = [
    ['chromium', ['scripts', 'browser_specific_settings']],
    ['firefox', ['service_worker', 'minimum_chrome_version']],
  ]

  it.each(cases)('%s لا يحمل مفتاح الآخر', (target, banned) => {
    const flat = JSON.stringify(manifestOf(target))
    for (const key of banned) expect(flat, `${target} يحمل ${key}`).not.toContain(`"${key}"`)
  })

  it('بناء firefox لا يلوّث chromium في العملية نفسها (لا حالة مشتركة)', () => {
    const before = JSON.stringify(manifestOf('chromium'))
    manifestOf('firefox')
    expect(JSON.stringify(manifestOf('chromium'))).toBe(before)
    expect(JSON.stringify(defaultManifest)).toBe(before)
  })
})

describe('هدف البناء من جهة الأدوات', () => {
  it('هدفان: chromium (الافتراضي) وfirefox، ولكلٍّ مجلّدٌ مختلف', () => {
    expect([...BUILD_TARGETS].sort()).toEqual(['chromium', 'firefox'])
    expect(DEFAULT_TARGET).toBe('chromium')
    expect(OUT_DIRS).toEqual({ chromium: 'dist', firefox: 'dist-firefox' })
  })

  it('القيمة غائبة أو فارغة ⇒ chromium، والهدفان يُقرآن', () => {
    expect(parseBuildTarget(undefined)).toBe('chromium')
    expect(parseBuildTarget('')).toBe('chromium')
    expect(parseBuildTarget('chromium')).toBe('chromium')
    expect(parseBuildTarget('firefox')).toBe('firefox')
  })

  it('سالب: ما ليس هدفًا يوقف بدل أن يصير ثالثًا صامتًا', () => {
    for (const bad of [
      'opera',
      'Firefox',
      'chrome',
      'dist',
      ' firefox',
      'constructor',
      '__proto__',
    ]) {
      expect(() => parseBuildTarget(bad), bad).toThrow(/ليس هدف بناء/u)
    }
  })

  it('الرسالة تسمّي مصدر القيمة والقيمة والمسموح', () => {
    expect(() => parseBuildTarget('opera')).toThrow(/RASD_TARGET = «opera».*chromium · firefox/u)
    expect(() => parseBuildTarget('opera', '--target')).toThrow(/^--target = «opera»/u)
  })

  it('resolveBuildTarget يقرأ RASD_TARGET ويعطي مجلّده', () => {
    expect(resolveBuildTarget({})).toEqual({ target: 'chromium', outDir: 'dist' })
    expect(resolveBuildTarget({ RASD_TARGET: 'firefox' })).toEqual({
      target: 'firefox',
      outDir: 'dist-firefox',
    })
    expect(() => resolveBuildTarget({ RASD_TARGET: 'opera' })).toThrow(/opera/u)
  })

  it('نوع الأدوات ونوع وقت التشغيل واحد — لا يفترق الهدفان بين العالمين', () => {
    expectTypeOf<ToolTarget>().toEqualTypeOf<RuntimeTarget>()
  })
})

describe('إعدادات Vite تتبع الهدف', () => {
  type ViteConfig = {
    build: { outDir: string; emptyOutDir: boolean; target: string }
    define?: Record<string, string>
    plugins?: unknown
  }
  type ConfigFn = (env: { mode: string; command: string }) => ViteConfig

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  // استيرادات صريحة لا بمتغيّر: Vite يرفض مسارًا ديناميكيًّا بلا امتداد في جزئه الثابت.
  const loaders = {
    main: async () => (await import('../../../vite.config')).default as unknown as ConfigFn,
    content: async () =>
      (await import('../../../vite.content.config')).default as unknown as ConfigFn,
  }

  async function configFor(which: keyof typeof loaders, target?: string): Promise<ViteConfig> {
    vi.stubEnv('RASD_TARGET', target ?? '')
    return (await loaders[which]())({ mode: 'production', command: 'build' })
  }

  /** الجزء المتسلسل بلا مجلّد الخرج والإضافات (دوالّ جديدة في كل استدعاء) — ما يجب أن يتساوى بين الهدفين. */
  const comparable = (config: ViteConfig): string => {
    const { plugins: _plugins, ...rest } = config
    return JSON.stringify({ ...rest, build: { ...rest.build, outDir: '' } })
  }

  it('الرئيسي: بلا تحديد ⇒ dist وchromium', async () => {
    const config = await configFor('main')
    expect(config.build.outDir).toBe('dist')
    expect(config.build.emptyOutDir).toBe(true)
    expect(config.define?.['import.meta.env.VITE_RASD_TARGET']).toBe('"chromium"')
  })

  it('الرئيسي: firefox ⇒ dist-firefox وثابت الهدف', async () => {
    const config = await configFor('main', 'firefox')
    expect(config.build.outDir).toBe('dist-firefox')
    expect(config.define?.['import.meta.env.VITE_RASD_TARGET']).toBe('"firefox"')
  })

  it('الرئيسي: لغة الخفض واحدة في الهدفين — الفرق البيان والمحمِّل لا الشيفرة المنقولة', async () => {
    expect((await configFor('main')).build.target).toBe('chrome116')
    expect((await configFor('main', 'firefox')).build.target).toBe('chrome116')
  })

  it('الرئيسي: الهدف الخاطئ يوقف التهيئة', async () => {
    await expect(configFor('main', 'opera')).rejects.toThrow(/ليس هدف بناء/u)
  })

  it('الطبقة داخل الصفحة: المجلّد وحده يتبع الهدف، ولا ثابت هدفٍ فيها (بايتاتٌ واحدة)', async () => {
    const chromium = await configFor('content')
    const firefox = await configFor('content', 'firefox')
    expect(chromium.build.outDir).toBe('dist')
    expect(firefox.build.outDir).toBe('dist-firefox')
    // لا يمسح مجلّد الخرج: بناءٌ ثانٍ فوق الأوّل
    expect(firefox.build.emptyOutDir).toBe(false)
    // وما سوى المجلّد واحد، ولا define للهدف: وإلا اختلفت `content.js` بين الحزمتين
    expect(comparable(firefox)).toBe(comparable(chromium))
    expect(firefox.define).toBeUndefined()
  })

  it('سالب: لو أُضيف define للهدف في بناء الطبقة لسقطت المقارنة', () => {
    const base: ViteConfig = { build: { outDir: 'x', emptyOutDir: false, target: 'chrome116' } }
    const withDefine: ViteConfig = {
      ...base,
      define: { 'import.meta.env.VITE_RASD_TARGET': '"firefox"' },
    }
    expect(comparable(withDefine)).not.toBe(comparable(base))
  })
})
