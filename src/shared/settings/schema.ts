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
       * (`Rasd_Plan.md §6` صفّ 115) — يحتاج صلاحية `downloads` الاختيارية
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
      /** يمنع طبقة التخزين من الكتابة في التصفّح الخاص. */
      blockIncognitoWrites: v.optional(v.boolean(), true),
      /** أنماط مواقع لا تعمل فيها الإضافة — تُنفَّذ في المرحلة 20. */
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
 * يقرأ قيمة غير موثوقة ويُرجع إعدادات صالحة دائمًا.
 *
 * لا يرمي: القيمة التالفة تُستبدل بالافتراضي، والأسباب تُعاد للسجلّ.
 */
export function parseSettings(input: unknown): { settings: Settings; issues: string[] } {
  const result = v.safeParse(SettingsSchema, input ?? {})
  if (result.success) return { settings: result.output, issues: [] }

  const issues = result.issues.map(
    (issue) => `${v.getDotPath(issue) ?? '(الجذر)'}: ${issue.message}`,
  )

  // محاولة إنقاذ جزئية: نُسقط المفاتيح المعطوبة ونعيد التحقّق.
  if (input && typeof input === 'object') {
    const salvaged: Record<string, unknown> = { ...(input as Record<string, unknown>) }
    for (const issue of result.issues) {
      const path = v.getDotPath(issue)
      if (path) delete salvaged[path.split('.')[0] ?? '']
    }
    const retry = v.safeParse(SettingsSchema, salvaged)
    if (retry.success) return { settings: retry.output, issues }
  }

  return { settings: defaultSettings(), issues }
}
