/**
 * «استعد من نسخة احتياطية» — `data / restore-preview` · `restore-error` (`292:2245` · `292:2416`).
 *
 * **الفحص كلّه قبل المعاينة:** الحاوية والبيان وكل سجلّ وCRC كل صورة (`readBackup`) — فالمعاينة لا تظهر
 * إلا لملفٍّ سيُستعاد كما هو، و«استعد» لا يكتشف عطبًا بعد أن وعد. والكتابة معاملةٌ واحدة: تنجح كلّها أو
 * لا يتغيّر في المكتبة شيء، وهذا ما يقوله كل سطر خطأ هنا.
 *
 * **فرقان عن الإطار مكتوبان:** «أبلغ عن المشكلة» لا يظهر — الإبلاغ لم يُبنَ بعد، وزرٌّ بلا محرّك ممنوع
 * (`AGENTS.md` §4)؛ و«أعد المحاولة» لا يظهر إلا لرفضٍ من القاعدة — إعادة قراءة ملفٍّ تالف تعطي الجواب نفسه،
 * والطريق «اختر ملفًّا آخر».
 */
import { useEffect, useRef, useState } from 'preact/hooks'

import {
  readBackup,
  restoreBackup,
  type BackupFailure,
  type RestorePlan,
} from '@/modules/backup/backup'
import { toRasdError } from '@/shared/result'
import { requestPersistence } from '@/shared/storage/persistence'
import { Banner, Button, ProgressBar, Spinner } from '@/ui/components'
import { cx } from '@/ui/cx'
import { Icon } from '@/ui/icons/Icon'
import { TechnicalValue } from '@/ui/TechnicalValue'

import { backupDateText, count, pair, restoreWarnings, settingValueText } from '../../data-context'

import styles from './data.module.css'
import { DataDialog, Row, sheet } from './DataDialog'

import type { MergeReport } from '@/shared/storage/library'
import type { JSX } from 'preact'

type Phase =
  | { readonly kind: 'checking'; readonly done: number; readonly total: number }
  | { readonly kind: 'preview'; readonly plan: RestorePlan }
  | { readonly kind: 'restoring' }
  | { readonly kind: 'done'; readonly report: MergeReport }
  | { readonly kind: 'failed'; readonly failure: BackupFailure; readonly plan: RestorePlan | null }

export interface RestoreDialogProps {
  readonly file: File
  /** مدّة الاحتفاظ الحالية بالأيّام — ما سيكنسه الحذف الدوري من لقطات الملفّ يُقال في المعاينة. */
  readonly retention: number
  readonly onClose: () => void
  /** يفتح منتقي الملفّات ثانيةً — من نقرة «اختر ملفًّا آخر» نفسها. */
  readonly onPickAnother: () => void
  readonly onRestored: () => void
}

const FAILURE: Record<BackupFailure['kind'], { readonly title: string; readonly text: string }> = {
  invalid: {
    title: 'الملفّ ليس نسخة احتياطية صالحة',
    text: 'لم يتعرّف رصد على بنية الملفّ، فلم يستعد منه شيئًا. اختر ملفًّا أنشأه رصد.',
  },
  newer: {
    title: 'النسخة من إصدارٍ أحدث من رصد',
    text: 'حدّث رصد ثمّ أعد المحاولة. لم يتغيّر شيء في مكتبتك.',
  },
  damaged: {
    title: 'الملفّ تالف',
    text: 'تغيّرت بايتات بعض الصور منذ أُخذت النسخة — ربما انقطع نقلها. لم يتغيّر شيء في مكتبتك.',
  },
  storage: {
    title: 'تعذّرت الاستعادة',
    text: 'رفض التخزين الكتابة: المساحة، أو التصفّح الخاص. لم يتغيّر شيء في مكتبتك.',
  },
}

const retentionLabel = (days: number) => settingValueText('privacy.autoDeleteAfterDays', days)

