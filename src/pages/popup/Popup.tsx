import { useEffect, useMemo, useState } from 'preact/hooks'

import { CHANNELS, openChannel, send, sendToTab, type ToolName } from '@/shared/messaging'
import { originPatternFor, requestHostPermission } from '@/shared/permissions'
import { selectPopupState, type PopupContext, type PopupStateName } from '@/shared/popup-state'
import { checkInjectable } from '@/shared/restricted'

import { loadPopupContext, loadRecent, type RecentEntry } from './context'
import { Footer } from './parts/Footer'
import { Header } from './parts/Header'
import styles from './Popup.module.css'
import { Capturing } from './views/Capturing'
import { Colors } from './views/Colors'
import { Default } from './views/Default'
import { FirstRun } from './views/FirstRun'
import { InspectActive } from './views/InspectActive'
import { Offline } from './views/Offline'
import { Permission } from './views/Permission'
import { Restricted } from './views/Restricted'
import { Success, type SuccessAction } from './views/Success'

import type { JSX } from 'preact'

interface Loaded {
  tabId: number
  context: PopupContext
  origin: string
  recent: RecentEntry[]
}

const STATUS_BY_STATE: Record<PopupStateName, (l: Loaded) => string> = {
  default: (l) => l.origin,
  restricted: (l) =>
    l.context.restriction.injectable ? '' : checkInjectable(l.origin).injectable ? '' : '',
  offline: () => 'لا يوجد اتصال',
  'first-run': () => 'جاهز في هذه الصفحة',
  permission: () => 'لم يُمنح الإذن',
  capturing: (l) =>
    l.context.job ? `${l.context.job.kind} — ${l.context.job.done}/${l.context.job.total}` : '',
  'inspect-active': () => 'مرّر فوق أي عنصر لفحصه',
  colors: () => 'مرّر فوق أي نقطة والتقط لونها',
}

export function Popup(): JSX.Element | null {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [dismissedOffline, setDismissedOffline] = useState(false)
  const [success, setSuccess] = useState<{ width: number; height: number; id?: string } | null>(
    null,
  )
  const [liveProgress, setLiveProgress] = useState<{ done: number; total: number } | null>(null)
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

  // اشتراك حيّ في قناة المهمّة — لا يُنتج شيئًا قبل محرّك الالتقاط الكامل
  // (المرحلة 10)، لكنّ السلك حقيقي: تقدّم فعلي يحرّك شريط `Capturing`،
  // و`done` بأبعاد صالحة هو المسار الوحيد نحو `success` (انظر التعليق أعلى
  // `PopupContext` في `popup-state.ts` — الحالة عمدًا ليست ناتج الاختيار
  // الساكن، بل حدثًا لحظيًّا تعرضه هذه الشاشة فوقه).
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
        }
      },
    })
    return () => channel.close()
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id) return
      const [partial, recent] = await Promise.all([loadPopupContext(tab.id, tab.url), loadRecent()])
      if (cancelled) return
      setLoaded({
        tabId: tab.id,
        context: { ...partial, online: navigator.onLine },
        origin: tab.url ?? '',
        recent,
      })
    })()
    return () => {
      cancelled = true
    }
  }, [])

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

  const stateName: PopupStateName = success ? 'default' : selectPopupState(context)
  const status = success ? 'حُفظت اللقطة' : STATUS_BY_STATE[stateName]({ ...loaded, context })

  const runTool = (tool: ToolName) => {
    void send('tool/activate', { tool, tabId: loaded.tabId }).then(() => window.close())
  }

  const exitLiveMode = () => {
    void sendToTab({ tabId: loaded.tabId }, 'mode/set', { mode: 'idle' }).then(() => window.close())
  }

  const openPage = (page: 'library' | 'settings' | 'onboarding' | 'editor') => {
    void send('page/open', { page }).then(() => window.close())
  }

  /**
   * يفتح المحرر **على لقطة بعينها**.
   *
   * المعرّف كان يُسقَط: `Default` يمرّره في `onOpenRecent(record.id)` منذ
   * المرحلة 7، والمستقبِل يتجاهله. فالمحرر — حين وُجد — كان سيُفتح فارغًا
   * دائمًا. والمعامل يمرّ استعلامًا يبنيه الخلفية.
   */
  const openEditor = (captureId: string) => {
    void send('page/open', { page: 'editor', params: { capture: captureId } }).then(() =>
      window.close(),
    )
  }

  const successActions: SuccessAction[] = [
    { icon: 'split-view', label: 'مقارنة', onClick: () => runTool('compare') },
    {
      icon: 'pen',
      label: 'تعليق',
      onClick: () => (success?.id ? openEditor(success.id) : openPage('editor')),
    },
    { icon: 'share', label: 'رابط مشاركة', onClick: () => undefined },
    { icon: 'copy', label: 'نسخ', onClick: () => undefined },
  ]

  let body: JSX.Element

  if (success) {
    body = (
      <Success
        width={success.width}
        height={success.height}
        actions={successActions}
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
            onManageSites={() => openPage('settings')}
            // لا صفحة شرح مخصَّصة بعد — لا يُدَّعى تنقّل لا وجهة له.
            onWhy={() => undefined}
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
            onTour={() => {
              void send('settings/patch', {
                patch: { onboarding: { completed: true, completedAt: Date.now() } },
              })
              openPage('onboarding')
            }}
            onSkip={() => {
              void send('settings/patch', {
                patch: { onboarding: { completed: true, completedAt: Date.now() } },
              }).then(() => window.close())
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
            kind={context.job.kind}
            done={liveProgress?.done ?? context.job.done}
            total={liveProgress?.total ?? context.job.total}
            onCancel={exitLiveMode}
          />
        ) : (
          <div class={styles.body} />
        )
        break

      case 'inspect-active':
        body = <InspectActive onExit={exitLiveMode} />
        break

      case 'colors':
        body = <Colors onExit={exitLiveMode} />
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

  return (
    <div class={styles.shell} data-popup-state={success ? 'success' : stateName}>
      <Header status={status} onSettings={() => openPage('settings')} />
      <div class={styles.body}>{body}</div>
      <Footer
        version={chrome.runtime.getManifest().version}
        onOpenLibrary={() => openPage('library')}
      />
    </div>
  )
}
