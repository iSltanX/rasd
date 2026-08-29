/**
 * معاينة طبقة الالتقاط — أداة تطوير داخلية، مستبعَدة من بناء الإنتاج.
 *
 * غرضها واحد: مقارنة `AreaSelect` بإطار Figma `capture / area-select`
 * (`59:2`) بصريًا، وهو فحص تفرضه المرحلة صراحةً. تُعيد إنتاج هندسة الإطار
 * بالضبط — مسرح 1440×900 وتحديد عند (596, 124) بمقاس 768×336 — كي تكون
 * المقارنة على القيم نفسها لا على قيم مشابهة.
 *
 * الطبقة في المنتج تعيش في جذر ظلّ مغلق فوق صفحة طرف ثالث؛ هنا تُعرَض في
 * مستند عادي بورقة التوكنز المكافئة. البدائيّات نفسها والفئات نفسها.
 */

import { describeRatio, HANDLES, handlePoint } from '@/modules/capture/selection'
import { viewportRect } from '@/shared/geometry'
import { AreaSelect, Countdown, type HandleSpot } from '@/ui/overlay/AreaSelect'

import type { JSX } from 'preact'

/** هندسة `capture / area-select` كما قِيست من الملفّ. */
const STAGE = viewportRect(0, 0, 1440, 900)
const SELECTION = viewportRect(596, 124, 768, 336)

const HINTS = [
  { label: 'إلغاء', key: 'esc' },
  { label: 'التقط', key: '↵' },
  { label: 'من المركز', key: '⌥' },
  { label: 'ثبّت النسبة', key: '⇧' },
] as const

function MockPage(): JSX.Element {
  return (
    <div class="mock">
      <h1>مجلة الطيف</h1>
      <p>
        صفحة مضيفة وهمية — غرضها إظهار التعتيم الرباعي فوق محتوى حقيقي، لا محاكاة تصميم بعينه.
        التحديد أدناه بالهندسة نفسها التي في ملفّ Figma.
      </p>
      <div class="band" />
      <p>النصّ تحت التعتيم يجب أن يبقى مقروءًا بالكاد — وهذا ما يفصل تعتيمًا نافعًا عن حجب كامل.</p>
    </div>
  )
}

function Stage({ label, children }: { label: string; children: JSX.Element }): JSX.Element {
  return (
    <figure style={{ margin: 0, marginBlockEnd: '32px' }}>
      <figcaption
        style={{
          font: '13px/1.6 system-ui, sans-serif',
          color: 'var(--rasd-text-tertiary)',
          padding: '8px 4px',
        }}
      >
        {label}
      </figcaption>
      {/*
       * الصفحة المضيفة والطبقة **شقيقتان** لا متداخلتان: `.rasd-ov-layer`
       * تحمل `all: initial` فتمحو أنماط أي محتوى بداخلها. هكذا هي في
       * المنتج أيضًا — الطبقة فوق الصفحة لا حولها.
       */}
      <div class="stage">
        <MockPage />
        <div class="rasd-ov-layer">{children}</div>
      </div>
    </figure>
  )
}

export function CapturePreview(): JSX.Element {
  const handles: HandleSpot[] = HANDLES.map((id) => {
    const p = handlePoint(SELECTION, id)
    return { id, x: p.x, y: p.y }
  })

  return (
    <>
      <Stage label="capture / area-select — تحديد قائم (مرحلة ready)">
        <AreaSelect
          rect={SELECTION}
          bounds={STAGE}
          ratioLabel={describeRatio(SELECTION)}
          handles={handles}
          hints={HINTS}
        />
      </Stage>

      <Stage label="capture / area-select — أثناء السحب (بلا مقابض)">
        <AreaSelect
          rect={viewportRect(300, 200, 420, 240)}
          bounds={STAGE}
          ratioLabel={describeRatio(viewportRect(300, 200, 420, 240))}
          hints={HINTS}
        />
      </Stage>

      <Stage label="capture / area-select — قبل أوّل سحب (تعتيم كامل)">
        <AreaSelect rect={null} bounds={STAGE} hints={HINTS} />
      </Stage>

      <Stage label="الالتقاط المؤجَّل — العدّاد (خامل للمؤشِّر)">
        <Countdown seconds={3} origin={{ x: 720, y: 450 }} />
      </Stage>
    </>
  )
}
