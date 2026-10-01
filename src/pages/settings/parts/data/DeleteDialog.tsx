/**
 * «احذف كل البيانات» — تأكيدٌ مزدوج: `data / delete-confirm` · `delete-confirm-final` · `delete-done` ·
 * `delete-error` (`292:2926` · `292:3109` · `292:3268` · `292:3419`).
 *
 * **الخطوة الأولى تسمّي ما سيُحذف بأعداده وتعرض النسخة الاحتياطية أوّلًا** (`STAGES/07` المهمّة 8): «أنشئ
 * نسخة» يفتح النسخ في مكانه، ويعود إلى هنا بـ«آخر نسخة» محدَّثة. **والثانية تطلب كلمة «احذف» مكتوبةً** — لا
 * نقرتين متتاليتين على موضعٍ واحد يمرّ بهما إصبعٌ مستعجل. والحذف نفسه مسارٌ واحد (`eraseAllData`).
 *
 * «أبلغ عن المشكلة» في إطار الخطأ يفتح نافذة البلاغ بالأداة `data` ورمز الفشل (ADR 0050).
 */
import { useState } from 'preact/hooks'

import { reportUrl } from '@/shared/report-link'
import { eraseAllData } from '@/shared/storage/erase'
import { Banner, Button, Input, Spinner } from '@/ui/components'
import { cx } from '@/ui/cx'
import { Icon } from '@/ui/icons/Icon'

import { count, lastBackupText, pair, type LastBackup } from '../../data-context'

import styles from './data.module.css'
import { DataDialog, Row, sheet } from './DataDialog'

import type { StoreCounts } from '@/shared/storage/library'
import type { JSX } from 'preact'

/** كلمة التأكيد كما في الإطار. */
export const CONFIRM_WORD = 'احذف'

/**
 * تُطابَق بعد التطبيع: الهمزة على الألف أو تحتها، والتشكيل والتطويل، والمسافات حولها — لوحة مفاتيحٍ تكتب
 * «إحذف» لا تجعل التأكيد مستحيلًا.
 */
export function confirmMatches(typed: string): boolean {
  const normal = typed
    .trim()
    .replace(/[ً-ْـ]/gu, '')
    .replace(/[أإآ]/gu, 'ا')
  return normal === CONFIRM_WORD
}

type Step = 'review' | 'confirm' | 'erasing' | 'done' | 'failed'

export interface DeleteDialogProps {
  /** `null` حين تعذّرت قراءة المكتبة — يُقال ذلك ولا تُعرض أصفار. */
  readonly counts: StoreCounts | null
  readonly lastBackup: LastBackup | null
  readonly onBackup: () => void
  readonly onClose: () => void
  /** اكتمل الحذف أو بعضه — تُقرأ الأعداد من جديد. */
  readonly onErased: () => void
}

