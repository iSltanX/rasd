/**
 * إشعارات الأدوات فوق الصفحة — ما يقوله رصد للمستخدم بعد فعلٍ داخل الصفحة: حُفظت اللقطة،
 * نُسخ اللون، أُغلقت الأداة، تعذّر شيء. إطاراتها في `Docs/Design.md` §5 (`capture / success`
 * و`inspect / cancelled` و`colors / copied` وأخواتها).
 *
 * **قبلها كان الفشل صامتًا:** التقاطٌ تعذّر، أو حافظةٌ رفضت، يذهب إلى `console.warn` وحده —
 * والمستخدم يرى أداةً أُغلقت أو لم تُغلق بلا سبب. والنجاح بلا أثر كذلك.
 *
 * **مكانٌ واحد وإشعارٌ واحد:** الجديد يحلّ محلّ القديم ويُعيد مهلته، فلا تتكدّس إشعارات
 * فوق صفحة المستخدم. النصوص هنا دوالّ محضة كي تُختبَر بلا طبقة ولا متصفّح.
 */

import { signal, type ReadonlySignal } from '@preact/signals'

import { countText, formatDimensions, isolate, type CountForms } from '@/shared/bidi'

import type { Binding } from './shortcuts'
import type { Mode, ToolShortcutMode } from '@/shared/modes'
import type { CaptureKind } from '@/shared/storage/schema'
import type { OverlayNotice } from '@/ui/overlay/Notice'

/** كم يبقى الإشعار: النجاح والإعلام يمرّان، والخطر يبقى أطول ليُقرأ سببه. */
export const NOTICE_MS: Readonly<Record<OverlayNotice['tone'], number>> = {
  success: 4000,
  info: 4000,
  danger: 8000,
}

export interface NoticeCenter {
  readonly current: ReadonlySignal<OverlayNotice | null>
  show(notice: OverlayNotice): void
  dismiss(): void
}

interface Clock {
  setTimeout(run: () => void, ms: number): unknown
  clearTimeout(handle: unknown): void
}

