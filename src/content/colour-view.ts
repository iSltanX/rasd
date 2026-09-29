/**
 * من حالة أداة اللون إلى صفوف اللوحة — الترجمة وحدها، بلا حساب ولا DOM.
 *
 * **موضعها هنا لا في `ui/`** — السابقة نفسها التي وضعت `inspect-view.ts`
 * في `content/`: بدائيّات الطبقة «تعرض ولا تحسب»، فلا تعرف أنواع الأدوات
 * ولا تُشتقّ منها. ولا في `modules/` لأنها لا تحسب شيئًا يستحقّ الاختبار
 * مستقلًّا عن شكل اللوحة — هي جسر بين طرفين معلومين.
 */

import { formatRatio, type ContrastCheck } from '@/modules/colour/contrast'
import { type ColourFormats, type ColourReading } from '@/modules/colour/formats'
import { type TailwindNaming } from '@/modules/colour/tailwind'

import type { PinnedColour } from './tools/eyedropper'
import type { SheetSource } from '@/modules/computed-style/sheets'
import type { ColourContrastView, ColourRow, ColourVarView } from '@/ui/overlay/colour/ColourPanel'

/**
 * الصيغة المضغوطة المعروضة — الكاملة تُنسخ.
 *
 * الملفّ يكتب `59 130 246` و`217 91% 60%` و`0.62 0.19 260`: مكوّنات بلا
 * غلاف الدالّة، وهي صيغة CSS Color 4 الصحيحة بذاتها. والضغط ليس اختصارًا
 * تجميليًّا: عرض اللوحة 360px، والقيمة الكاملة مع أيقونة النسخ والتسمية
 * تتجاوزه في `oklch()` و`hsl()` معًا.
 */
function compact(css: string): string {
  const inside = /^[a-z]+\(([^)]*)\)$/i.exec(css.trim())
  if (!inside) return css
  return inside[1]!.replace(/,\s*/g, ' ').trim()
}

/** OKLCH للعرض: ثلاث قيم قصيرة لا أربع خانات — `0.62 0.19 260`. */
function compactOklch(c: ColourReading): string {
  const l = (Math.round(c.oklch.l * 100) / 100).toString()
  const chroma = (Math.round(c.oklch.c * 100) / 100).toString()
  const h = Math.round(c.oklch.h).toString()
  return `${l} ${chroma} ${h}`
}

/**
 * صفّ Tailwind — الاسم وحده لا يكفي، فالمسافة تُقال معه.
 *
 * `exact` يعطي الاسم صريحًا. و`near` يسبقه بـ`≈` ويُلحق ΔE. و`far` لا
 * يعطي اسمًا أصلًا بل القيمة الصريحة، لأن اسمًا لا يطابق يُلصَق فيُنتج
 * لونًا آخر — وهو الخطر الذي رفضته المرحلة 11 صراحةً.
 */
function tailwindRow(tw: TailwindNaming): ColourRow {
  if (tw.verdict === 'exact') {
    return { label: 'TAILWIND', shown: tw.name!, copy: tw.name! }
  }
  if (tw.verdict === 'near') {
    return {
      label: 'TAILWIND',
      shown: `≈ ${tw.name!}`,
      copy: tw.name!,
      note: `ΔE ${tw.nearest.deltaE.toFixed(3)}`,
    }
  }
  return {
    label: 'TAILWIND',
    shown: tw.arbitrary,
    copy: tw.arbitrary,
    note: `لا اسم قريب · أقربها ${tw.nearest.swatch.name}`,
  }
}

/** الصيغ الخمس صفوفًا — بالترتيب نفسه في `65:75`. */
export function formatRows(
  reading: ColourReading,
  formats: ColourFormats,
  tailwind: TailwindNaming,
): ColourRow[] {
  return [
    { label: 'HEX', shown: formats.hex.toUpperCase(), copy: formats.hex },
    { label: 'RGB', shown: compact(formats.rgb), copy: formats.rgb },
    { label: 'HSL', shown: compact(formats.hsl), copy: formats.hsl },
    { label: 'OKLCH', shown: compactOklch(reading), copy: formats.oklch },
    tailwindRow(tailwind),
  ]
}

