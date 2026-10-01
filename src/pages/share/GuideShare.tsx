/**
 * مشاركة دليل — `share / guide` (`291:1262`)، محرّك `ShareDialog` للدليل ([ADR 0044](../../../Docs/ADR/0044-local-share.md)).
 *
 * **لا مولِّد جديد:** الصفحة والملفّ من `runGuideExport` نفسه (`STAGES/06`)، فصفحة الدليل المشارَكة هي صفحته
 * المصدَّرة حرفًا بحرف — بسياستها `default-src 'none'` وصورها المخبوزة بحجبها. والحافظة نصّ الخطوات بـMarkdown:
 * الدليل صورٌ كثيرة لا تحملها الحافظة، والنصّ ما يُلصق في تذكرةٍ أو محادثة.
 *
 * **والإيماءة كما في اللقطة:** طلب صلاحية التنزيل أوّل ما يقع في النقرة، و`writeText` تُنادى في النبضة نفسها
 * بنصٍّ يُبنى متزامنًا — فلا `await` قبل أيٍّ منهما.
 */

import { useEffect, useRef, useState } from 'preact/hooks'

import { buildGuideModel, renderGuideMarkdown, STEP_FORMS } from '@/modules/export/guide'
import { countText, formatStorage } from '@/shared/bidi/numerals'
import { DEFAULT_GUIDE_OPTIONS, type GuideFormat, type GuideStep } from '@/shared/guide-schema'
import { requestPermission } from '@/shared/permissions'
import { Select } from '@/ui/components/Select/Select'
import { SettingRow } from '@/ui/components/SettingRow/SettingRow'
import { cx } from '@/ui/cx'

import { deliver, revealDownload } from '../export/deliver'
import styles from '../export/export.module.css'
import { runGuideExport } from '../export/guide-export'
import { resolveRoute, usePermissionProbe } from '../export/route'
import { createBakeTools } from '../handoff/evidence'

import { rasdVersion, stripSetting, urlKeeper } from './common'
import {
  ShareDialog,
  SummaryRows,
  type PathCard,
  type SharePath,
  type SharePhase,
} from './ShareDialog'

import type { DownloadRoute } from '@/modules/export/download'
import type { JSX } from 'preact'

export interface GuideShareProps {
  readonly title: string
  readonly steps: readonly GuideStep[]
  readonly captureTitles: ReadonlyMap<string, string>
  readonly onClose: () => void
  /** زمن المشاركة — يُحقن للاختبار. */
  readonly now?: () => number
}

/** بطاقات الدليل — الحافظة نصٌّ لا صورة. */
export const GUIDE_CARDS: Readonly<Record<SharePath, PathCard>> = {
  page: { title: 'صفحة ويب', hint: 'ملفّ واحد بلا إنترنت', icon: 'file-code' },
  clipboard: { title: 'الحافظة', hint: 'نصّ الخطوات للّصق', icon: 'copy' },
  file: { title: 'ملفّ', hint: 'يُحفظ في التنزيلات', icon: 'download' },
}

type FileFormat = Extract<GuideFormat, 'pdf' | 'zip'>

const FILE_LABEL: Readonly<Record<FileFormat, string>> = {
  pdf: 'PDF — للطباعة والإرسال',
  zip: 'ZIP — الصور ومعها النصّ',
}

const KEEPS = 'الدليل لم يتغيّر.'

