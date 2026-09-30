/**
 * «التقط الفرق» — `compare / diff-saved` (`291:12790`).
 *
 * يبدأ الحفظ لحظة فتحه — لا خيارات في الإطار، والنقرة على «التقط الفرق» هي القرار. ثمّ حالتان: حُفظت (ومعها
 * «افتح في المكتبة»)، أو تعذّر الحفظ بسببه. ولا تنزيل ولا صلاحية: اللقطة تُكتب في المكتبة كما تُكتب كل لقطة.
 */

import { useEffect, useRef, useState } from 'preact/hooks'

import { send } from '@/shared/messaging'
import { Banner, Button } from '@/ui/components'
import { ProgressBar } from '@/ui/components/ProgressBar/ProgressBar'
import { cx } from '@/ui/cx'
import { Icon } from '@/ui/icons/Icon'

import sheet from '../../export/export.module.css'
import { redactedSources } from '../redaction'
import { reportMarks, type ReportOutcome } from '../report'
import { saveDiffCapture } from '../report-export'

import styles from './ReportDialog.module.css'

import type { SessionZone } from '../session-zones'
import type { RasterImage } from '@/modules/compare/diff'
import type { CaptureRecord } from '@/shared/storage/schema'
import type { JSX } from 'preact'

export interface DiffSavedDialogProps {
  readonly a: CaptureRecord
  readonly b: CaptureRecord
  readonly baseBlob: Blob
  readonly outcome: ReportOutcome & { readonly diff: RasterImage }
  readonly zones: readonly SessionZone[]
  readonly onClose: () => void
}

type Phase =
  | { readonly kind: 'saving' }
  | { readonly kind: 'saved'; readonly id: string }
  | { readonly kind: 'failed'; readonly message: string }

export function DiffSavedDialog(props: DiffSavedDialogProps): JSX.Element {
  const [phase, setPhase] = useState<Phase>({ kind: 'saving' })
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    let live = true
    void (async () => {
      // ما حُجب في مشهد اللقطتين لا يُحفظ في لقطة الفرق — اللقطة الجديدة بلا مشهد يحجبه لاحقًا.
      const sources = await redactedSources({
        aId: props.a.id,
        bId: props.b.id,
        baseBlob: props.baseBlob,
        diff: props.outcome.diff,
      })
      const saved = sources.ok
        ? await saveDiffCapture(props.a, props.b, {
            base: sources.value.base,
            width: props.b.width,
            height: props.b.height,
            diff: sources.value.diff,
            marks: reportMarks(props.outcome, props.zones),
          })
        : sources
      if (!live) return
      setPhase(
        saved.ok
          ? { kind: 'saved', id: saved.value }
          : { kind: 'failed', message: saved.error.message },
      )
    })()
    return () => {
      live = false
    }
    // الحفظ مرّة عند الفتح — النافذة تُغلق وتُفتح لحفظٍ آخر.
  }, [])

  useEffect(() => {
    closeRef.current?.focus()
  }, [phase.kind])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || phase.kind === 'saving') return
      e.preventDefault()
      props.onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [props.onClose, phase.kind])

  return (
    <div
      class={sheet.scrim}
      role="dialog"
      aria-modal="true"
      aria-labelledby="diff-saved-title"
      data-diff-saved={phase.kind}
      {...(phase.kind === 'saved' ? { 'data-diff-capture': phase.id } : {})}
    >
      <div class={sheet.modal}>
        <header class={sheet.head}>
          <button
            type="button"
            ref={closeRef}
            class={sheet.close}
            aria-label="إغلاق"
            disabled={phase.kind === 'saving'}
            onClick={props.onClose}
          >
            <Icon name="close" size="sm" />
          </button>
          <div class={sheet.headText}>
            <h2 id="diff-saved-title" class={cx(sheet.title, 't-arabic-heading-s')}>
              التقط الفرق
            </h2>
            <p class={cx(sheet.subtitle, 't-arabic-ui-xs')}>
              {`المرجع: ${props.a.title || 'اللقطة أ'} · الحالية: ${props.b.title || 'اللقطة ب'}`}
            </p>
          </div>
        </header>

        {phase.kind === 'saving' ? (
          <div class={sheet.body}>
            <ProgressBar value={50} label="جارٍ حفظ صورة الفرق" />
            <p class={sheet.note}>تمرّ من مخرج الترميز الواحد ثمّ تُكتب في المكتبة.</p>
          </div>
        ) : phase.kind === 'failed' ? (
          <>
            <div class={sheet.body}>
              <Banner tone="danger">تعذّر حفظ صورة الفرق — {phase.message}</Banner>
            </div>
            <footer class={sheet.actions}>
              <Button variant="secondary" size="l" onClick={props.onClose}>
                أغلق
              </Button>
            </footer>
          </>
        ) : (
          <>
            <div class={cx(sheet.body, styles.done)}>
              <span class={styles.doneIcon}>
                <Icon name="check" size="lg" />
              </span>
              <p class={cx(styles.doneTitle, 't-arabic-heading-xs')}>حُفظت صورة الفرق</p>
              <p class={cx(styles.doneText, 't-arabic-ui-s')}>
                أُضيفت إلى المكتبة لقطةً جديدة في المشروع نفسه.
              </p>
            </div>
            <footer class={sheet.actions}>
              <Button variant="secondary" size="l" onClick={props.onClose}>
                أغلق
              </Button>
              <Button
                variant="primary"
                size="l"
                icon="folder"
                onClick={() => void send('page/open', { page: 'library' })}
              >
                افتح في المكتبة
              </Button>
            </footer>
          </>
        )}
      </div>
    </div>
  )
}
