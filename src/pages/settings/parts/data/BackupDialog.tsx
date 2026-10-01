/**
 * «خذ نسخة احتياطية للمكتبة» — `data / backup-progress` · `backup-done` · `backup-cancelled` ·
 * `backup-empty` · `permission-denied` (`292:1916` · `292:2072` · `319:12845` · `319:13000` · `319:13151`).
 *
 * **الطريق مقرَّر قبل الفتح:** صلاحية `downloads` تُطلب في نقرة «أنشئ نسخة» نفسها (`DataSection`) لأن
 * `chrome.permissions.request` لا يُستدعى خارج سلسلة الإيماءة — فالنافذة تبدأ النسخ بطريقٍ معلوم.
 *
 * **ورفض الصلاحية لا يُفشل النسخة** — خلافًا لإطار `permission-denied` الذي يقول «لم تُحفظ النسخة»: قاعدة
 * التصدير منذ 19.1 أن الرفض تدهورٌ إلى مرساة التنزيل يُعلَن ما فقده (`DEGRADE_NOTE`)، لا فشلٌ. فالملفّ يُحفظ
 * في مجلّد التنزيلات الافتراضي، وتقول النافذة ذلك بجوار «النسخة جاهزة» (`Docs/Design.md`، انحرافٌ مكتوب).
 */
import { useEffect, useRef, useState } from 'preact/hooks'

import { createBackup, type BackupFailure } from '@/modules/backup/backup'
import { formatHuman, formatStorage } from '@/shared/bidi/numerals'
import { VERSION } from '@/shared/env'
import { STORE_NAMES, type StoreName } from '@/shared/storage/schema'
import { Banner, Button, ProgressBar, Spinner } from '@/ui/components'
import { cx } from '@/ui/cx'
import { Icon } from '@/ui/icons/Icon'
import { TechnicalValue } from '@/ui/TechnicalValue'

import { deliver, revealDownload, type Delivered } from '../../../export/deliver'
import { awaitDownload, count, pair, recordLastBackup, type LastBackup } from '../../data-context'

import styles from './data.module.css'
import { DataDialog, Row, sheet } from './DataDialog'

import type { DownloadRoute } from '@/modules/export/download'
import type { StoreCounts } from '@/shared/storage/library'
import type { JSX } from 'preact'

type Phase =
  | { readonly kind: 'working'; readonly done: number; readonly total: number }
  | {
      readonly kind: 'done'
      readonly delivered: Delivered
      readonly counts: StoreCounts
      readonly skipped: number
      readonly bytes: number
    }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'empty' }
  | { readonly kind: 'failed'; readonly failure: BackupFailure }

export interface BackupDialogProps {
  readonly route: DownloadRoute
  /** ما فقده التدهور إلى المرساة، أو `null`. */
  readonly note: string | null
  readonly onClose: () => void
  /** حُفظ الملفّ — لتحديث «آخر نسخة» في القسم. */
  readonly onDelivered: (entry: LastBackup) => void
}

function failureText(failure: BackupFailure): string {
  if (failure.kind === 'storage' && failure.error.code === 'library-locked') {
    // قفلٌ مقصود لا عطل (ADR 0043): النسخ يطلب الفكّ.
    return 'المكتبة مقفلة. افتحها من «قفل المكتبة» في الخصوصية ثمّ خذ النسخة. لم يُحفظ ملفّ.'
  }
  if (failure.kind === 'storage') return 'تعذّرت قراءة المكتبة. لم يُحفظ ملفّ، والمكتبة كما هي.'
  return 'المكتبة أكبر من أن تُكتب في ملفٍّ واحد. لم يُحفظ ملفّ، والمكتبة كما هي.'
}

