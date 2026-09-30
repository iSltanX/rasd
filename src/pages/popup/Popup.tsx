import { useEffect, useLayoutEffect, useMemo, useState } from 'preact/hooks'

import { formatDimensions, formatHuman } from '@/shared/bidi'
import { CHANNELS, openChannel, send, sendToTab, type ToolName } from '@/shared/messaging'
import { originPatternFor, requestHostPermission } from '@/shared/permissions'
import { selectPopupState, type PopupContext, type PopupStateName } from '@/shared/popup-state'

import { copyCaptureImage, loadRecent, POPUP_MARKS, type PopupLoad } from './context'
import { Footer } from './parts/Footer'
import { Header } from './parts/Header'
import styles from './Popup.module.css'
import { Cancelled } from './views/Cancelled'
import { CaptureError } from './views/CaptureError'
import { Capturing } from './views/Capturing'
import { Default } from './views/Default'
import { FirstRun } from './views/FirstRun'
import { LiveMode } from './views/LiveMode'
import { Offline } from './views/Offline'
import { Permission } from './views/Permission'
import { Restricted } from './views/Restricted'
import { Success, type SuccessAction } from './views/Success'

import type { JSX } from 'preact'

type Loaded = PopupLoad

/** مضيف التبويب ومساره الأوّل كما يكتبه الإطار: `figma.com / design-systems`. */
function pageLabel(url: string): string {
  try {
    const u = new URL(url)
    const first = u.pathname.split('/').find(Boolean)
    const host = u.hostname.replace(/^www\./, '') || u.protocol + '//'
    return first ? `${host} / ${first}` : host
  } catch {
    return url
  }
}

/** سطر الحالة تحت الاسم لكل حالة — نصوص ترويسات `13 — Extension Popup`. */
const STATUS_BY_STATE: Record<PopupStateName, (l: Loaded) => string> = {
  default: (l) => pageLabel(l.origin),
  // الإطار يكتب عنوان الصفحة الممنوعة (`chrome://settings`)، والسبب في جسم الحالة.
  restricted: (l) => l.origin,
  offline: () => 'لا يوجد اتصال',
  'first-run': () => 'جاهز في هذه الصفحة',
  permission: () => 'لم يُمنح الإذن',
  capturing: (l) =>
    l.context.job
      ? `تجميع المقطع ${formatHuman(l.context.job.done)} من ${formatHuman(l.context.job.total)}`
      : '',
  'inspect-active': () => 'مرّر فوق أي عنصر لفحصه',
  colors: () => 'مرّر فوق أي نقطة والتقط لونها',
}

/** فشل عملية يُعرض شاشةً (`popup / error` أو `popup / cancelled`) لا سطرًا في الترويسة. */
interface Failure {
  readonly kind: 'error' | 'cancelled'
  readonly title: string
  readonly message: string
  /** الأداة التي تُعاد بـ«أعد المحاولة» أو «التقط من جديد». */
  readonly retry: ToolName | null
}

