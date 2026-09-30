/**
 * «أعد ضبط الإعدادات» — `data / reset-confirm` (`292:2765`).
 *
 * **يسمّي ما سيعود ويسأل عن القائمة** (`STAGES/07` المهمّة 6، الصفّ 118): الأقسام الستّة بأسمائها، و«أبقِ
 * قائمة المواقع المستثناة» محدَّدٌ ابتداءً — فمحوها قرارٌ بإلغاء التحديد لا أثرٌ جانبي لزرّ. وجولة التعريف و«ما
 * الجديد» لا تُذكران لأنهما لا تُمسّان (`resetSettings`).
 */
import { useState } from 'preact/hooks'

import { countText } from '@/shared/bidi/numerals'
import { Button, Checkbox } from '@/ui/components'
import { cx } from '@/ui/cx'

import { FORMS } from '../../data-context'

import styles from './data.module.css'
import { DataDialog, sheet } from './DataDialog'

import type { Result } from '@/shared/result'
import type { ResetOptions, Settings } from '@/shared/settings'
import type { JSX } from 'preact'

export interface ResetDialogProps {
  readonly sites: number
  readonly onReset: (options: ResetOptions) => Promise<Result<Settings>>
  readonly onClose: () => void
  readonly onDone: () => void
}

export function ResetDialog({ sites, onReset, onClose, onDone }: ResetDialogProps): JSX.Element {
  const [keep, setKeep] = useState(true)
  const [working, setWorking] = useState(false)
  const [failed, setFailed] = useState(false)

  const confirm = () => {
    setWorking(true)
    setFailed(false)
    void onReset({ keepExcludedSites: keep }).then((result) => {
      setWorking(false)
      if (result.ok) onDone()
      else setFailed(true)
    })
  }

  const hint =
    sites === 0
      ? 'القائمة فارغة الآن.'
      : `${countText(sites, FORMS.sites)}. حذفها يعيد رصد إلى العمل فيها.`

  return (
    <DataDialog
      id="reset"
      phase="confirm"
      title="إعادة ضبط الإعدادات"
      subtitle="المكتبة لا تُمسّ"
      busy={working}
      onClose={onClose}
      actions={
        <>
          <Button variant="secondary" data-rasd-cancel="" onClick={onClose}>
            ألغِ
          </Button>
          <Button variant="danger" state={working ? 'disabled' : 'default'} onClick={confirm}>
            أعد الضبط
          </Button>
        </>
      }
    >
      <p class={cx(styles.lead, 't-arabic-ui-s')}>
        تعود هذه الإعدادات إلى قيمها الأولى: التصوير، والتعليقات، والألوان، والمظهر، وحروف الأدوات،
        والخصوصية.
      </p>
      <div class={styles.option}>
        <div class={styles.optionText}>
          <p class={cx(styles.optionTitle, 't-arabic-ui-s-strong')}>أبقِ قائمة المواقع المستثناة</p>
          <p class={cx(styles.optionHint, 't-arabic-ui-xs')}>{hint}</p>
        </div>
        <Checkbox
          checked={keep ? 'on' : 'off'}
          onChange={setKeep}
          aria-label="أبقِ قائمة المواقع المستثناة"
        />
      </div>
      {failed ? (
        <p class={sheet.error} role="alert">
          تعذّرت إعادة الضبط. لم يتغيّر شيء.
        </p>
      ) : null}
    </DataDialog>
  )
}