const realClock: Clock = {
  setTimeout: (run, ms) => globalThis.setTimeout(run, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
}

export function createNoticeCenter(clock: Clock = realClock): NoticeCenter {
  const current = signal<OverlayNotice | null>(null)
  let timer: unknown = null
  const stop = () => {
    if (timer !== null) clock.clearTimeout(timer)
    timer = null
  }
  return {
    current,
    show(notice) {
      stop()
      current.value = notice
      timer = clock.setTimeout(() => {
        timer = null
        current.value = null
      }, NOTICE_MS[notice.tone])
    },
    dismiss() {
      stop()
      current.value = null
    },
  }
}

// ── النصوص ──────────────────────────────────────────────────────────

const COLOUR_FORMS: CountForms = {
  one: 'لون واحد',
  two: 'لونان',
  many: 'ألوان',
  accusative: 'لونًا',
  singular: 'لون',
}

/** `capture / success` و`capture / element-success` (`302:332` · `302:408`). */
export function captureSaved(
  kind: CaptureKind,
  width: number,
  height: number,
  open: () => void,
): OverlayNotice {
  return {
    tone: 'success',
    title: kind === 'element' ? 'حُفظ العنصر' : 'حُفظت اللقطة',
    // المقاس قياسٌ لا عدّ — غربيّ ومعزول كي لا يقلب السياق العربي طرفيه حول «×».
    detail: `في المكتبة، بمقاس ${isolate(formatDimensions(width, height))}`,
    action: { label: 'افتح', run: open },
  }
}

export function captureFailed(reason: string): OverlayNotice {
  return { tone: 'danger', title: 'تعذّر الالتقاط', detail: reason }
}

/** `capture / clipboard-denied` (`302:584`) — السبب من `copyCaptureToClipboard` يقول إن اللقطة محفوظة. */
export function captureNotCopied(reason: string): OverlayNotice {
  return { tone: 'danger', title: 'لم تُنسخ اللقطة', detail: reason }
}

/** نسخ قيمة تقنية إلى الحافظة — `colors / copied` (`303:22111`) ومحدِّد العنصر. */
export function valueCopied(what: 'اللون' | 'المحدِّد', value: string): OverlayNotice {
  return { tone: 'success', title: `نُسخ ${what}`, detail: `${isolate(value)} في الحافظة` }
}

export function valueCopyFailed(what: 'اللون' | 'المحدِّد'): OverlayNotice {
  return {
    tone: 'danger',
    title: `تعذّر نسخ ${what}`,
    detail: 'منع المتصفّح الكتابة إلى الحافظة في هذه الصفحة.',
  }
}

export function colourSaved(open: () => void): OverlayNotice {
  return {
    tone: 'success',
    title: 'حُفظ اللون',
    detail: 'في المكتبة',
    action: { label: 'افتح', run: open },
  }
}

/** `colors / palette-saved` (`303:22197`): «٨ ألوان في المكتبة». */
export function paletteSaved(count: number, open: () => void): OverlayNotice {
  return {
    tone: 'success',
    title: 'حُفظت اللوحة',
    detail: `${countText(count, COLOUR_FORMS)} في المكتبة`,
    action: { label: 'افتح', run: open },
  }
}

export function saveFailed(
  what: 'اللون' | 'اللوحة' | 'المناطق المستثناة',
  reason: string,
): OverlayNotice {
  return { tone: 'danger', title: `تعذّر حفظ ${what}`, detail: reason }
}

/** تصديرات المطوّر ملفّات تُنزَّل (الوحدة 19.2) — لا «نُسخ»: لا شيء في الحافظة. */
export function fileSaved(filename: string): OverlayNotice {
  return { tone: 'success', title: 'نُزّل الملفّ', detail: isolate(filename) }
}

export const FILE_FAILED: OverlayNotice = {
  tone: 'danger',
  title: 'تعذّر تنزيل الملفّ',
  detail: 'منعت هذه الصفحة إنشاء التنزيل.',
}

/** `colors / error` (`303:22356`) — السبب من القطّارة نفسها. «أبلغ» المرسومة تنتظر `STAGES/13`. */
export function colourReadFailed(reason: string): OverlayNotice {
  return { tone: 'danger', title: 'تعذّرت قراءة اللون', detail: reason }
}

/** `⌥⇧I` من الربط الحيّ للأداة — كما تعرضه صفحة الاختصارات، ويتبع تغييره منها. */
export function toolKeyLabel(bindings: readonly Binding[], tool: ToolShortcutMode): string | null {
  const b = bindings.find(
    (x) => x.action.kind === 'mode' && x.action.mode === tool && x.alt && x.shift,
  )
  return b ? `⌥⇧${b.code.replace(/^(Key|Digit)/u, '')}` : null
}

const EXIT: Partial<Record<Mode, { readonly title: string; readonly tool?: ToolShortcutMode }>> = {
  // `capture / cancelled` (`302:371`).
  area: { title: 'أُلغي الالتقاط' },
  element: { title: 'أُلغي الالتقاط' },
  // `inspect / cancelled` (`303:20779`).
  inspect: { title: 'خرجت من الفحص', tool: 'inspect' },
  // `colors / cancelled` (`303:22316`).
  colour: { title: 'أُغلقت القطّارة', tool: 'colour' },
  /*
   * `measure / cancelled` (`303:222`) يقول «مُسح التحديد · اختر عنصرًا لتبدأ من جديد» — لكن
   * `Esc` في المحرّك يُخرج من الأداة كلّها لا يمسح التحديد وحده، فالنصّ يقول ما يحدث.
   */
  measure: { title: 'خرجت من القياس', tool: 'measure' },
}

/**
 * ما يُقال حين يُغلق `Esc` أداة. الالتقاط: لم يُحفظ شيء. وبقية الأدوات: كيف تعود — بمفتاحها
 * الحيّ لا بحرف مكتوب، فمن غيّره من الإعدادات يرى حرفه هو.
 */
export function exitNotice(mode: Mode, bindings: readonly Binding[]): OverlayNotice | null {
  const exit = EXIT[mode]
  if (!exit) return null
  if (!exit.tool) return { tone: 'info', title: exit.title, detail: 'لم تُحفظ لقطة.' }
  const key = toolKeyLabel(bindings, exit.tool)
  return key
    ? { tone: 'info', title: exit.title, detail: `اضغط ${isolate(key)} لتعود.` }
    : { tone: 'info', title: exit.title }
}
