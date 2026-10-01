/**
 * الخطوة ٢ — الصورة (`support / image` و`support / image-empty`): إرفاق ملفّ أو لصق صورة، ثمّ القصّ والحجب والحذف.
 *
 * **المعاينة رسمٌ على قماش لا ترميز:** الصورة العاملة تُرسم كما هي، والقصّ والحجب مستطيلاتٌ فوقها. والخبز —
 * حيث يُدمَّر ما تحت الحجب في البايتات — عند الانتقال إلى المراجعة، من البوّابة الواحدة.
 *
 * **فرقٌ مقصود عن الإطار:** «التقط من جديد» و«التقط لقطة» صارتا «اختر صورة أخرى» و«أرفق ملفًّا» مع اللصق — عقد
 * القناة المشتركة يمنع التقاطًا يجريه التطبيق للبلاغ، فالصورة من اختيار المستخدم وحده.
 */
import { useEffect, useRef, useState } from 'preact/hooks'

import { deviceRect, type DeviceRect } from '@/shared/geometry'
import { Banner } from '@/ui/components/Banner/Banner'
import { Button } from '@/ui/components/Button/Button'
import { cx } from '@/ui/cx'
import { Icon } from '@/ui/icons/Icon'

import styles from './report.module.css'

import type { WorkingImage } from './image-source'
import type { JSX } from 'preact'

export type EditMode = 'redact' | 'crop'

export interface ImageStepProps {
  readonly image: WorkingImage | null
  readonly crop: DeviceRect | null
  readonly redactions: readonly DeviceRect[]
  readonly notice: string | null
  readonly onPick: (file: File) => void
  readonly onCrop: (crop: DeviceRect | null) => void
  readonly onRedactions: (rects: readonly DeviceRect[]) => void
  readonly onRemove: () => void
}

const count = new Intl.NumberFormat('ar-u-nu-arab')

/** أصغر مستطيلٍ يُعتدّ به — نقرةٌ بلا سحب لا تُنشئ حجبًا بعرض صفر. */
const MIN_SIDE = 4

