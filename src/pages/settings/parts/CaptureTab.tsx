/**
 * قسم التصوير (`settings / capture`، `68:2`): مجموعتا «الالتقاط» و«بعد الالتقاط».
 *
 * **«احفظ نسخة في مجلّد التنزيلات» مفتاحٌ حقيقي** يُغيّر `saveLocation`، وخدمة الالتقاط
 * تقرؤه وتنسخ كل لقطة محفوظة إلى مجلّد «رصد» داخل التنزيلات (`background/capture-mirror.ts`).
 * وصلاحية `downloads` **اختيارية**: تُطلَب من القلب إلى التشغيل نفسه، **متزامنًا من معالج
 * الحدث** — `await` واحدة قبل `chrome.permissions.request` تكسر سلسلة إيماءة المستخدم
 * فترمي (نمط `ExportFlow`). وإن رُفضت لا تُحفَظ القيمة: مفتاحٌ مفعَّل بلا صلاحية يعِد بنسخة
 * لن تصل. والإطفاء لا يسحب الصلاحية — التصدير يستعملها.
 *
 * وإن كانت القيمة المحفوظة «مع التنزيلات» والصلاحية سُحبت لاحقًا (من `chrome://extensions`
 * مثلًا) يُقال ذلك تحت المفتاح: الالتقاط لا يفشل، لكن النسخة لا تصل. والقيمة لا تُمسّ.
 */
import { useEffect, useState } from 'preact/hooks'

import { formatHuman, formatPercent } from '@/shared/bidi'
import { hasPermission, requestPermission } from '@/shared/permissions'
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

/** تلميح المفتاح بحسب الحالة — الرفض والفقدان يسمّيان ما يحدث لا «تعذّر». */
const DOWNLOADS_HINT = {
  normal: 'نسخة من كل لقطة في مجلّد التنزيلات، داخل مجلّد «رصد».',
  refused: 'رُفضت صلاحية التنزيلات — تبقى اللقطات في المكتبة وحدها.',
  missing: 'صلاحية التنزيلات غير ممنوحة — لا تُحفظ نسخة حتى تمنحها. أطفئ المفتاح ثم أعد تشغيله.',
} as const

export function CaptureTab({ settings, onSave, persist }: CaptureTabProps) {
  const { capture } = settings
  const save = (patch: Partial<Settings['capture']>) => persist(() => onSave(patch))

  const mirrorOn = capture.saveLocation === 'library-and-downloads'
  /** `null` = لم يُعرف بعد. يُستطلَع عند التركيب، ويُحدَّث بعد منحٍ ناجح. */
  const [downloadsGranted, setDownloadsGranted] = useState<boolean | null>(null)
  /**
   * عدّاد الرفض لا منطقي: المفتاح الأصلي (`input`) يقلب نفسه عند النقرة، ولا يعود مطفأً
   * إلا بإعادة رسم. وقيمةٌ منطقية تبقى `true` بعد رفضٍ أوّل فلا تُعيد الرسم عند الرفض الثاني.
   */
  const [refusals, setRefusals] = useState(0)

  useEffect(() => {
    let alive = true
    void hasPermission(['downloads']).then((granted) => {
      if (alive) setDownloadsGranted(granted)
    })
    return () => {
      alive = false
    }
  }, [])

  /**
   * **التشغيل يطلب الصلاحية أوّلًا وبلا `await` قبله.** الحفظ بعد المنح فقط.
   * والإطفاء حفظٌ مباشر: لا سؤال ولا سحب.
   */
  const onMirrorChange = (on: boolean) => {
    if (!on) {
      setRefusals(0)
      save({ saveLocation: 'library' })
      return
    }
    void requestPermission(['downloads']).then((outcome) => {
      if (outcome === 'granted') {
        setRefusals(0)
        setDownloadsGranted(true)
        save({ saveLocation: 'library-and-downloads' })
      } else {
        // `denied` و`error` سواء هنا: لا قيمة تُحفَظ. والعطل التقني ليس قرار المستخدم،
        // لكنّ النتيجة له واحدة — اللقطات في المكتبة وحدها.
        setRefusals((n) => n + 1)
      }
    })
  }

  const downloadsHint =
    refusals > 0
      ? DOWNLOADS_HINT.refused
      : mirrorOn && downloadsGranted === false
        ? DOWNLOADS_HINT.missing
        : DOWNLOADS_HINT.normal

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
          // `role="status"`: الرفض يظهر بعد جواب المتصفّح لا لحظة النقرة، فيُعلَن لقارئ الشاشة.
          hint={<span role="status">{downloadsHint}</span>}
          control={
            <Toggle
              on={mirrorOn}
              onChange={onMirrorChange}
              aria-label="احفظ نسخة في مجلّد التنزيلات"
            />
          }
        />
      </Group>
    </>
  )
}
