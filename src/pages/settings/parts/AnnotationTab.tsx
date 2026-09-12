/**
 * تبويب التعليقات — `§12.2`: اللون الافتراضي، سماكة الخط، حجم النص، شكل
 * الترقيم.
 *
 * تسميات الألوان والأشكال منقولة حرفًا بحرف من `pages/editor/parts/StyleBar.tsx`
 * (المرحلة 15) — نفس الثوابت، مصدرا عرضٍ مختلفان لعقد بيانات واحد.
 */
import { useState } from 'preact/hooks'

import { formatUnit } from '@/shared/bidi'
import { ANNOTATION_COLORS, type Settings } from '@/shared/settings'
import { Banner } from '@/ui/components/Banner/Banner'
import {
  SegmentedControl,
  type SegmentedOption,
} from '@/ui/components/SegmentedControl/SegmentedControl'

import styles from './SettingsTab.module.css'

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

const SHAPE_OPTIONS: readonly SegmentedOption[] = [
  { value: 'circle', label: 'دائرة' },
  { value: 'square', label: 'مربّع' },
  { value: 'pin', label: 'دبّوس' },
]

/** `token/path/solid` → `--rasd-token-path-solid` (`public/assets/tokens.css`). */
const tokenVar = (token: string) => `var(--rasd-${token.replaceAll('/', '-')})`

export interface AnnotationTabProps {
  settings: Settings
  onSave: (patch: Partial<Settings['annotation']>) => Promise<Result<Settings>>
}

export function AnnotationTab({ settings, onSave }: AnnotationTabProps) {
  const [failed, setFailed] = useState(false)
  const { annotation } = settings

  const save = (patch: Partial<Settings['annotation']>) => {
    void onSave(patch).then((result) => setFailed(!result.ok))
  }

  const shapeIndex = Math.max(
    0,
    SHAPE_OPTIONS.findIndex((o) => o.value === annotation.pinShape),
  )

  return (
    <section class={styles.tab}>
      {failed ? (
        <Banner tone="danger">تعذّر حفظ الإعداد — أُعيد المعروض إلى آخر قيمة محفوظة.</Banner>
      ) : null}

      <div class={styles.row}>
        <span class={styles.rowLabel} id="annotation-color-label">
          اللون الافتراضي
        </span>
        <div class={styles.rowControl} role="group" aria-labelledby="annotation-color-label">
          {ANNOTATION_COLORS.map((token) => (
            <button
              key={token}
              type="button"
              class={styles.swatch}
              aria-label={COLOR_LABEL[token]}
              aria-pressed={annotation.color === token}
              style={{ background: tokenVar(token) }}
              onClick={() => save({ color: token })}
            />
          ))}
        </div>
      </div>

      <div class={styles.row}>
        <span class={styles.rowLabel}>سماكة الخط</span>
        <div class={styles.rowControl}>
          <input
            type="range"
            min={1}
            max={24}
            step={1}
            value={annotation.strokeWidth}
            aria-label="سماكة خط التعليق"
            onInput={(e) => save({ strokeWidth: Number(e.currentTarget.value) })}
          />
          <span>{formatUnit(annotation.strokeWidth)}</span>
        </div>
      </div>

      <div class={styles.row}>
        <span class={styles.rowLabel}>حجم النص</span>
        <div class={styles.rowControl}>
          <input
            type="range"
            min={10}
            max={72}
            step={1}
            value={annotation.fontSize}
            aria-label="حجم نص التعليق"
            onInput={(e) => save({ fontSize: Number(e.currentTarget.value) })}
          />
          <span>{formatUnit(annotation.fontSize)}</span>
        </div>
      </div>

      <div class={styles.row}>
        <span class={styles.rowLabel}>شكل الترقيم</span>
        <SegmentedControl
          options={SHAPE_OPTIONS}
          selected={shapeIndex}
          onChange={(i) =>
            save({ pinShape: SHAPE_OPTIONS[i]?.value as Settings['annotation']['pinShape'] })
          }
          aria-label="شكل دبّوس الترقيم"
        />
      </div>
    </section>
  )
}
