/**
 * مشاركة لقطة من المحرّر — محرّك `ShareDialog` لموضوعٍ واحد ([ADR 0044](../../../Docs/ADR/0044-local-share.md)).
 *
 * **كل مسارٍ يخبز من البوّابة الواحدة** (`startExport`، ADR 0015): الصفحة بـWebP عالية الجودة (ملفٌّ واحد يحمل
 * صورته Base64 فيدفع حجمها مضاعفًا بالثلث، كصفحة الدليل)، والحافظة بـPNG (ترفض WebP بالقياس)، والملفّ بما يختاره
 * المستخدم. فالحجب والتعليقات في كل ما يغادر، ولا مسار يخرج بالأصل.
 *
 * **وحقيقتا `ExportFlow` تحكمان هنا كما هناك:** طلب صلاحية التنزيل أوّل ما يقع في نبضة النقرة (`resolveRoute`)،
 * والحافظة تُكتب بوعد الخبز لا ببلوبه — فلا `await` قبل أيٍّ منهما. **ولا شبكة في أيّ مسار:** البايتات `blob:`
 * لا تغادر الجهاز إلا بيد المستخدم، وهذا ما يثبته `verify:share` بمراقبة الشبكة أثناء المسارات كلّها.
 */

import { useEffect, useRef, useState } from 'preact/hooks'

import { planExport } from '@/modules/editor/bake'
import { exportFilename } from '@/modules/export/filename'
import { formatDimensions } from '@/shared/bidi'
import { formatStorage } from '@/shared/bidi/numerals'
import { requestPermission } from '@/shared/permissions'
import { watchSettings } from '@/shared/settings'
import { Select } from '@/ui/components/Select/Select'
import { SettingRow } from '@/ui/components/SettingRow/SettingRow'
import { cx } from '@/ui/cx'

import { copyBaked, startExport } from '../editor/export'
import { deliver, revealDownload } from '../export/deliver'
import styles from '../export/export.module.css'
import { guidePalette } from '../export/guide-export'
import { resolveRoute, usePermissionProbe } from '../export/route'

import {
  capturePageFilename,
  DEFAULT_SHARE_STRIP,
  keptLabel,
  renderCapturePage,
  STRIP_ALL,
  type ShareStrip,
} from './capture-page'
import { rasdVersion, stripSetting, urlKeeper } from './common'
import {
  ShareDialog,
  StripToggles,
  type PathCard,
  type SharePath,
  type SharePhase,
} from './ShareDialog'

import type { BlurClient } from '../editor/worker-client'
import type { RenderStyle } from '@/modules/editor/renderer'
import type { Scene } from '@/modules/editor/scene'
import type { TextLayoutCache } from '@/modules/editor/text-layout'
import type { DownloadRoute } from '@/modules/export/download'
import type { CaptureRecord } from '@/shared/storage/schema'
import type { JSX } from 'preact'

export interface CaptureShareProps {
  readonly scene: Scene
  readonly sourceBlob: Blob
  readonly style: RenderStyle
  readonly layout: TextLayoutCache
  readonly client: BlurClient
  readonly capture: CaptureRecord
  readonly onClose: () => void
}

/** بطاقات اللقطة بنصوص الإطار `73:361`. */
export const CAPTURE_CARDS: Readonly<Record<SharePath, PathCard>> = {
  page: { title: 'صفحة ويب', hint: 'ملفّ واحد بلا إنترنت', icon: 'file-code' },
  clipboard: { title: 'الحافظة', hint: 'صورة جاهزة للّصق', icon: 'copy' },
  file: { title: 'ملفّ', hint: 'يُحفظ في التنزيلات', icon: 'download' },
}

type FileFormat = 'png' | 'webp'

/** ما تقوله الصورة عن بياناتها — بدل مفاتيح حذفٍ لا تحكم شيئًا فيها (المفتاح الصامت ممنوع). */
export const FILE_CARRIES =
  'الصورة لا تحمل رابط الصفحة ولا عنوانها ولا وقتها — التعليقات والحجب مدموجة فيها.'

const KEEPS = 'اللقطة في المكتبة كما هي.'