export function Popup({ initial }: { initial: Promise<Loaded | null> }): JSX.Element | null {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [dismissedOffline, setDismissedOffline] = useState(false)
  const [firstRunDone, setFirstRunDone] = useState(false)
  const [success, setSuccess] = useState<{ width: number; height: number; id?: string } | null>(
    null,
  )
  const [successThumb, setSuccessThumb] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [liveProgress, setLiveProgress] = useState<{ done: number; total: number } | null>(null)
  /** فشل تفعيل أو التقاط مُبلَّغ عنه — يبقي النافذة مفتوحة ويعرض شاشته. */
  const [failure, setFailure] = useState<Failure | null>(null)
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    const onOnline = () => setOnline(true)
    const onOffline = () => setOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  // اشتراك حيّ في قناة المهمّة: تقدّم فعلي يحرّك شريط `Capturing`، و`done` بأبعاد صالحة
  // هو المسار الوحيد نحو `success`، و`failed` يعرض `popup / error` أو `popup / cancelled`
  // بحسب رمزه — الإلغاء تُرسله الخلفية `failed` برمز `cancelled` (`lifecycle.ts`).
  useEffect(() => {
    const channel = openChannel(CHANNELS.job, {
      autoReconnect: false,
      onMessage: (message) => {
        if (message.kind === 'progress') {
          setLiveProgress({ done: message.done, total: message.total })
        } else if (message.kind === 'done') {
          const result = message.result as
            { width?: unknown; height?: unknown; id?: unknown } | undefined
          if (typeof result?.width === 'number' && typeof result.height === 'number') {
            // المعرّف يُقرأ إن وُجد كي يفتح زرّ «تعليق» اللقطة التي التُقطت
            // للتوّ لا محرّرًا فارغًا. وغيابه لا يُسقط حالة النجاح.
            setSuccess({
              width: result.width,
              height: result.height,
              ...(typeof result.id === 'string' ? { id: result.id } : {}),
            })
          }
        } else if (message.kind === 'failed') {
          setLiveProgress(null)
          setFailure(
            message.code === 'cancelled'
              ? {
                  kind: 'cancelled',
                  title: 'لم تُحفظ لقطة',
                  message: message.message,
                  retry: 'full-page',
                }
              : {
                  kind: 'error',
                  title: 'لم تُحفظ اللقطة',
                  message: 'توقّفت الصفحة عن الاستجابة قبل اكتمال الالتقاط. أعد المحاولة.',
                  retry: 'full-page',
                },
          )
        }
      },
    })
    return () => channel.close()
  }, [])

  // **`useLayoutEffect` لا `useEffect`**: الأخير يُشترَك فيه بعد الإطار التالي،
  // فتنتظر بياناتٌ وصلت إطارًا كاملًا قبل أن تُركَّب. هذا يشترك ساعة التركيب
  // الأول، فيتركّب العرض ساعة وصولها — ميزانية أول عرض 100ms (`loadPopup`).
  useLayoutEffect(() => {
    let cancelled = false
    void initial.then((value) => {
      if (!cancelled && value) setLoaded(value)
    })
    return () => {
      cancelled = true
    }
  }, [initial])

  useLayoutEffect(() => {
    if (loaded) performance.mark(POPUP_MARKS.commit)
  }, [loaded])

  // مصغَّرة اللقطة التي حُفظت للتوّ: أحدث سجلّ في المكتبة هو هي.
  useEffect(() => {
    if (!success?.id) return
    let cancelled = false
    void loadRecent().then((recent) => {
      const entry = recent.find((r) => r.record.id === success.id)
      if (!cancelled && entry?.thumbUrl) setSuccessThumb(entry.thumbUrl)
    })
    return () => {
      cancelled = true
    }
  }, [success?.id])

  const context = useMemo<PopupContext | null>(
    () => (loaded ? { ...loaded.context, online } : null),
    [loaded, online],
  )

  const originLabel = useMemo(() => {
    if (!loaded?.origin) return ''
    try {
      return new URL(loaded.origin).hostname
    } catch {
      return loaded.origin
    }
  }, [loaded])

  if (!loaded || !context) return <div class={styles.shell} />

  const selected = selectPopupState(context)
  const stateName: PopupStateName =
    success || failure ? 'default' : selected === 'first-run' && firstRunDone ? 'default' : selected

  const status = failure
    ? failure.kind === 'cancelled'
      ? 'أُلغي الالتقاط'
      : 'تعذّر الالتقاط'
    : success
      ? `محفوظة محليًا · ${formatDimensions(success.width, success.height)}`
      : STATUS_BY_STATE[stateName]({ ...loaded, context })

  /**
   * **لا تُغلق النافذة إلا على نجاح مؤكَّد.**
   *
   * التفعيل يردّ صادقًا (`boot-failed`/`no-receiver`)، والفشل يُعرض شاشة
   * `popup / error` بإعادة محاولة — لا سطرًا يسهل تفويته في الترويسة.
   */
  const runTool = (tool: ToolName) => {
    setFailure(null)
    void send('tool/activate', { tool, tabId: loaded.tabId }).then((reply) => {
      if (reply.ok && reply.value.started) {
        window.close()
        return
      }
      setFailure({
        kind: 'error',
        title: 'لم تبدأ الأداة',
        message:
          reply.ok && !reply.value.started && reply.value.reason === 'no-receiver'
            ? 'تعذّر بدء الأداة — أعد تحميل الصفحة ثم حاول.'
            : 'تعذّر تشغيل رصد في هذه الصفحة.',
        retry: tool,
      })
    })
  }

  const exitLiveMode = () => {
    void sendToTab({ tabId: loaded.tabId }, 'mode/set', { mode: 'idle' }).then(() => window.close())
  }

  /**
   * إلغاء مهمّة الالتقاط الكامل — **لا `mode/set idle`**.
   *
   * الحلقة تعيش في الـservice worker ويملكها `AbortController` هناك، فلا يوقفها
   * تبديلُ وضعٍ في الصفحة. `fullpage/cancel` هي التي تصل إليه — وهي رسالة إلى
   * الخلفية (`send`) لا إلى التبويب (`sendToTab`).
   */
  const cancelJob = () => {
    void send('fullpage/cancel', undefined).then(() => window.close())
  }

  const openPage = (page: 'library' | 'settings' | 'onboarding' | 'editor') => {
    void send('page/open', { page }).then(() => window.close())
  }

  /** يفتح المحرر **على لقطة بعينها** — المعرّف يمرّ استعلامًا تبنيه الخلفية. */
  const openEditor = (captureId: string) => {
    void send('page/open', { page: 'editor', params: { capture: captureId } }).then(() =>
      window.close(),
    )
  }

  const copySuccess = () => {
    if (!success?.id) return
    void copyCaptureImage(success.id).then((outcome) =>
      setNotice(
        outcome === 'copied'
          ? 'نُسخت اللقطة إلى الحافظة.'
          : outcome === 'unsupported'
            ? 'الحافظة تقبل PNG وحدها — افتح اللقطة في المحرّر لنسخها.'
            : 'تعذّر النسخ إلى الحافظة. اللقطة محفوظة في المكتبة.',
      ),
    )
  }

  // بترتيب القراءة في الإطار: تعليق، مقارنة، نسخ، مشاركة. والمشاركة المحلّية محرّكها في
  // `STAGES/10`، فتُعرض معطَّلة بسببها لا زرًّا صامتًا.
  const successActions: SuccessAction[] = [
    {
      icon: 'pen',
      label: 'تعليق',
      onClick: () => (success?.id ? openEditor(success.id) : openPage('editor')),
    },
    { icon: 'split-view', label: 'مقارنة', onClick: () => runTool('compare') },
    { icon: 'copy', label: 'نسخ', onClick: copySuccess, soon: !success?.id },
    { icon: 'share', label: 'مشاركة', onClick: () => undefined, soon: true },
  ]

  let body: JSX.Element

  if (failure) {
    body =
      failure.kind === 'cancelled' ? (
        <Cancelled
          onRestart={() => (failure.retry ? runTool(failure.retry) : setFailure(null))}
          onClose={() => window.close()}
        />
      ) : (
        <CaptureError
          title={failure.title}
          message={failure.message}
          onRetry={() => (failure.retry ? runTool(failure.retry) : setFailure(null))}
        />
      )
  } else if (success) {
    body = (
      <Success
        thumbUrl={successThumb}
        actions={successActions}
        notice={notice}
        onOpenLibrary={() => openPage('library')}
      />
    )
  } else {
    switch (stateName) {
      case 'restricted':
        body = context.restriction.injectable ? (
          <div class={styles.body} />
        ) : (
          <Restricted
            reason={context.restriction.reason}
            onManageSites={() =>
              void send('page/open', {
                page: 'settings',
                params: { section: 'privacy', view: 'excluded-sites' },
              }).then(() => window.close())
            }
          />
        )
        break

      case 'offline':
        if (dismissedOffline) {
          body = (
            <Default
              onTool={runTool}
              recent={loaded.recent}
              onOpenRecent={openEditor}
              onOpenLibrary={() => openPage('library')}
            />
          )
        } else {
          body = (
            <Offline
              onContinue={() => setDismissedOffline(true)}
              onRetry={() => setOnline(navigator.onLine)}
            />
          )
        }
        break

      case 'first-run':
        body = (
          <FirstRun
            onStart={() => {
              void send('settings/patch', {
                patch: { onboarding: { completed: true, completedAt: Date.now() } },
              }).then(() => setFirstRunDone(true))
            }}
          />
        )
        break

      case 'permission':
        body = (
          <Permission
            origin={originLabel}
            onAllowOrigin={() => {
              const pattern = originPatternFor(loaded.origin)
              if (!pattern) return
              void requestHostPermission([pattern]).then(() => window.close())
            }}
            onAllowOnce={() => window.close()}
          />
        )
        break

      case 'capturing':
        body = context.job ? (
          <Capturing
            done={liveProgress?.done ?? context.job.done}
            total={liveProgress?.total ?? context.job.total}
            onCancel={cancelJob}
          />
        ) : (
          <div class={styles.body} />
        )
        break

      case 'inspect-active':
        body = (
          <LiveMode
            tone="inspect"
            title="وضع الفحص مُفعّل"
            hint="مرّر فوق أي عنصر في الصفحة لفحصه. تفاصيله في لوح الفحص داخل الصفحة."
            exitLabel="إنهاء الفحص"
            onExit={exitLiveMode}
          />
        )
        break

      case 'colors':
        body = (
          <LiveMode
            tone="colors"
            title="وضع اختيار اللون مُفعّل"
            hint="مرّر فوق أي نقطة في الصفحة والتقط لونها. قيمه وصيغه في لوح الألوان داخل الصفحة."
            exitLabel="إنهاء الاختيار"
            onExit={exitLiveMode}
          />
        )
        break

      default:
        body = (
          <Default
            onTool={runTool}
            recent={loaded.recent}
            onOpenRecent={openEditor}
            onOpenLibrary={() => openPage('library')}
          />
        )
    }
  }

  const dataState = failure ? failure.kind : success ? 'success' : stateName

  return (
    <div class={styles.shell} data-popup-state={dataState}>
      <Header status={status} onSettings={() => openPage('settings')} />
      <div class={styles.body}>{body}</div>
      <Footer
        version={chrome.runtime.getManifest().version}
        onOpenLibrary={() => openPage('library')}
      />
    </div>
  )
}