export function RestoreDialog({
  file,
  retention,
  onClose,
  onPickAnother,
  onRestored,
}: RestoreDialogProps): JSX.Element {
  const [phase, setPhase] = useState<Phase>({ kind: 'checking', done: 0, total: 0 })
  const controller = useRef<AbortController | null>(null)

  useEffect(() => {
    const abort = new AbortController()
    controller.current = abort
    let live = true
    setPhase({ kind: 'checking', done: 0, total: 0 })
    void readBackup(file, {
      signal: abort.signal,
      onProgress: ({ done, total }) => {
        if (live) setPhase({ kind: 'checking', done, total })
      },
    })
      .then((read) => {
        if (!live) return
        if (!read.ok) setPhase({ kind: 'failed', failure: read.error, plan: null })
        else if (read.value === 'cancelled') onClose()
        else setPhase({ kind: 'preview', plan: read.value })
      })
      // `readBackup` لا يرمي؛ وحارسٌ هنا كي لا تبقى النافذة «يُفحص الملفّ» بلا مخرج إن رمى يومًا.
      .catch(() => {
        if (live)
          setPhase({ kind: 'failed', failure: { kind: 'damaged', detail: 'read' }, plan: null })
      })
    return () => {
      live = false
      abort.abort()
    }
  }, [file])

  const restore = (plan: RestorePlan) => {
    setPhase({ kind: 'restoring' })
    void restoreBackup(plan)
      .then((written) => {
        if (!written.ok) {
          setPhase({ kind: 'failed', failure: written.error, plan })
          return
        }
        // أوّل حفظٍ من صفحة: يُطلب التخزين الدائم إن لم يُمنح (`persistence.ts`).
        void requestPersistence()
        onRestored()
        setPhase({ kind: 'done', report: written.value })
      })
      .catch((thrown: unknown) =>
        setPhase({
          kind: 'failed',
          failure: { kind: 'storage', error: toRasdError(thrown) },
          plan,
        }),
      )
  }

  const fileName = (
    <p class={sheet.path}>
      <TechnicalValue kind="path" variant="mono-xs">
        {file.name}
      </TechnicalValue>
    </p>
  )

  if (phase.kind === 'checking' || phase.kind === 'restoring') {
    const checking = phase.kind === 'checking'
    const cancel = () => controller.current?.abort()
    return (
      <DataDialog
        id="restore"
        phase={phase.kind}
        title="استعادة من نسخة"
        subtitle={checking ? 'يُفحص الملفّ قبل أن يُكتب منه شيء' : 'تُكتب المكتبة'}
        busy
        onEscape={checking ? cancel : undefined}
        onClose={cancel}
        actions={
          checking ? (
            <Button variant="secondary" data-rasd-cancel="" onClick={cancel}>
              ألغِ
            </Button>
          ) : null
        }
      >
        {fileName}
        <div class={styles.status}>
          <Spinner size="l" label={checking ? 'يُفحص الملفّ' : 'تُستعاد المكتبة'} />
          <p class={cx(styles.statusText, 't-arabic-ui-s')}>
            {checking ? 'يُفحص الملفّ' : 'تُستعاد المكتبة'}
          </p>
        </div>
        {checking && phase.total > 0 ? (
          <ProgressBar value={(phase.done / phase.total) * 100} label="تقدّم فحص الملفّ" />
        ) : null}
      </DataDialog>
    )
  }

  if (phase.kind === 'preview') {
    const { counts, manifest } = phase.plan
    const swept = restoreWarnings(phase.plan, retention, Date.now())
    return (
      <DataDialog
        id="restore"
        phase="preview"
        title="استعادة من نسخة"
        subtitle="راجع ما في الملفّ قبل الاستعادة"
        onClose={onClose}
        actions={
          <>
            <Button variant="secondary" data-rasd-cancel="" onClick={onClose}>
              ألغِ
            </Button>
            <Button variant="primary" icon="refresh" onClick={() => restore(phase.plan)}>
              استعد
            </Button>
          </>
        }
      >
        {fileName}
        <div class={sheet.group}>
          <p class={cx(sheet.groupLabel, 't-arabic-label-s')}>في الملفّ</p>
          <div class={sheet.summary}>
            <Row label="اللقطات">{count(counts.captures, 'captures')}</Row>
            <Row label="المشاريع">{count(counts.projects, 'projects')}</Row>
            <Row label="اللوحات والأدلّة">
              {pair(counts.palettes, 'palettes', counts.guides, 'guides')}
            </Row>
            <Row label="تاريخ النسخة">{backupDateText(manifest.createdAt)}</Row>
          </div>
        </div>
        <Banner tone="info">
          تُضاف محتويات الملفّ إلى مكتبتك. اللقطة الموجودة في الاثنين لا تتكرّر.
        </Banner>
        {swept.retention > 0 ? (
          <Banner tone="danger">
            {`مدّة الاحتفاظ في إعداداتك ${retentionLabel(retention)}: ${count(swept.retention, 'captures')} من الملفّ أقدم منها وغير مميّزة، فتُحذف نهائيًّا في الكنس التالي خلال ساعة. غيّر المدّة من «الخصوصية» قبل الاستعادة إن أردت إبقاءها.`}
          </Banner>
        ) : null}
        {swept.trash > 0 ? (
          <Banner tone="warning">
            {`${count(swept.trash, 'captures')} من الملفّ في المهملات منذ أكثر من ثلاثين يومًا، فتُطهَّر عند أوّل فتحٍ للمكتبة.`}
          </Banner>
        ) : null}
      </DataDialog>
    )
  }

  if (phase.kind === 'done') {
    const { added, kept } = phase.report
    return (
      <DataDialog
        id="restore"
        phase="done"
        title="استعادة من نسخة"
        subtitle="اكتملت الاستعادة"
        onClose={onClose}
        actions={
          <Button variant="primary" data-rasd-autofocus="" onClick={onClose}>
            تمّ
          </Button>
        }
      >
        <div class={styles.status}>
          <span class={styles.badge} data-tone="success">
            <Icon name="check" size="md" />
          </span>
          <h3 class={cx(styles.statusTitle, 't-arabic-heading-s')}>استُعيدت المكتبة</h3>
        </div>
        <div class={sheet.summary}>
          <Row label="أُضيف من الملفّ">{count(added.captures, 'captures')}</Row>
          <Row label="كان في مكتبتك فبقي كما هو">{count(kept.captures, 'captures')}</Row>
        </div>
      </DataDialog>
    )
  }

  const text = FAILURE[phase.failure.kind]
  const retryable = phase.failure.kind === 'storage' && phase.plan !== null
  const plan = phase.plan
  return (
    <DataDialog
      id="restore"
      phase="failed"
      title="استعادة من نسخة"
      subtitle="لم يتغيّر شيء في مكتبتك"
      onClose={onClose}
      actions={
        <>
          <Button variant="secondary" data-rasd-cancel="" onClick={onClose}>
            أغلق
          </Button>
          <Button variant="primary" onClick={onPickAnother}>
            اختر ملفًّا آخر
          </Button>
        </>
      }
    >
      {fileName}
      <div class={styles.failure} role="alert" data-failure={phase.failure.kind}>
        <p class={cx(styles.failureTitle, 't-arabic-ui-m')}>{text.title}</p>
        <p class={cx(styles.failureText, 't-arabic-ui-s')}>{text.text}</p>
        {retryable && plan ? (
          <div class={styles.failureActions}>
            <Button variant="secondary" size="s" onClick={() => restore(plan)}>
              أعد المحاولة
            </Button>
          </div>
        ) : null}
      </div>
    </DataDialog>
  )
}