export function ImageStep(props: ImageStepProps): JSX.Element {
  const input = useRef<HTMLInputElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [mode, setMode] = useState<EditMode>('redact')
  const [draft, setDraft] = useState<DeviceRect | null>(null)
  const start = useRef<{ x: number; y: number } | null>(null)

  // اللصق: صورةٌ من الحافظة بإيماءة المستخدم (⌘V) — لا قراءة للحافظة بلا لصق.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'))
      if (!file) return
      e.preventDefault()
      props.onPick(file)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [props.onPick])

  useEffect(() => {
    const el = canvas.current
    const image = props.image
    if (!el || !image) return
    el.width = image.width
    el.height = image.height
    el.getContext('2d')?.drawImage(image.bitmap, 0, 0)
  }, [props.image])

  const pickButton = (label: string, variant: 'primary' | 'secondary') => (
    <Button
      variant={variant}
      size="s"
      icon="image"
      onClick={() => input.current?.click()}
      data-rasd-autofocus={variant === 'primary' ? '' : undefined}
    >
      {label}
    </Button>
  )

  const fileInput = (
    <input
      ref={input}
      type="file"
      accept="image/png,image/jpeg,image/webp,image/gif"
      class={styles.hiddenInput}
      aria-hidden="true"
      tabIndex={-1}
      onChange={(e) => {
        const file = e.currentTarget.files?.[0]
        if (file) props.onPick(file)
        e.currentTarget.value = ''
      }}
    />
  )

  if (!props.image) {
    return (
      <div class={styles.empty} data-report-image="empty">
        {fileInput}
        <span class={styles.emptyBadge}>
          <Icon name="image" size="md" />
        </span>
        <p class={cx(styles.emptyTitle, 't-arabic-heading-s')}>لا صورة مرفقة</p>
        <p class={cx(styles.emptyText, 't-arabic-ui-s')}>
          الصورة تساعد على فهم المشكلة، وليست شرطًا للإرسال. اختر ملفًّا أو الصق صورةً هنا.
        </p>
        {props.notice ? <Banner tone="warning">{props.notice}</Banner> : null}
        <div class={styles.emptyActions}>{pickButton('أرفق ملفًّا', 'primary')}</div>
      </div>
    )
  }

  const image = props.image
  /** موضع المؤشّر بفضاء الصورة العاملة. */
  const toImage = (e: PointerEvent): { x: number; y: number } => {
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const x = ((e.clientX - box.left) / box.width) * image.width
    const y = ((e.clientY - box.top) / box.height) * image.height
    return {
      x: Math.max(0, Math.min(image.width, Math.round(x))),
      y: Math.max(0, Math.min(image.height, Math.round(y))),
    }
  }
  const rectFrom = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    deviceRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(a.x - b.x), Math.abs(a.y - b.y))
  // المسرح `dir="ltr"`: إحداثيات الصورة من يسارها مهما كان اتّجاه الواجهة، فالبداية المنطقية هي اليسار هنا.
  const pct = (r: DeviceRect) => ({
    insetInlineStart: `${(r.x / image.width) * 100}%`,
    insetBlockStart: `${(r.y / image.height) * 100}%`,
    inlineSize: `${(r.width / image.width) * 100}%`,
    blockSize: `${(r.height / image.height) * 100}%`,
  })

  return (
    <div class={styles.imageStep} data-report-image="loaded">
      {fileInput}
      <div
        class={styles.stage}
        dir="ltr"
        data-mode={mode}
        style={{ aspectRatio: `${image.width} / ${image.height}` }}
        onPointerDown={(e) => {
          ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
          start.current = toImage(e)
          setDraft(null)
        }}
        onPointerMove={(e) => {
          if (start.current) setDraft(rectFrom(start.current, toImage(e)))
        }}
        onPointerUp={(e) => {
          const from = start.current
          start.current = null
          setDraft(null)
          if (!from) return
          const rect = rectFrom(from, toImage(e))
          if (rect.width < MIN_SIDE || rect.height < MIN_SIDE) return
          if (mode === 'crop') props.onCrop(rect)
          else props.onRedactions([...props.redactions, rect])
        }}
      >
        <canvas ref={canvas} class={styles.preview} aria-label="معاينة الصورة المرفقة" role="img" />
        {props.redactions.map((r, i) => (
          <span key={i} class={styles.redaction} style={pct(r)} />
        ))}
        {props.crop ? <span class={styles.crop} style={pct(props.crop)} /> : null}
        {draft ? (
          <span class={mode === 'crop' ? styles.crop : styles.redaction} style={pct(draft)} />
        ) : null}
      </div>

      <div class={styles.tools} role="toolbar" aria-label="أدوات الصورة">
        <Button
          variant={mode === 'crop' ? 'primary' : 'secondary'}
          size="s"
          icon="capture-area"
          aria-pressed={mode === 'crop'}
          onClick={() => setMode('crop')}
        >
          قصّ
        </Button>
        <Button
          variant={mode === 'redact' ? 'primary' : 'secondary'}
          size="s"
          icon="redact"
          aria-pressed={mode === 'redact'}
          onClick={() => setMode('redact')}
        >
          احجب
        </Button>
        {pickButton('اختر صورة أخرى', 'secondary')}
        <Button variant="ghost" size="s" icon="trash" onClick={props.onRemove}>
          احذف الصورة
        </Button>
      </div>

      <p class={cx(styles.toolHint, 't-arabic-ui-xs')}>
        {mode === 'crop'
          ? 'اسحب على الصورة لتحديد الجزء الذي يُرسَل.'
          : 'اسحب على الصورة فوق ما تريد حجبه.'}{' '}
        {props.redactions.length > 0 ? (
          <>
            {`محجوب ${count.format(props.redactions.length)}.`}{' '}
            <button
              type="button"
              class={styles.inlineAction}
              onClick={() => props.onRedactions(props.redactions.slice(0, -1))}
            >
              تراجع عن آخر حجب
            </button>
          </>
        ) : null}
        {props.crop ? (
          <>
            {' '}
            <button type="button" class={styles.inlineAction} onClick={() => props.onCrop(null)}>
              ألغِ القصّ
            </button>
          </>
        ) : null}
      </p>

      {props.notice ? <Banner tone="warning">{props.notice}</Banner> : null}
      <Banner tone="warning">
        راجع الصورة قبل الإرسال. ما تحجبه يُطمس في بيانات الصورة نفسها ولا يُستعاد.
      </Banner>
    </div>
  )
}