export function CaptureShare(props: CaptureShareProps): JSX.Element {
  const [path, setPath] = useState<SharePath>('page')
  const [strip, setStrip] = useState<ShareStrip>(DEFAULT_SHARE_STRIP)
  const [format, setFormat] = useState<FileFormat>('png')
  const [scale, setScale] = useState<1 | 2>(2)
  const [phase, setPhase] = useState<SharePhase>({ kind: 'choose' })
  /** الحذف الذي يفرضه إعداد الخصوصية — حيًّا، فتبويبٌ آخر يغيّره ثمّ تُشارَك اللقطة بقيمته الجديدة. */
  const [forced, setForced] = useState(false)

  const permission = usePermissionProbe()
  const urls = useRef(urlKeeper())
  /** إلغاء المسار الجاري — يعلّم الرمز ويُجهض الخبز معًا. */
  const cancelRef = useRef<() => void>(() => undefined)

  useEffect(
    () => watchSettings((settings) => setForced(settings.privacy.stripMetadataOnExport)),
    [],
  )
  useEffect(() => () => urls.current.release(), [])

  const close = (): void => {
    cancelRef.current()
    props.onClose()
  }

  const fileScale = path === 'file' ? scale : 1
  const plan = planExport(props.scene, fileScale)
  const blocked = plan.ok ? null : plan.reason

  /** رمز إلغاءٍ لكل تشغيل — ما يصل بعد الإلغاء يُسقَط ولا يكتب طورًا. */
  const begin = (text: string): { aborted: boolean } => {
    const token = { aborted: false }
    cancelRef.current = () => {
      token.aborted = true
    }
    setPhase({ kind: 'running', text })
    return token
  }

  const bake = (token: { aborted: boolean }, options: { format: FileFormat; scale: 1 | 2 }) => {
    const run = startExport({
      scene: props.scene,
      sourceBlob: props.sourceBlob,
      scale: options.scale,
      format: options.format,
      quality: options.format === 'webp' ? 'high' : 'max',
      // ما يُشارَك يغادر الجهاز: بلا مقاطع ثانوية دائمًا (ملفّ الألوان المضمَّن في WebP وحده — PNG بلا شيء أصلًا).
      stripMetadata: true,
      style: props.style,
      layout: props.layout,
      client: props.client,
    })
    cancelRef.current = () => {
      token.aborted = true
      run.cancel()
    }
    return run
  }

  const fail = (token: { aborted: boolean }, failedPath: SharePath, message: string): void => {
    if (token.aborted) return
    setPhase({ kind: 'error', path: failedPath, message })
  }

  /** الصفحة: الخبز، ثمّ الصفحة بحذفها، ثمّ التسليم بالطريق المحسوم في النقرة. */
  const runPage = async (route: DownloadRoute, note: string | null): Promise<void> => {
    const token = begin('تُنشأ الصفحة')
    const stripAll = await stripSetting()
    if (token.aborted) return
    const applied = stripAll ? STRIP_ALL : strip
    const run = bake(token, { format: 'webp', scale: 1 })
    const result = await run.done
    if (token.aborted) return
    if (!result.ok) {
      if (result.error.code === 'cancelled') return
      fail(token, 'page', result.error.message)
      return
    }
    const { blob, report } = result.value
    const html = renderCapturePage({
      title: props.capture.title,
      url: props.capture.url,
      createdAt: props.capture.createdAt,
      image: {
        bytes: new Uint8Array(await blob.arrayBuffer()),
        mime: report.format === 'webp' ? 'image/webp' : 'image/png',
        width: report.width,
        height: report.height,
      },
      strip: applied,
      palette: guidePalette(),
      version: rasdVersion(),
    })
    if (token.aborted) return
    const file = new Blob([html], { type: 'text/html' })
    const url = urls.current.keep(file)
    const filename = capturePageFilename(props.capture.title, applied)
    const delivered = await deliver({ route, url, filename })
    setPhase({
      kind: 'done',
      path: 'page',
      title: 'الصفحة جاهزة',
      body: 'ملفّ واحد يُفتح في أي متصفّح بلا إنترنت. أرسله كما ترسل أي ملفّ.',
      shown: delivered.shown,
      downloadId: delivered.downloadId,
      note: delivered.route === 'anchor' ? note : null,
      blobUrl: url,
      rows: [
        { label: 'الحجم', value: formatStorage(file.size), mono: true },
        { label: 'يعمل بلا إنترنت', value: 'نعم' },
        { label: 'بيانات الصفحة', value: keptLabel(applied) },
      ],
    })
  }

  /** الملفّ: الصيغة والدقّة المختارتان، ثمّ التسليم. */
  const runFile = async (route: DownloadRoute, note: string | null): Promise<void> => {
    const token = begin('يُجهَّز الملفّ')
    const chosen = { format, scale }
    const run = bake(token, chosen)
    const result = await run.done
    if (token.aborted) return
    if (!result.ok) {
      if (result.error.code === 'cancelled') return
      fail(token, 'file', result.error.message)
      return
    }
    const { blob, report } = result.value
    const url = urls.current.keep(blob)
    const filename = exportFilename(props.capture.title, chosen.scale, report.format)
    const delivered = await deliver({ route, url, filename })
    setPhase({
      kind: 'done',
      path: 'file',
      title: 'الملفّ جاهز',
      body: delivered.route === 'managed' ? 'الملفّ حيث اخترت حفظه.' : 'الملفّ في مجلّد التنزيلات.',
      shown: delivered.shown,
      downloadId: delivered.downloadId,
      note: delivered.route === 'anchor' ? note : null,
      blobUrl: url,
      rows: [
        { label: 'الحجم', value: formatStorage(blob.size), mono: true },
        {
          label: 'الأبعاد',
          value: `${report.format.toUpperCase()} · ${formatDimensions(report.width, report.height)}`,
          mono: true,
        },
        { label: 'بيانات الصفحة', value: 'لا يحملها الملفّ' },
      ],
    })
  }

  /**
   * الحافظة — **الخبز يبدأ والكتابة تُنادى في النبضة نفسها**، والوعد يُسلَّم لا البلوب. PNG دائمًا بدقّة 1×:
   * ما يُلصق في محادثة لا يحتاج ريتينا، والحافظة ترفض WebP.
   */
  const runClipboard = (): void => {
    const token = begin('تُجهَّز الصورة')
    const run = bake(token, { format: 'png', scale: 1 })
    void copyBaked(run.bytes).then((copied) => {
      if (token.aborted) return
      if (!copied.ok) {
        fail(token, 'clipboard', copied.error.message)
        return
      }
      setPhase({
        kind: 'copied',
        title: 'نُسخت الصورة',
        hint: 'الصقها في أي محادثة أو مستند.',
      })
    })
    void run.done.then((result) => {
      if (token.aborted || result.ok || result.error.code === 'cancelled') return
      fail(token, 'clipboard', result.error.message)
    })
  }

  /** **يُستدعى متزامنًا من النقرة.** لا `await` قبل `resolveRoute` ولا قبل `copyBaked`. */
  const onRun = (): void => {
    if (blocked) return
    if (path === 'clipboard') {
      runClipboard()
      return
    }
    const chosen = path
    void resolveRoute(permission)
      .then(({ route, note }) => (chosen === 'page' ? runPage(route, note) : runFile(route, note)))
      .catch((thrown: unknown) => {
        setPhase({
          kind: 'error',
          path: chosen,
          message: thrown instanceof Error ? thrown.message : String(thrown),
        })
      })
  }

  /** منح الصلاحية بعد رفضها — من النقرة نفسها، ثمّ العودة إلى الخيارات ليُسأل عن المكان. */
  const onGrant = (): void => {
    void requestPermission(['downloads']).then((outcome) => {
      if (outcome === 'granted') {
        permission.current = 'granted'
        setPhase({ kind: 'choose' })
      }
    })
  }

  const fileOptions = (
    <section class={styles.group} aria-labelledby="share-file-label" data-share-file="">
      <h3 id="share-file-label" class={cx(styles.groupLabel, 't-arabic-label-xs')}>
        الملفّ
      </h3>
      <div class={styles.card}>
        <SettingRow
          id="share-format"
          label="الصيغة"
          divider
          control={
            <Select
              aria-label="الصيغة"
              value={format}
              data-share-format=""
              options={[
                { value: 'png', label: 'PNG' },
                { value: 'webp', label: 'WebP' },
              ]}
              onChange={(v) => setFormat(v === 'webp' ? 'webp' : 'png')}
            />
          }
        />
        <SettingRow
          id="share-scale"
          label="الدقّة"
          control={
            <Select
              aria-label="الدقّة"
              value={String(scale)}
              data-share-scale=""
              // عزلٌ باتجاه اليسار: خيار القائمة الأصلية لا يقبل `<bdi>` (نمط `ExportModal`).
              options={([1, 2] as const).map((k) => ({
                value: String(k),
                label: `\u2066${k}×\u2069`,
              }))}
              onChange={(v) => setScale(Number(v) === 1 ? 1 : 2)}
            />
          }
        />
      </div>
      <p class={styles.note}>{FILE_CARRIES}</p>
    </section>
  )

  return (
    <ShareDialog
      heading="مشاركة"
      subtitle={`لقطة واحدة · ${props.capture.title || props.capture.url}`}
      phase={phase}
      path={path}
      cards={CAPTURE_CARDS}
      onPath={setPath}
      options={
        path === 'page' ? (
          <StripToggles strip={strip} forced={forced} onChange={setStrip} />
        ) : path === 'file' ? (
          fileOptions
        ) : null
      }
      blocked={blocked}
      keeps={KEEPS}
      onRun={onRun}
      onCancelRun={() => {
        cancelRef.current()
        setPhase({ kind: 'cancelled' })
      }}
      onReveal={revealDownload}
      onGrant={onGrant}
      onCopyInstead={() => {
        setPath('clipboard')
        runClipboard()
      }}
      onRestart={() => setPhase({ kind: 'choose' })}
      onClose={close}
    />
  )
}
