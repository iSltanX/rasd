/**
 * قسم التعليقات (`settings / annotation`، `129:35`): «الرسم» و«الترقيم».
 *
 * تسميات الألوان والأشكال منقولة حرفًا بحرف من `pages/editor/parts/StyleBar.tsx` — نفس
 * الثوابت، مصدرا عرضٍ مختلفان لعقد بيانات واحد. والمقاسات قائمة درجات تحمل القيمة
 * المحفوظة دائمًا، ولو خارجها، فلا تُستبدَل قيمة المستخدم بأقرب درجة صامتًا.
 */
import { formatHuman, formatUnit } from '@/shared/bidi'
import { ANNOTATION_COLORS, type Settings } from '@/shared/settings'
import { Select } from '@/ui/components/Select/Select'
import { SettingRow } from '@/ui/components/SettingRow/SettingRow'

import { Group } from './Group'

import type { Persist } from '../persist'
import type { Result } from '@/shared/result'

const COLOR_LABEL: Readonly<Record<(typeof ANNOTATION_COLORS)[number], string>> = {
  'tool/annotate/solid': 'كهرماني',
  'tool/capture/solid': 'فيروزي',
  'tool/inspect/solid': 'بنفسجي',
  'tool/measure/solid': 'وردي',
  'tool/compare/solid': 'أزرق',
  'status/danger/solid': 'أحمر',
  'status/success/solid': 'أخضر',
}

const SHAPE_OPTIONS = [
  { value: 'circle', label: 'دائرة' },
  { value: 'square', label: 'مربّع' },
  { value: 'pin', label: 'دبّوس' },
] as const

const STROKES = [1, 2, 3, 4, 6, 8, 12]
const FONT_SIZES = [12, 14, 16, 18, 20, 24, 32]

/** درجات القائمة، ومعها القيمة المحفوظة إن لم تكن منها — مرتّبة تصاعديًّا. */
function sizeOptions(steps: readonly number[], current: number) {
  const values = steps.includes(current) ? steps : [...steps, current].sort((a, b) => a - b)
  return values.map((v) => ({ value: String(v), label: formatUnit(v) }))
}

export interface AnnotationTabProps {
  settings: Settings
  onSave: (patch: Partial<Settings['annotation']>) => Promise<Result<Settings>>
  persist: Persist
}

export function AnnotationTab({ settings, onSave, persist }: AnnotationTabProps) {
  const { annotation } = settings
  const save = (patch: Partial<Settings['annotation']>) => persist(() => onSave(patch))

  return (
    <>
      <Group title="الرسم" id="settings-drawing">
        <SettingRow
          id="annotation-color"
          label="لون التعليق الافتراضي"
          hint="يبدأ به كل سهم ومستطيل ونصّ جديد"
          divider
          control={
            <Select
              value={annotation.color}
              options={ANNOTATION_COLORS.map((token) => ({
                value: token,
                label: COLOR_LABEL[token],
              }))}
              aria-label="لون التعليق الافتراضي"
              aria-describedby="annotation-color-hint"
              onChange={(v) => save({ color: v as Settings['annotation']['color'] })}
            />
          }
        />
        <SettingRow
          id="annotation-stroke"
          label="سماكة الخطّ"
          divider
          control={
            <Select
              value={String(annotation.strokeWidth)}
              options={sizeOptions(STROKES, annotation.strokeWidth)}
              aria-label="سماكة الخطّ"
              onChange={(v) => save({ strokeWidth: Number(v) })}
            />
          }
        />
        <SettingRow
          id="annotation-font"
          label="حجم النصّ"
          control={
            <Select
              value={String(annotation.fontSize)}
              options={sizeOptions(FONT_SIZES, annotation.fontSize)}
              aria-label="حجم النصّ"
              onChange={(v) => save({ fontSize: Number(v) })}
            />
          }
        />
      </Group>

      <Group title="الترقيم" id="settings-numbering">
        <SettingRow
          id="annotation-pin"
          label="شكل دبّوس الترقيم"
          hint={`الأرقام داخل الدبّوس هندية وتبدأ من ${formatHuman(annotation.pinStart)}`}
          control={
            <Select
              value={annotation.pinShape}
              options={SHAPE_OPTIONS}
              aria-label="شكل دبّوس الترقيم"
              aria-describedby="annotation-pin-hint"
              onChange={(v) => save({ pinShape: v as Settings['annotation']['pinShape'] })}
            />
          }
        />
      </Group>
    </>
  )
}
