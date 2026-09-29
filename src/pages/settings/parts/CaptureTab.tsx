/**
 * قسم التصوير (`settings / capture`، `68:2`): مجموعتا «الالتقاط» و«بعد الالتقاط».
 *
 * **«احفظ نسخة في مجلّد التنزيلات» يُعرض «قريبًا» لا مفتاحًا.** المفتاح `saveLocation`
 * محفوظ ومقروء، لكن خطّ الالتقاط يحفظ في المكتبة وحدها ولا يقرؤه (`Docs/Engineering.md
 * §6` الصفّ 115)، ووصله بتدفّق التنزيلات في `STAGES/05`. مفتاح يُقلَب ولا يفعل شيئًا
 * ضابط صامت. والقيمة المحفوظة لا تُمسّ، فلا تنكسر إعدادات قائمة.
 */
import { formatHuman, formatPercent } from '@/shared/bidi'
import { Chip } from '@/ui/components/Chip/Chip'
import { Select } from '@/ui/components/Select/Select'
import { SettingRow } from '@/ui/components/SettingRow/SettingRow'
import { Toggle } from '@/ui/components/Toggle/Toggle'

import { Group } from './Group'

import type { Persist } from '../persist'
import type { Result } from '@/shared/result'
import type { Settings } from '@/shared/settings'

const FORMAT_OPTIONS = [
  { value: 'png', label: 'PNG' },
  { value: 'webp', label: 'WebP' },
] as const

/** درجات الجودة المقيسة في `Docs/Engineering.md §6` الصفّ 104، وقيمة مخصّصة إن حُفظت غيرها. */
const QUALITY_PRESETS: readonly { value: number; label: string }[] = [
  { value: 1, label: 'الأقصى' },
  { value: 0.92, label: 'عالية' },
  { value: 0.82, label: 'متوسّطة' },
  { value: 0.6, label: 'منخفضة' },
]

const DELAY_OPTIONS = [
  { value: '0', label: 'بلا تأجيل' },
  { value: '3', label: `${formatHuman(3)} ثوانٍ` },
  { value: '5', label: `${formatHuman(5)} ثوانٍ` },
  { value: '10', label: `${formatHuman(10)} ثوانٍ` },
] as const

export interface CaptureTabProps {
  settings: Settings
  onSave: (patch: Partial<Settings['capture']>) => Promise<Result<Settings>>
  persist: Persist
}

export function CaptureTab({ settings, onSave, persist }: CaptureTabProps) {
  const { capture } = settings
  const save = (patch: Partial<Settings['capture']>) => persist(() => onSave(patch))

  const qualityOptions = QUALITY_PRESETS.some((p) => p.value === capture.quality)
    ? QUALITY_PRESETS
    : [
        ...QUALITY_PRESETS,
        { value: capture.quality, label: `مخصّصة (${formatPercent(capture.quality)})` },
      ]

  return (
    <>
      <Group title="الالتقاط" id="settings-capture">
        <SettingRow
          id="capture-format"
          label="الصيغة الافتراضية"
          hint="الصيغة التي تُحفظ بها اللقطات الجديدة"
          divider
          control={
            <Select
              value={capture.format}
              options={FORMAT_OPTIONS}
              aria-label="الصيغة الافتراضية"
              aria-describedby="capture-format-hint"
              onChange={(v) => save({ format: v as Settings['capture']['format'] })}
            />
          }
        />
        <SettingRow
          id="capture-quality"
          label="الجودة"
          hint="تسري على WebP وحدها. PNG بلا فقد دائمًا"
          divider
          control={
            <Select
              value={String(capture.quality)}
              options={qualityOptions.map((p) => ({ value: String(p.value), label: p.label }))}
              aria-label="الجودة"
              aria-describedby="capture-quality-hint"
              onChange={(v) => save({ quality: Number(v) })}
            />
          }
        />
        <SettingRow
          id="capture-delay"
          label="مهلة قبل الالتقاط"
          hint="تمنحك وقتًا لفتح قائمة أو تمرير المؤشّر"
          control={
            <Select
              value={String(capture.delaySeconds)}
              options={DELAY_OPTIONS}
              aria-label="مهلة قبل الالتقاط"
              aria-describedby="capture-delay-hint"
              onChange={(v) =>
                save({ delaySeconds: Number(v) as Settings['capture']['delaySeconds'] })
              }
            />
          }
        />
      </Group>

      <Group title="بعد الالتقاط" id="settings-after-capture">
        <SettingRow
          id="capture-open-editor"
          label="افتح المحرّر بعد كل التقاط"
          hint="تنتقل مباشرةً إلى التعليق"
          divider
          control={
            <Toggle
              on={capture.openEditorAfter}
              onChange={(on) => save({ openEditorAfter: on })}
              aria-label="افتح المحرّر بعد كل التقاط"
            />
          }
        />
        <SettingRow
          id="capture-clipboard"
          label="انسخ اللقطة إلى الحافظة"
          hint="تُنسخ الصورة مع حفظها في المكتبة"
          divider
          control={
            <Toggle
              on={capture.copyToClipboard}
              onChange={(on) => save({ copyToClipboard: on })}
              aria-label="انسخ اللقطة إلى الحافظة"
            />
          }
        />
        <SettingRow
          id="capture-downloads"
          label="احفظ نسخة في مجلّد التنزيلات"
          hint="تصل مع تدفّق التنزيلات قريبًا. اللقطة تُحفظ في المكتبة وحدها اليوم."
          control={<Chip tone="neutral">قريبًا</Chip>}
        />
      </Group>
    </>
  )
}
