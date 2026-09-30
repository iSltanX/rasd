/**
 * تقرير المقارنة — ما يُكتب فيه، منطقًا بلا DOM ولا قماش.
 *
 * **النسبة ما حسبه المحرّك لا ما يُعاد حسابه هنا:** `diffRatio` من `computeDiff` بقناعه — البكسلات المستثناة
 * خارج البسط والمقام (ADR 0034). فالتقرير ينقلها كما هي ويقول على ماذا حُسبت، ولا يملك طريقًا ثانيًا إلى
 * رقمٍ آخر. والمناطق المستثناة **مسمّاةٌ مرقَّمة** هنا، و**مخطّطةٌ بالأرقام نفسها** في صورة الفرق
 * (`diff-slices.ts`) — فيطابق القارئ السطر بالمستطيل.
 *
 * **والحذف يمحو البيانات الوصفية من الورقة لا من قاموس `Info` وحده:** مع `privacy.stripMetadataOnExport` لا
 * عنوان لقطة ولا رابط في النصّ — «اللقطة أ» و«اللقطة ب» مكان العنوانين، والرابط لا يُعرض خيارًا أصلًا.
 */

import { formatDimensions } from '@/shared/bidi'
import { isolate } from '@/shared/bidi/isolate'
import {
  countText,
  formatHuman,
  formatMeasure,
  formatPercent,
  type CountForms,
} from '@/shared/bidi/numerals'

import { formatCaptureTime } from '../editor/page-meta'

import { pixelCountSummary } from './region-format'

import type { SessionZone } from './session-zones'
import type { DiffResult } from '@/modules/compare/diff'
import type { DiffRegion } from '@/modules/compare/regions'
import type { PdfMetadata } from '@/modules/export/pdf'
import type { DocBlock, DocItem } from '@/modules/export/pdf-document'
import type { DeviceRect } from '@/shared/geometry'
import type { CaptureRecord } from '@/shared/storage/schema'

/** ما يختاره المستخدم في «يتضمّن التقرير» — إطار `compare / report` (`291:12538`). */
export interface ReportInclude {
  readonly diffImage: boolean
  readonly regions: boolean
  readonly captures: boolean
  readonly pageLink: boolean
}

export const DEFAULT_INCLUDE: ReportInclude = {
  diffImage: true,
  regions: true,
  captures: true,
  pageLink: false,
}

export type ReportOutcome = Pick<
  DiffResult,
  'diffRatio' | 'diffPixelCount' | 'comparedPixels' | 'excludedPixels' | 'overlap'
> & { readonly regions: readonly DiffRegion[] }

export interface ReportInput {
  /** المرجع — «قبل». */
  readonly a: CaptureRecord
  /** الحالية — «بعد»، وصورة الفرق مركَّبة فوقها. */
  readonly b: CaptureRecord
  readonly outcome: ReportOutcome
  readonly zones: readonly SessionZone[]
  readonly threshold: number
  readonly include: ReportInclude
  /** `privacy.stripMetadataOnExport`. */
  readonly strip: boolean
}

export const REGION_FORMS: CountForms = {
  one: 'منطقة واحدة',
  two: 'منطقتان',
  many: 'مناطق',
  accusative: 'منطقة',
  singular: 'منطقة',
}

/**
 * سقف المناطق المسرودة نصًّا — المحرّك قد يُخرج مئات المناطق من ضجيجٍ واسع، وسردها كلّها صفحاتٌ لا يقرؤها
 * أحد. ما فوقه يُقال عدده، والصورة ترسمها كلّها.
 */
export const MAX_LISTED_REGIONS = 200

/**
 * موضع مستطيلٍ ومقاسه — قياسٌ غربي، **كلُّ قيمةٍ معزولة**.
 *
 * الورقة تُرسم على قماشٍ بخوارزمية الاتجاه نفسها، و`900, 40` بين كلمتين عربيتين تصير `40 ,900`: رقمان يفصلهما
 * فاصلٌ ومسافة جولتان منفصلتان في سطرٍ يميني. العزل (LRI…PDI) يُبقي كل قيمة كما تُكتب — رآه الفحص البصري
 * على الورقة المرسومة لا الاختبار.
 */
export function rectText(rect: DeviceRect): string {
  const at = `${formatMeasure(rect.x)}, ${formatMeasure(rect.y)}`
  return `${isolate(formatDimensions(rect.width, rect.height))} عند ${isolate(at)}`
}

/** طريقة الحساب للورقة — العتبة معزولة: `%10` بلا عزل في سطرٍ يميني. */
export function methodText(threshold: number): string {
  return `فرق إدراكي بفضاء ${isolate('YIQ (pixelmatch)')} — عتبة التجاهل ${isolate(formatPercent(threshold))}`
}

/** عنوانا اللقطتين كما يُكتبان — أو بديلاهما مع الحذف. */
export function captureNames(input: Pick<ReportInput, 'a' | 'b' | 'strip'>): {
  readonly a: string
  readonly b: string
} {
  if (input.strip) return { a: 'اللقطة أ', b: 'اللقطة ب' }
  return { a: input.a.title || 'اللقطة أ', b: input.b.title || 'اللقطة ب' }
}

