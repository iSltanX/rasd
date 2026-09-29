/**
 * مخطّط الإعدادات وقيمه الافتراضية.
 *
 * التحقّق ضروري لأن `chrome.storage.local` يقبل أي شكل: نسخة قديمة من الإضافة،
 * أو استيراد ملف إعدادات محرَّر يدويًا (المرحلة 20)، قد يكتب قيمة لا تطابق النوع.
 * القراءة تُصحّح ما أمكن وتعود إلى الافتراضي فيما تعذّر — بلا انهيار.
 *
 * `valibot` لا `zod`: أخفّ وقابل للهزّ الشجري، وميزانية حزمة الـcontent script
 * في المرحلة 24 محسوبة بالكيلوبايت.
 */

import * as v from 'valibot'

/**
 * ألوان التعليق المتاحة — توكنات دلالية، لا قيم سداسية.
 * كل واحد يتبع السمة تلقائيًا ويتغيّر مع نظام التصميم.
 */
export const ANNOTATION_COLORS = [
  'tool/annotate/solid',
  'tool/capture/solid',
  'tool/inspect/solid',
  'tool/measure/solid',
  'tool/compare/solid',
  'status/danger/solid',
  'status/success/solid',
] as const

export const CaptureFormat = v.picklist(['png', 'webp'])
export const ColorFormat = v.picklist(['hex', 'rgb', 'hsl', 'oklch', 'css'])
export const ThemeMode = v.picklist(['system', 'dark', 'light'])
export const Language = v.picklist(['ar', 'en'])
export const PinShape = v.picklist(['circle', 'square', 'pin'])

/**
 * `§11.1` — التصفّح الخاص، **ثلاث حالات على مقياس واحد لا بوليانان**.
 *
 * نصّ المواصفة (`Rasd_Ar.md §11.1`) يطلب حالتين متدرّجتين فوق حالة «لا شيء»:
 * «منع الحفظ التلقائي … **مع إمكانية تعطيل الإضافة فيه بالكامل**». وبوليانان
 * منفصلان يسمحان بتركيبة لا معنى لها («عطّل كليًّا» + «اسمح بالحفظ»)؛
 * و`picklist` واحد يمنعها **بالبناء** لا بالانضباط.
 *
 * - `allow` — تعمل وتحفظ كالوضع العادي.
 * - `no-save` — تعمل ولا تكتب شيئًا على القرص (‏`storage/db.ts`).
 * - `off` — لا تُحقَن أصلًا؛ يُنفَّذ من بوّابة الحقن الواحدة (‏ADR 0020).
 */
export const IncognitoMode = v.picklist(['allow', 'no-save', 'off'])