/** أحكام WCAG كما تُكتب في الشارة — نصّ الملفّ في `65:126`. */
const VERDICT_TEXT: Record<string, string> = {
  AAA: 'AAA',
  AA: 'AA',
  fail: 'دون AA',
}

/**
 * شارة التباين.
 *
 * **الحكم على النصّ العادي، والشارة تقول ما ينجح فعلًا.** نسبة 3.68 تفشل
 * عند 4.5 وتنجح عند 3 — فقول «فشل» وحده يخفي أنها صالحة للنصّ الكبير،
 * وقول «AA» وحده يكذب. ونصّ الملفّ نفسه يحسمها: «AA للنص الكبير فقط».
 */
export function contrastView(check: ContrastCheck, assumedWhite: boolean): ColourContrastView {
  const ratio = check.wcag.ratio
  const level = check.wcag.level
  const badge =
    level === 'fail' && ratio >= 3
      ? 'AA للنص الكبير فقط'
      : level === 'fail'
        ? 'دون AA'
        : (VERDICT_TEXT[level] ?? level)

  return {
    ratio: formatRatio(ratio),
    level,
    badge,
    against: assumedWhite ? 'على أبيض' : 'على الخلفية المحسوبة',
    assumed: assumedWhite,
    unreadable: check.unreadable,
  }
}

/**
 * المتغيّر المعروض — من أوّل خاصّية لونية تحمل تتبّعًا.
 *
 * `background-color` تُقدَّم على `color` حين توجد: عيّنة البكسل غالبًا من
 * مساحة لا من حرف، فمتغيّر الخلفية هو الذي يفسّر ما تحت المؤشِّر.
 */
export function variableView(pinned: PinnedColour): ColourVarView | null {
  const byBg = pinned.declared.find((d) => d.prop === 'background-color' && d.trace)
  const chosen = byBg ?? pinned.declared.find((d) => d.trace)
  const trace = chosen?.trace
  const link = trace?.chain[0]
  if (!link) return null

  /*
   * موضع التعريف: اسم الورقة ورقم السطر حين تُعرف القاعدة، وإلّا `null`.
   *
   * الحالة `opaque` ليست نادرة — قِيس على stripe.com ستّ أوراق محجوبة
   * وصفر قاعدة مقروءة. واللوحة تقول «غير مقروء» بدل أن تترك فراغًا يُقرأ
   * «لا متغيّر».
   */
  const origin =
    trace.provenance.kind === 'declared' && trace.provenance.rule?.source
      ? originText(trace.provenance.rule.source)
      : null

  return { name: link.name, origin }
}

/**
 * اسم الورقة المعرِّفة — **بلا رقم سطر، وهذا حدّ منصّة لا نقص تنفيذ**.
 *
 * الملفّ يكتب `tokens.css : 42` في `65:74`، ورقم السطر **لا سبيل إليه**:
 * `CSSRule` في CSSOM لا يحمل موضعًا في المصدر، لا سطرًا ولا عمودًا ولا
 * إزاحة. وأدوات المطوّر تعرضه لأنها تقرأ نصّ الورقة عبر بروتوكول التنقيح،
 * وهو ليس متاحًا لإضافة محتوى. فيُعرض ما يُعرف — الورقة — ولا يُختلق رقم.
 * مسجَّل في `Docs/Engineering.md §6`، ويُصحَّح الملفّ في المرحلة 26أ.
 */
function originText(source: SheetSource): string | null {
  if (source.kind === 'style') return source.label
  if (source.kind === 'link' || source.kind === 'imported') return basename(source.href)
  return source.on === 'shadow' ? 'ورقة مُنشَأة (ظلّ)' : 'ورقة مُنشَأة'
}

/** آخر مقطع من المسار — الاسم وحده يكفي للتعرّف، والمسار الكامل يفيض. */
function basename(href: string): string {
  const clean = href.split(/[?#]/)[0] ?? href
  const last = clean.split('/').filter(Boolean).pop()
  return last || href
}