export function BackupDialog({
  route,
  note,
  onClose,
  onDelivered,
}: BackupDialogProps): JSX.Element {
  const [phase, setPhase] = useState<Phase>({ kind: 'working', done: 0, total: 0 })
  const [run, setRun] = useState(0)
  const controller = useRef<AbortController | null>(null)
  const url = useRef<string | null>(null)

  useEffect(() => {
    const abort = new AbortController()
    controller.current = abort
    let live = true
    setPhase({ kind: 'working', done: 0, total: 0 })
    void (async () => {
      const now = Date.now()
      const built = await createBackup({
        now,
        app: VERSION,
        signal: abort.signal,
        onProgress: ({ done, total }) => {
          if (live) setPhase({ kind: 'working', done, total })
        },
      })
      if (!live) return
      if (!built.ok) return setPhase({ kind: 'failed', failure: built.error })
      const outcome = built.value
      if (outcome.kind === 'empty' || outcome.kind === 'cancelled') return setPhase(outcome)

      if (url.current) URL.revokeObjectURL(url.current)
      url.current = URL.createObjectURL(outcome.blob)
      const delivered = await deliver({ route, url: url.current, filename: outcome.filename })
      /*
       * **التنزيل المُدار يُنتظر حتى يُكتب:** نافذة «حفظ باسم» تُلغى، و`download` يُرجع مُعرِّفه قبلها — فلا
       * «النسخة جاهزة» ولا «آخر نسخة» لملفٍّ لم يُحفظ. والمرساة لا تُخبر بشيء، فتُحسب محفوظة.
       */
      if (delivered.downloadId !== null) {
        if (live) setPhase({ kind: 'working', done: 1, total: 1 })
        if ((await awaitDownload(delivered.downloadId)) === 'interrupted') {
          if (live) setPhase({ kind: 'cancelled' })
          return
        }
      }
      const skipped = STORE_NAMES.reduce((sum, n: StoreName) => sum + outcome.skipped[n], 0)
      const entry = { at: now, skipped }
      await recordLastBackup(entry)
      onDelivered(entry)
      if (!live) return
      setPhase({
        kind: 'done',
        delivered,
        counts: outcome.counts,
        skipped,
        bytes: outcome.blob.size,
      })
    })()
    return () => {
      live = false
      abort.abort()
    }
  }, [run])

  // العنوان يبقى ما بقيت النافذة: التنزيل المُدار يقرؤه بعد أن يختار المستخدم مكان الحفظ.
  useEffect(
    () => () => {
      if (url.current) URL.revokeObjectURL(url.current)
    },
    [],
  )

  const cancel = () => controller.current?.abort()

  if (phase.kind === 'working') {
    const ratio = phase.total > 0 ? (phase.done / phase.total) * 100 : 0
    return (
      <DataDialog
        id="backup"
        phase="working"
        title="نسخة احتياطية"
        subtitle="تُجمع المكتبة في ملفٍّ واحد"
        busy
        onEscape={cancel}
        onClose={cancel}
        actions={
          <Button variant="secondary" data-rasd-cancel="" onClick={cancel}>
            ألغِ
          </Button>
        }
      >
        <div class={styles.status}>
          <Spinner size="l" label="تُجمع الصور" />
          <p class={cx(styles.statusText, 't-arabic-ui-s')}>تُجمع الصور</p>
        </div>
        <div class={styles.progress}>
          <div class={styles.progressHead}>
            <span class="t-arabic-ui-s">الصور</span>
            <TechnicalValue kind="code" variant="mono-xs">
              {`${phase.done} / ${phase.total}`}
            </TechnicalValue>
          </div>
          <ProgressBar value={ratio} label="تقدّم النسخة الاحتياطية" />
        </div>
      </DataDialog>
    )
  }

  if (phase.kind === 'done') {
    const { counts, delivered } = phase
    return (
      <DataDialog
        id="backup"
        phase="done"
        title="نسخة احتياطية"
        subtitle="اكتملت النسخة"
        onClose={onClose}
        actions={
          <>
            <Button variant="secondary" data-rasd-cancel="" onClick={onClose}>
              أغلق
            </Button>
            {delivered.downloadId !== null ? (
              <Button
                variant="primary"
                icon="folder"
                onClick={() => revealDownload(delivered.downloadId as number)}
              >
                اعرض في المجلّد
              </Button>
            ) : null}
          </>
        }
      >
        <div class={styles.status}>
          <span class={styles.badge} data-tone="success">
            <Icon name="check" size="md" />
          </span>
          <h3 class={cx(styles.statusTitle, 't-arabic-heading-s')}>النسخة جاهزة</h3>
          <p class={cx(styles.statusText, 't-arabic-ui-s')}>
            احفظ الملفّ في مكانٍ آمن. به تستعيد المكتبة كاملة.
          </p>
        </div>
        <p class={sheet.path} data-backup-path>
          <TechnicalValue kind="path" variant="mono-xs">
            {delivered.shown}
          </TechnicalValue>
        </p>
        <div class={sheet.summary}>
          <Row label="اللقطات">{count(counts.captures, 'captures')}</Row>
          <Row label="المشاريع والوسوم">
            {pair(counts.projects, 'projects', counts.tags, 'tags')}
          </Row>
          <Row label="اللوحات والأدلّة">
            {pair(counts.palettes, 'palettes', counts.guides, 'guides')}
          </Row>
          <Row label="الحجم">
            <TechnicalValue kind="code" variant="mono-xs">
              {formatStorage(phase.bytes)}
            </TechnicalValue>
          </Row>
        </div>
        {phase.skipped > 0 ? (
          <Banner tone="warning">
            {`سجلّاتٌ تالفة لا يقرؤها رصد فلم تُنسخ: ${formatHuman(phase.skipped)}. الباقي كلّه في الملفّ.`}
          </Banner>
        ) : null}
        {delivered.route === 'anchor' && note ? <p class={sheet.note}>{note}</p> : null}
      </DataDialog>
    )
  }

  if (phase.kind === 'failed') {
    return (
      <DataDialog
        id="backup"
        phase="failed"
        title="نسخة احتياطية"
        subtitle="لم تكتمل النسخة"
        onClose={onClose}
        actions={
          <>
            <Button variant="secondary" data-rasd-cancel="" onClick={onClose}>
              أغلق
            </Button>
            <Button variant="primary" onClick={() => setRun((n) => n + 1)}>
              أعد المحاولة
            </Button>
          </>
        }
      >
        <div class={styles.failure} role="alert">
          <p class={cx(styles.failureTitle, 't-arabic-ui-m')}>تعذّر إنشاء النسخة</p>
          <p class={cx(styles.failureText, 't-arabic-ui-s')}>{failureText(phase.failure)}</p>
        </div>
      </DataDialog>
    )
  }

  const cancelled = phase.kind === 'cancelled'
  return (
    <DataDialog
      id="backup"
      phase={phase.kind}
      title="نسخة احتياطية"
      subtitle={cancelled ? 'أُلغيت النسخة' : 'المكتبة فارغة'}
      onClose={onClose}
      actions={
        <>
          <Button variant="secondary" data-rasd-cancel="" onClick={onClose}>
            أغلق
          </Button>
          {cancelled ? (
            <Button variant="primary" onClick={() => setRun((n) => n + 1)}>
              ابدأ من جديد
            </Button>
          ) : null}
        </>
      }
    >
      <div class={styles.status}>
        <span class={styles.badge} data-tone={cancelled ? 'warning' : 'info'}>
          <Icon name={cancelled ? 'close' : 'info'} size="md" />
        </span>
        <h3 class={cx(styles.statusTitle, 't-arabic-heading-s')}>
          {cancelled ? 'أُلغيت النسخة الاحتياطية' : 'لا شيء لتنسخه'}
        </h3>
        <p class={cx(styles.statusText, 't-arabic-ui-s')}>
          {cancelled
            ? 'لم يُحفظ ملفّ. المكتبة كما هي.'
            : 'المكتبة بلا لقطات ولا لوحات ولا أدلّة. التقط أوّل لقطة ثمّ عُد.'}
        </p>
      </div>
    </DataDialog>
  )
}