export const SettingsSchema = v.object({
  schemaVersion: v.optional(v.number(), 1),

  capture: v.optional(
    v.object({
      format: v.optional(CaptureFormat, 'png'),
      quality: v.optional(v.pipe(v.number(), v.minValue(0.1), v.maxValue(1)), 0.92),
      scale: v.optional(v.picklist([1, 2]), 1),
      openEditorAfter: v.optional(v.boolean(), true),
      copyToClipboard: v.optional(v.boolean(), false),
      delaySeconds: v.optional(v.picklist([0, 3, 5, 10]), 0),
      /**
       * `§12.1` — مكان الحفظ. المكتبة وحدها دائمًا الوجهة الفعلية اليوم
       * (`putCaptureWithBlob`)؛ `library-and-downloads` ضابطٌ محفوظٌ ومقروء
       * الآن، واستهلاكه في خط أنابيب الالتقاط خارج نطاق الوحدة 20.2
       * (`Docs/Engineering.md §6` صفّ 115) — يحتاج صلاحية `downloads` الاختيارية
       * نفسها التي بنتها المرحلة 19 لمسار التصدير، لا سلكًا جديدًا موازيًا.
       */
      saveLocation: v.optional(v.picklist(['library', 'library-and-downloads']), 'library'),
    }),
    {},
  ),

  annotation: v.optional(
    v.object({
      /**
       * لون التعليق كـ**اسم توكن** لا قيمة سداسية.
       *
       * القيمة الحرفية هنا تعني لونًا لا يتبع السمة ولا يتغيّر مع نظام التصميم،
       * وتخالف عقد التوكنز. المحرّر (المرحلة 15) يحسمه إلى سداسي عبر
       * `resolveColor()` لأن Canvas لا تصله متغيّرات CSS.
       */
      color: v.optional(v.picklist(ANNOTATION_COLORS), 'tool/annotate/solid'),
      strokeWidth: v.optional(v.pipe(v.number(), v.minValue(1), v.maxValue(24)), 3),
      fontSize: v.optional(v.pipe(v.number(), v.minValue(10), v.maxValue(72)), 16),
      pinShape: v.optional(PinShape, 'circle'),
      pinStart: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0)), 1),
    }),
    {},
  ),

  colors: v.optional(
    v.object({
      defaultFormat: v.optional(ColorFormat, 'hex'),
      paletteSize: v.optional(v.pipe(v.number(), v.integer(), v.minValue(3), v.maxValue(24)), 8),
      hideNeutrals: v.optional(v.boolean(), true),
      scaleSystem: v.optional(v.picklist(['50-950', 'tints-shades']), '50-950'),
    }),
    {},
  ),

  appearance: v.optional(
    v.object({
      theme: v.optional(ThemeMode, 'system'),
      language: v.optional(Language, 'ar'),
      density: v.optional(v.picklist(['compact', 'comfortable']), 'comfortable'),
    }),
    {},
  ),

  shortcuts: v.optional(
    v.object({
      /**
       * `§12.4` — «اختصار مستقلّ لكل أداة». مُعدِّل الأوضاع `⌥⇧` ثابت
       * (`content/shortcuts.ts`)؛ القابل للتعديل هو الحرف وحده، مُخزَّنًا
       * بموضعه الفيزيائي (`KeyboardEvent.code`) لا برمزه — نفس منطق
       * `matches()` في `content/shortcuts.ts`. الافتراضات تطابق الخريطة
       * الثابتة القائمة منذ المرحلة 6 حرفًا بحرف.
       */
      toolKeys: v.optional(
        v.object({
          inspect: v.optional(v.pipe(v.string(), v.regex(/^Key[A-Z]$/)), 'KeyI'),
          measure: v.optional(v.pipe(v.string(), v.regex(/^Key[A-Z]$/)), 'KeyM'),
          colour: v.optional(v.pipe(v.string(), v.regex(/^Key[A-Z]$/)), 'KeyC'),
          compare: v.optional(v.pipe(v.string(), v.regex(/^Key[A-Z]$/)), 'KeyD'),
        }),
        {},
      ),
    }),
    {},
  ),

  privacy: v.optional(
    v.object({
      /**
       * `§11.1` — سلوك الإضافة في التصفّح الخاص. حلَّ محلّ البولياني
       * `blockIncognitoWrites` في الوحدة 20.3 (‏`migrateLegacyKeys` أدناه
       * يحفظ اختيار من ضبطه سابقًا). الافتراضي `no-save` يطابق الافتراضي
       * القديم `true` حرفًا بحرف.
       */
      incognito: v.optional(IncognitoMode, 'no-save'),
      /** أنماط مواقع لا تعمل فيها الإضافة — تُنفَّذ عند بوّابة الحقن (20.0). */
      excludedSites: v.optional(v.array(v.string()), []),
      localOnly: v.optional(v.boolean(), true),
      stripMetadataOnExport: v.optional(v.boolean(), false),
      autoDeleteAfterDays: v.optional(v.picklist([0, 7, 30, 90]), 0),
    }),
    {},
  ),

  onboarding: v.optional(
    v.object({
      completed: v.optional(v.boolean(), false),
      completedAt: v.optional(v.nullable(v.number()), null),
    }),
    {},
  ),
})

export type Settings = v.InferOutput<typeof SettingsSchema>

/** القيم الافتراضية الكاملة — تُشتقّ من المخطّط لا تُكتب مرّتين. */
export function defaultSettings(): Settings {
  return v.parse(SettingsSchema, {})
}

/**
 * يُسقط مفتاحًا واحدًا **بمساره الكامل** من نسخة، بلا لمس الأصل.
 *
 * **ولماذا بالمسار الكامل لا بجذره.** كان الإنقاذ يحذف `path.split('.')[0]`،
 * أي **القسم الأعلى كاملًا**: قيمة تالفة واحدة في `privacy.autoDeleteAfterDays`
 * تمحو `privacy` كلّها فتصير `excludedSites` فارغة. والفراغ هنا ليس نقصًا
 * محايدًا — `evaluateGate` تقرؤه **سماحًا** لا جهلًا، فينكسر ضمان
 * [ADR 0020](../../../Docs/ADR/0020-injection-gate.md) البند 5 («قُرئت وهي
 * فارغة ≠ لم تُقرأ») من بابٍ لا يمرّ بمسار الفشل الذي حرسه. وأسوأ من ذلك أن
 * `patchSettings` تكتب النتيجة المُنقَذة على القرص، فينقلب الفقد من عابرٍ
 * إلى دائم بصمت. (‏`Docs/Engineering.md §6` صفّ 119.)
 *
 * والمصفوفة تُرشَّح لا تُحذف بـ`delete`: الحذف بالفهرس يترك ثقبًا
 * (`undefined`) يسقط في إعادة التحقّق نفسها التي جاء الإنقاذ ليمرّرها.
 */
function dropAtPath(node: unknown, segments: readonly string[]): unknown {
  const [head, ...rest] = segments
  if (head === undefined) return node

  if (Array.isArray(node)) {
    const items = node as unknown[]
    const index = Number(head)
    if (!Number.isInteger(index) || index < 0 || index >= items.length) return node
    if (rest.length === 0) return items.filter((_, i) => i !== index)
    const copy = [...items]
    copy[index] = dropAtPath(copy[index], rest)
    return copy
  }

  if (node && typeof node === 'object') {
    const copy: Record<string, unknown> = { ...(node as Record<string, unknown>) }
    if (rest.length === 0) {
      delete copy[head]
      return copy
    }
    if (!(head in copy)) return node
    copy[head] = dropAtPath(copy[head], rest)
    return copy
  }

  return node
}