export function GuideShare(props: GuideShareProps): JSX.Element {
  const [path, setPath] = useState<SharePath>('page')
  const [format, setFormat] = useState<FileFormat>('pdf')
  const [phase, setPhase] = useState<SharePhase>({ kind: 'choose' })

  const permission = usePermissionProbe()
  const urls = useRef(urlKeeper())
  const run = useRef<AbortController | null>(null)
  const now = props.now ?? Date.now
  const count = props.steps.length
  const options = DEFAULT_GUIDE_OPTIONS

  useEffect(
    () => () => {
      run.current?.abort()
      urls.current.release()
    },
    [],
  )

  const close = (): void => {
    run.current?.abort()
    props.onClose()
  }

  const build = async (
    chosen: 'page' | 'file',
    route: DownloadRoute,
    note: string | null,
  ): Promise<void> => {
    const controller = new AbortController()
    run.current = controller
    const exportFormat: GuideFormat = chosen === 'page' ? 'html' : format
    setPhase({ kind: 'running', text: chosen === 'page' ? 'تُنشأ الصفحة' : 'يُجهَّز الملفّ' })

    const tools = await createBakeTools(await stripSetting())
    try {
      const result = await runGuideExport({
        title: props.title,
        steps: props.steps,
        captureTitles: props.captureTitles,
        options: { ...options, format: exportFormat },
        version: rasdVersion(),
        now: now(),
        tools,
        signal: controller.signal,
      })
      if (controller.signal.aborted) return
      if (!result.ok) {
        if (result.error.code === 'cancelled') return
        setPhase({ kind: 'error', path: chosen, message: result.error.message })
        return
      }
      const url = urls.current.keep(result.value.blob)
      const delivered = await deliver({ route, url, filename: result.value.filename })
      setPhase({
        kind: 'done',
        path: chosen,
        title: chosen === 'page' ? 'الصفحة جاهزة' : 'الملفّ جاهز',
        body:
          chosen === 'page'
            ? 'ملفّ واحد يُفتح في أي متصفّح بلا إنترنت. أرسله كما ترسل أي ملفّ.'
            : delivered.route === 'managed'
              ? 'الملفّ حيث اخترت حفظه.'
              : 'الملفّ في مجلّد التنزيلات.',
        shown: delivered.shown,
        downloadId: delivered.downloadId,
        note: delivered.route === 'anchor' ? note : null,
        blobUrl: url,
        rows: [
          { label: 'الحجم', value: formatStorage(result.value.blob.size), mono: true },
          { label: 'الخطوات', value: countText(count, STEP_FORMS) },
          ...(chosen === 'page' ? [{ label: 'يعمل بلا إنترنت', value: 'نعم' }] : []),
        ],
      })
    } finally {
      tools.dispose()
    }
  }

  /** الحافظة: النصّ يُبنى متزامنًا و`writeText` تُنادى في نبضة النقرة. */
  const runClipboard = (): void => {
    const model = buildGuideModel({
      title: props.title,
      steps: props.steps,
      captureTitles: props.captureTitles,
      options,
      generatedAt: now(),
      version: rasdVersion(),
      imageExtension: 'png',
    })
    const text = renderGuideMarkdown(model, { images: false })
    if (!navigator.clipboard?.writeText) {
      setPhase({ kind: 'error', path: 'clipboard', message: 'الحافظة غير متاحة في هذا المتصفّح.' })
      return
    }
    void navigator.clipboard.writeText(text).then(
      () =>
        setPhase({ kind: 'copied', title: 'نُسخت الخطوات', hint: 'الصقها في تذكرةٍ أو مستند.' }),
      (thrown: unknown) =>
        setPhase({
          kind: 'error',
          path: 'clipboard',
          message:
            thrown instanceof Error && thrown.name === 'NotAllowedError'
              ? 'انقر داخل الصفحة ثمّ أعد المحاولة.'
              : 'تعذّر نسخ النصّ إلى الحافظة.',
        }),
    )
  }

  /** **يُستدعى متزامنًا من النقرة.** */
  const onRun = (): void => {
    if (count === 0) return
    if (path === 'clipboard') {
      runClipboard()
      return
    }
    const chosen = path
    void resolveRoute(permission)
      .then(({ route, note }) => build(chosen, route, note))
      .catch((thrown: unknown) => {
        if (run.current?.signal.aborted) return
        setPhase({
          kind: 'error',
          path: chosen,
          message: thrown instanceof Error ? thrown.message : String(thrown),
        })
      })
  }

  const summary =
    path === 'page' ? (
      <SummaryRows
        data="guide-page"
        rows={[
          { label: 'الخطوات', value: `${countText(count, STEP_FORMS)} مرقّمة` },
          { label: 'الصور', value: 'مضمَّنة في الملفّ' },
          { label: 'الاتجاه', value: 'من اليمين إلى اليسار' },
        ]}
      />
    ) : path === 'clipboard' ? (
      <SummaryRows
        data="guide-clipboard"
        rows={[
          { label: 'النصّ', value: 'العناوين والملاحظات بترتيبها' },
          { label: 'الصور', value: 'لا تحملها الحافظة — اختر صفحة ويب أو ملفًّا لها' },
        ]}
      />
    ) : (
      <section class={styles.group} aria-labelledby="share-file-label" data-share-file="">
        <h3 id="share-file-label" class={cx(styles.groupLabel, 't-arabic-label-xs')}>
          الملفّ
        </h3>
        <div class={styles.card}>
          <SettingRow
            id="share-guide-format"
            label="الصيغة"
            control={
              <Select
                aria-label="الصيغة"
                value={format}
                data-share-format=""
                options={(['pdf', 'zip'] as const).map((f) => ({ value: f, label: FILE_LABEL[f] }))}
                onChange={(v) => setFormat(v === 'zip' ? 'zip' : 'pdf')}
              />
            }
          />
        </div>
      </section>
    )

  return (
    <ShareDialog
      heading="مشاركة دليل"
      subtitle={`${props.title} · ${countText(count, STEP_FORMS)}`}
      phase={phase}
      path={path}
      cards={GUIDE_CARDS}
      onPath={setPath}
      options={summary}
      blocked={count === 0 ? 'لا خطوات في الدليل لتُشارَك.' : null}
      keeps={KEEPS}
      onRun={onRun}
      onCancelRun={() => {
        run.current?.abort()
        setPhase({ kind: 'cancelled' })
      }}
      onReveal={revealDownload}
      onGrant={() => {
        void requestPermission(['downloads']).then((outcome) => {
          if (outcome === 'granted') {
            permission.current = 'granted'
            setPhase({ kind: 'choose' })
          }
        })
      }}
      onCopyInstead={() => {
        setPath('clipboard')
        runClipboard()
      }}
      onRestart={() => setPhase({ kind: 'choose' })}
      onClose={close}
    />
  )
}