export function reportBlocks(input: ReportInput): DocBlock[] {
  const { outcome, zones } = input
  const names = captureNames(input)
  const blocks: DocBlock[] = [
    { kind: 'title', text: 'تقرير المقارنة', sub: `المرجع: ${names.a} · الحالية: ${names.b}` },
    { kind: 'heading', text: 'النتيجة' },
    {
      kind: 'rows',
      rows: [
        { label: 'نسبة الفرق', value: formatPercent(outcome.diffRatio), mono: true },
        ...(zones.length > 0
          ? [
              {
                label: 'تُحسب على',
                value: 'المناطق المهمّة وحدها — المستثناة خارج البسط والمقام',
                mono: false,
              },
            ]
          : []),
        {
          label: 'البكسلات المختلفة',
          value: pixelCountSummary(outcome.diffPixelCount, outcome.comparedPixels),
          mono: false,
        },
        {
          label: 'المناطق المختلفة',
          value:
            outcome.regions.length === 0
              ? 'لا شيء'
              : countText(outcome.regions.length, REGION_FORMS),
          mono: false,
        },
        {
          label: 'المقاس المقارَن',
          value: formatDimensions(outcome.overlap.width, outcome.overlap.height),
          mono: true,
        },
        { label: 'طريقة الحساب', value: methodText(input.threshold), mono: false },
      ],
    },
  ]

  if (zones.length > 0) {
    blocks.push(
      { kind: 'heading', text: `المناطق المستثناة · ${formatHuman(zones.length)}` },
      {
        kind: 'text',
        text: `لا تدخل في النسبة ولا في المناطق المختلفة — ${isolate(formatMeasure(outcome.excludedPixels))} بكسل. ومخطّطةٌ في صورة الفرق بأرقامها.`,
      },
      {
        kind: 'items',
        items: zones.map((zone, i): DocItem => ({
          number: formatHuman(i + 1),
          title: `منطقة مستثناة ${formatHuman(i + 1)}`,
          chip: { text: 'لهذه الجلسة', tone: 'warning' },
          lines: [{ text: rectText(zone.rect), mono: false }],
        })),
      },
    )
  }

  if (input.include.regions && outcome.regions.length > 0) {
    const listed = outcome.regions.slice(0, MAX_LISTED_REGIONS)
    blocks.push(
      { kind: 'heading', text: `المناطق المختلفة · ${formatHuman(outcome.regions.length)}` },
      {
        kind: 'items',
        items: listed.map((region): DocItem => ({
          number: formatHuman(region.id),
          title: `منطقة ${formatHuman(region.id)}`,
          chip: null,
          lines: [
            {
              text: `${rectText(region.rect)} · ${isolate(formatMeasure(region.pixels))} بكسل مختلف`,
              mono: false,
            },
          ],
        })),
      },
    )
    const rest = outcome.regions.length - listed.length
    if (rest > 0) {
      blocks.push({
        kind: 'text',
        text: `و${countText(rest, REGION_FORMS)} أخرى — مرسومةٌ كلّها في صورة الفرق.`,
      })
    }
  }

  if (input.include.captures) {
    const size = (c: CaptureRecord) =>
      `${formatDimensions(c.width, c.height)} @${c.devicePixelRatio}×`
    // وقت الالتقاط بيانٌ وصفيّ كالرابط (`pdf-content.ts`): يُحذف معها، والمقاس يبقى.
    const time = (label: string, c: CaptureRecord) =>
      input.strip ? [] : [{ label, value: formatCaptureTime(c.createdAt), mono: true }]
    blocks.push(
      { kind: 'heading', text: 'اللقطتان' },
      {
        kind: 'rows',
        rows: [
          { label: 'المرجع — المقاس', value: size(input.a), mono: true },
          ...time('المرجع — وقت الالتقاط', input.a),
          { label: 'الحالية — المقاس', value: size(input.b), mono: true },
          ...time('الحالية — وقت الالتقاط', input.b),
        ],
      },
    )
  }

  if (input.include.pageLink && !input.strip) {
    blocks.push(
      { kind: 'heading', text: 'رابط الصفحة' },
      {
        kind: 'rows',
        rows: [
          { label: 'المرجع', value: input.a.url, mono: true },
          { label: 'الحالية', value: input.b.url, mono: true },
        ],
      },
    )
  }

  return blocks
}

/** قاموس `Info` للتقرير — أو `null` مع الحذف. */
export function reportMetadata(
  input: Pick<ReportInput, 'a' | 'b' | 'strip'>,
  projectName: string | null,
  now: Date,
): PdfMetadata | null {
  if (input.strip) return null
  const names = captureNames(input)
  return {
    title: `تقرير المقارنة — ${names.b} مقابل ${names.a}`,
    subject: input.b.url,
    keywords: projectName ? [projectName] : [],
    createdAt: now,
  }
}

/** ما يُرسم فوق صورة الفرق: المناطق المختلفة بأرقامها، والمستثناة بأرقامها في التقرير نفسه. */
export interface ReportMarks {
  readonly regions: readonly { readonly label: string; readonly rect: DeviceRect }[]
  readonly zones: readonly { readonly label: string; readonly rect: DeviceRect }[]
}

export function reportMarks(outcome: ReportOutcome, zones: readonly SessionZone[]): ReportMarks {
  return {
    regions: outcome.regions.map((r) => ({ label: formatHuman(r.id), rect: r.rect })),
    zones: zones.map((z, i) => ({ label: formatHuman(i + 1), rect: z.rect })),
  }
}