export function DeleteDialog({
  counts,
  lastBackup,
  onBackup,
  onClose,
  onErased,
}: DeleteDialogProps): JSX.Element {
  const [step, setStep] = useState<Step>('review')
  const [typed, setTyped] = useState('')
  const [failureCode, setFailureCode] = useState<string | null>(null)

  const erase = () => {
    setStep('erasing')
    void eraseAllData().then((result) => {
      onErased()
      setFailureCode(result.ok ? null : `erase-${result.error.failed.join('-')}`.slice(0, 64))
      setStep(result.ok ? 'done' : 'failed')
    })
  }

  const captures = counts?.captures ?? 0

  if (step === 'review') {
    return (
      <DataDialog
        id="delete"
        phase="review"
        title="حذف كل البيانات"
        subtitle="الخطوة ١ من ٢"
        onClose={onClose}
        actions={
          <>
            <Button variant="secondary" data-rasd-cancel="" onClick={onClose}>
              ألغِ
            </Button>
            <Button variant="danger" onClick={() => setStep('confirm')}>
              تابع إلى التأكيد
            </Button>
          </>
        }
      >
        <Banner tone="danger">الحذف نهائي. لا سلّة محذوفات ولا تراجع.</Banner>
        <div class={sheet.group}>
          <p class={cx(sheet.groupLabel, 't-arabic-label-s')}>سيُحذف</p>
          <div class={sheet.summary}>
            {counts ? (
              <>
                <Row label="اللقطات">{count(counts.captures, 'captures')}</Row>
                <Row label="اللوحات والأدلّة">
                  {pair(counts.palettes, 'palettes', counts.guides, 'guides')}
                </Row>
                <Row label="المشاريع والوسوم">
                  {pair(counts.projects, 'projects', counts.tags, 'tags')}
                </Row>
                <Row label="المراجع والمشكلات">
                  {pair(counts.references, 'references', counts.issues, 'issues')}
                </Row>
              </>
            ) : (
              <Row label="المكتبة">كلّها — تعذّر عدّها الآن</Row>
            )}
            <Row label="الإعدادات">كلّها، ومعها المواقع المستثناة</Row>
          </div>
        </div>
        <div class={sheet.group}>
          <p class={cx(sheet.groupLabel, 't-arabic-label-s')}>قبل أن تحذف</p>
          <div class={styles.option}>
            <div class={styles.optionText}>
              <p class={cx(styles.optionTitle, 't-arabic-ui-s-strong')}>خذ نسخة احتياطية أوّلًا</p>
              <p class={cx(styles.optionHint, 't-arabic-ui-xs')} data-last-backup="">
                {lastBackupText(lastBackup)}
              </p>
            </div>
            <Button variant="primary" size="s" onClick={onBackup}>
              أنشئ نسخة
            </Button>
          </div>
        </div>
      </DataDialog>
    )
  }

  if (step === 'confirm') {
    const ready = confirmMatches(typed)
    return (
      <DataDialog
        id="delete"
        phase="confirm"
        focus="#data-delete-word"
        title="حذف كل البيانات"
        subtitle="الخطوة ٢ من ٢"
        onClose={onClose}
        actions={
          <>
            <Button variant="secondary" data-rasd-cancel="" onClick={onClose}>
              ألغِ
            </Button>
            <Button
              variant="danger"
              icon="trash"
              state={ready ? 'default' : 'disabled'}
              data-rasd-confirm=""
              onClick={() => {
                if (ready) erase()
              }}
            >
              احذف كل البيانات نهائيًّا
            </Button>
          </>
        }
      >
        <Banner tone="danger">
          {captures > 0
            ? `اكتب كلمة «${CONFIRM_WORD}» لتأكيد حذف ${count(captures, 'captures')} وكل ما معها نهائيًّا.`
            : `اكتب كلمة «${CONFIRM_WORD}» لتأكيد حذف كل البيانات نهائيًّا.`}
        </Banner>
        <label class={styles.field}>
          <span class={cx(styles.fieldLabel, 't-arabic-label-s')}>كلمة التأكيد</span>
          <Input id="data-delete-word" value={typed} onInput={setTyped} aria-label="كلمة التأكيد" />
        </label>
      </DataDialog>
    )
  }

  if (step === 'erasing') {
    return (
      <DataDialog
        id="delete"
        phase="erasing"
        title="حذف كل البيانات"
        subtitle="يجري الحذف"
        busy
        onClose={() => undefined}
        actions={null}
      >
        <div class={styles.status}>
          <Spinner size="l" label="يجري الحذف" />
        </div>
      </DataDialog>
    )
  }

  if (step === 'done') {
    return (
      <DataDialog
        id="delete"
        phase="done"
        title="حذف كل البيانات"
        subtitle="اكتمل الحذف"
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
          <h3 class={cx(styles.statusTitle, 't-arabic-heading-s')}>حُذفت كل البيانات</h3>
          <p class={cx(styles.statusText, 't-arabic-ui-s')}>رصد الآن كما كان عند التثبيت.</p>
        </div>
      </DataDialog>
    )
  }

  return (
    <DataDialog
      id="delete"
      phase="failed"
      title="حذف كل البيانات"
      subtitle="لم يكتمل الحذف"
      onClose={onClose}
      actions={
        <Button variant="secondary" data-rasd-cancel="" onClick={onClose}>
          أغلق
        </Button>
      }
    >
      <div class={styles.failure} role="alert">
        <p class={cx(styles.failureTitle, 't-arabic-ui-m-strong')}>تعذّر إكمال الحذف</p>
        <p class={cx(styles.failureText, 't-arabic-ui-s')}>
          حُذف بعض البيانات وبقي بعضها. أعد المحاولة ليكتمل الحذف. لا شيء غادر هذا الجهاز.
        </p>
        <div class={styles.failureActions}>
          <Button variant="secondary" size="s" onClick={erase}>
            أعد المحاولة
          </Button>
          <Button
            variant="ghost"
            size="s"
            onClick={() => location.assign(reportUrl({ tool: 'data', code: failureCode }))}
          >
            أبلغ عن المشكلة
          </Button>
        </div>
      </div>
    </DataDialog>
  )
}
