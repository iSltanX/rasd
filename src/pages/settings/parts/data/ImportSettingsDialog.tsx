/**
 * «استورد الإعدادات» — `data / import-settings` (`292:2584`): ما قُبل وما أُسقط ولماذا، قبل الحفظ.
 *
 * الخطّة مبنيّة قبل الفتح (`planSettingsImport`) ولم يُكتب منها شيء؛ «احفظ المقبول» يدمجها على الحالة
 * القائمة وقت الكتابة (`applySettingsImport`) في طابور الإعدادات. والملفّ الذي لا يُستورد أصلًا يُعرض هنا
 * خطأً بسببه، والإعدادات كما هي.
 */
import { useState } from 'preact/hooks'

import { Banner, Button, Chip } from '@/ui/components'
import { cx } from '@/ui/cx'

import {
  count,
  dropReasonText,
  importWarnings,
  settingLabel,
  settingValueText,
} from '../../data-context'

import styles from './data.module.css'
import { DataDialog, Row, sheet } from './DataDialog'

import type { Result } from '@/shared/result'
import type { Settings } from '@/shared/settings'
import type { SettingsFileFailure, SettingsImportPlan } from '@/shared/settings/transfer'
import type { JSX } from 'preact'

export interface ImportSettingsDialogProps {
  readonly fileName: string
  /** الخطّة، أو سبب رفض الملفّ كلّه، أو `unreadable` حين تعذّرت قراءة الإعدادات الحالية. */
  readonly plan: SettingsImportPlan | SettingsFileFailure | 'unreadable'
  readonly onSave: (plan: SettingsImportPlan) => Promise<Result<Settings>>
  readonly onClose: () => void
  readonly onSaved: (accepted: number) => void
}

/** ما يُرسم من «ما أُسقط» — ملفٌّ بآلاف المفاتيح المجهولة لا يرسم آلاف الصفوف (المراجعة المستقلّة). */
const MAX_DROPPED_ROWS = 50

const REFUSED: Record<SettingsFileFailure | 'unreadable', { title: string; text: string }> = {
  'not-json': {
    title: 'الملفّ ليس JSON صالحًا',
    text: 'لم يُقرأ منه شيء، والإعدادات كما هي.',
  },
  'not-settings': {
    title: 'الملفّ ليس ملفّ إعدادات رصد',
    text: 'اختر ملفًّا صدّره رصد من «صدّر الإعدادات». الإعدادات كما هي.',
  },
  newer: {
    title: 'الملفّ من إصدارٍ أحدث من رصد',
    text: 'حدّث رصد ثمّ أعد المحاولة. الإعدادات كما هي.',
  },
  'too-large': {
    title: 'الملفّ أكبر من ملفّ إعدادات',
    text: 'ملفّ الإعدادات بضعة كيلوبايتات، وهذا أكبر بكثير — لم يُقرأ منه شيء، والإعدادات كما هي.',
  },
  unreadable: {
    title: 'تعذّرت قراءة الإعدادات الحالية',
    text: 'لا يُدمج ملفٌّ فوق إعداداتٍ لم تُقرأ. أعد المحاولة بعد قليل.',
  },
}

export function ImportSettingsDialog({
  fileName,
  plan,
  onSave,
  onClose,
  onSaved,
}: ImportSettingsDialogProps): JSX.Element {
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  if (typeof plan === 'string') {
    const refused = REFUSED[plan]
    return (
      <DataDialog
        id="import-settings"
        phase="refused"
        title="استيراد الإعدادات"
        subtitle={fileName}
        onClose={onClose}
        actions={
          <Button variant="secondary" data-rasd-cancel="" onClick={onClose}>
            أغلق
          </Button>
        }
      >
        <div class={styles.failure} role="alert" data-failure={plan}>
          <p class={cx(styles.failureTitle, 't-arabic-ui-m-strong')}>{refused.title}</p>
          <p class={cx(styles.failureText, 't-arabic-ui-s')}>{refused.text}</p>
        </div>
      </DataDialog>
    )
  }

  const save = () => {
    setSaving(true)
    setFailed(false)
    void onSave(plan).then((result) => {
      setSaving(false)
      if (result.ok) onSaved(plan.accepted.length)
      else setFailed(true)
    })
  }

  const nothing = plan.accepted.length === 0
  const warnings = importWarnings(plan.changes)
  const shown = plan.dropped.slice(0, MAX_DROPPED_ROWS)
  const hidden = plan.dropped.length - shown.length
  return (
    <DataDialog
      id="import-settings"
      phase="review"
      title="استيراد الإعدادات"
      subtitle="راجع ما سيتغيّر قبل الحفظ"
      busy={saving}
      onClose={onClose}
      actions={
        <>
          <Button variant="secondary" data-rasd-cancel="" onClick={onClose}>
            ألغِ
          </Button>
          <Button
            variant="primary"
            state={nothing || saving ? 'disabled' : 'default'}
            onClick={save}
          >
            احفظ المقبول
          </Button>
        </>
      }
    >
      <div class={sheet.group}>
        <p class={cx(sheet.groupLabel, 't-arabic-label-s')}>النتيجة</p>
        <div class={sheet.summary}>
          <Row label="قُبل">{count(plan.accepted.length, 'settings')}</Row>
          <Row label="أُسقط">{count(plan.dropped.length, 'settings')}</Row>
        </div>
      </div>
      {warnings.map((w) => (
        <Banner tone={w.tone} key={w.text}>
          {w.text}
        </Banner>
      ))}
      {plan.changes.length > 0 ? (
        <div class={sheet.group}>
          <p class={cx(sheet.groupLabel, 't-arabic-label-s')}>ما سيتغيّر</p>
          <div class={sheet.summary} data-import-changes={plan.changes.length}>
            {plan.changes.map((c) => (
              <Row label={settingLabel(c.path)} key={c.path}>
                {`${settingValueText(c.path, c.from)} ← ${settingValueText(c.path, c.to)}`}
              </Row>
            ))}
          </div>
        </div>
      ) : null}
      {plan.dropped.length > 0 ? (
        <div class={sheet.group}>
          <p class={cx(sheet.groupLabel, 't-arabic-label-s')}>ما أُسقط ولماذا</p>
          <div class={sheet.summary} data-import-dropped={plan.dropped.length}>
            {shown.map((d, i) => (
              <div class={styles.dropped} key={`${d.path}-${i}`} data-dropped-row="">
                <div class={styles.optionText}>
                  <p class={cx(styles.optionTitle, 't-arabic-ui-s-strong')}>
                    <bdi>{settingLabel(d.path)}</bdi>
                  </p>
                  <p class={cx(styles.optionHint, 't-arabic-ui-xs')}>{dropReasonText(d)}</p>
                </div>
                <Chip tone="warning">أُسقط</Chip>
              </div>
            ))}
          </div>
          {hidden > 0 ? (
            <p class={sheet.note}>{`وغيرها ${count(hidden, 'settings')} أُسقطت لأسبابٍ مثلها.`}</p>
          ) : null}
        </div>
      ) : null}
      {nothing ? <p class={sheet.note}>لا شيء في الملفّ يُقبل — لن يتغيّر شيء.</p> : null}
      {!nothing && plan.changes.length === 0 ? (
        <p class={sheet.note}>ما قُبل يطابق إعداداتك الحالية — لن يتغيّر شيء.</p>
      ) : null}
      {failed ? (
        <p class={sheet.error} role="alert">
          تعذّر حفظ الإعدادات. لم يتغيّر شيء، والقيم السابقة باقية.
        </p>
      ) : null}
    </DataDialog>
  )
}