/**
 * يرتّب مسارات الأعطاب **تنازليًّا عند فهارس المصفوفات** قبل الإسقاط.
 *
 * **العطل الذي بُنيت له، ورصدته مراجعة Gate B للوحدة 20.3:** إسقاط عنصر من
 * مصفوفة يُزيح فهارس ما بعده. فمصفوفةٌ فيها تالفان عند الفهرسين 1 و2 كانت
 * تُعالَج بالترتيب: يُحذف 1 فيصير العنصر السليم عند 2، ثمّ يُحذف «2» فيُطيَّح
 * **السليم** ويبقى التالف — فتفشل إعادة التحقّق، ويسقط الإنقاذ كلّه، وتعود
 * **كل** الإعدادات إلى الافتراضي ومعها `excludedSites` فارغةً. أي أن الإصلاح
 * الذي كتبته هذه الوحدة للصفّ 119 كان يُعيد إنتاج العطل نفسه عند تالفَين لا
 * تالفٍ واحد. (‏`§6` صفّ 129.)
 *
 * والمعالجة من الأعلى إلى الأدنى تُبقي الفهارس الأصغر صحيحة دائمًا، لأن حذف
 * الأكبر لا يزحزح ما قبله. والمقارنة رقميّة عند المقاطع الرقمية ونصّية عند
 * غيرها — فـ`10` بعد `9` لا قبلها.
 */
function orderedIssuePaths(issues: readonly { readonly path?: unknown }[]): string[][] {
  const paths: string[][] = []
  for (const issue of issues) {
    const dotted = v.getDotPath(issue as never)
    if (dotted) paths.push(dotted.split('.'))
  }
  return paths.sort((a, b) => {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const x = a[i]
      const y = b[i]
      if (x === y) continue
      if (x === undefined) return 1
      if (y === undefined) return -1
      const nx = Number(x)
      const ny = Number(y)
      if (Number.isInteger(nx) && Number.isInteger(ny)) return ny - nx
      return x < y ? 1 : -1
    }
    return 0
  })
}

/**
 * يرحّل المفاتيح المهجورة — **على المدخَل الخام قبل التحقّق حصرًا**.
 *
 * `v.object` يحذف المفاتيح المجهولة بلا `issue` واحد (‏موثَّق في الحزمة
 * نفسها)، فالمفتاح القديم لا يُرى إلّا هنا. وبلا هذا الترحيل يُمحى اختيار
 * مستخدمٍ ضبط سلوك التصفّح الخاص سابقًا ويُستبدَل بالافتراضي صامتًا —
 * وترقيةٌ صامتة نحو التشديد تبقى فقدانَ قرارٍ اتّخذه المستخدم بيده.
 *
 * ولا آلة ترحيل عامّة في المشروع: `schemaVersion` معرَّف في المخطّط وبلا
 * قارئ واحد. فهذا أوّل ترحيل إعدادات، ويبقى بهذا الحجم حتى يوجد ثانٍ.
 */
function migrateLegacyKeys(input: unknown): unknown {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input
  const root = input as Record<string, unknown>
  const privacy = root.privacy
  if (!privacy || typeof privacy !== 'object' || Array.isArray(privacy)) return input

  const section = privacy as Record<string, unknown>
  if ('incognito' in section || !('blockIncognitoWrites' in section)) return input

  // 20.3 — `blockIncognitoWrites: false` كان «اسمح بالحفظ»، وأي قيمة أخرى منعًا.
  const legacy = section.blockIncognitoWrites
  return {
    ...root,
    privacy: { ...section, incognito: legacy === false ? 'allow' : 'no-save' },
  }
}

/**
 * يقرأ قيمة غير موثوقة ويُرجع إعدادات صالحة دائمًا.
 *
 * لا يرمي: القيمة التالفة تُستبدل بالافتراضي، والأسباب تُعاد للسجلّ.
 */
export function parseSettings(input: unknown): { settings: Settings; issues: string[] } {
  const migrated = migrateLegacyKeys(input ?? {})
  const result = v.safeParse(SettingsSchema, migrated)
  if (result.success) return { settings: result.output, issues: [] }

  const issues = result.issues.map(
    (issue) => `${v.getDotPath(issue) ?? '(الجذر)'}: ${issue.message}`,
  )

  // محاولة إنقاذ جزئية: نُسقط المفاتيح المعطوبة وحدها ونعيد التحقّق.
  if (migrated && typeof migrated === 'object') {
    let salvaged: unknown = migrated
    for (const path of orderedIssuePaths(result.issues)) {
      salvaged = dropAtPath(salvaged, path)
    }
    const retry = v.safeParse(SettingsSchema, salvaged)
    if (retry.success) return { settings: retry.output, issues }
  }

  return { settings: defaultSettings(), issues }
}
