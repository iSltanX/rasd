/**
 * نقطة دخول الطبقة داخل الصفحة.
 *
 * تُحقن يدويًا عبر `chrome.scripting` بعد إيماءة المستخدم — لا
 * `content_scripts` في البيان، وهو أهمّ قرار خصوصية في المشروع
 * ([ADR 0005](../../ADR/0005-manual-injection.md)).
 *
 * ترتيب التفكيك معكوس ترتيب التركيب عمدًا: المستمعات أوّلًا ثم المضيف
 * أخيرًا، حتى لا يُطلَق معالج على مضيف أُزيل.
 */

import { type Mode } from '@/shared/modes'
import { errWith, ok, type RasdError, type Result } from '@/shared/result'

import { readSpace, watchDpr, type CoordSpace } from './coords'
import { blockedFrames, isTopFrame } from './frames'
import { adoptTeardown, mountHost, type OverlayHost } from './host'
import { createModeManager, type ModeManager } from './mode-manager'
import { startPersistence, type Persistence } from './persistence'
import { installShortcuts, type ShortcutAction } from './shortcuts'
import { startSync, type SyncLoop } from './sync'

export interface OverlaySession {
  readonly host: OverlayHost
  readonly modes: ModeManager
  readonly sync: SyncLoop
  readonly persistence: Persistence
  /** لقطة الإحداثيات الحالية — تُحدَّث مرّة لكل إطار. */
  space(): CoordSpace
  teardown(): void
}

export interface StartOptions {
  doc?: Document
  /** وضع البداية — عادةً `idle`، ويأتي من الأمر الذي حقننا. */
  initialMode?: Mode
  /** يُستدعى بعد كل إطار مزامنة، بعد تحديث اللقطة. */
  onFrame?: (space: CoordSpace) => void
  /** أمر لا يملك الطبقة معالجًا له بعد (`palette` مثلًا — المرحلة 7). */
  onAction?: (action: ShortcutAction) => void
}

/**
 * يشغّل الطبقة في هذا المستند.
 *
 * الإطارات غير العليا **لا ترسم**: نسخة الشيفرة تعمل فيها (الحقن
 * `allFrames: true`) لكنها تبقى صامتة، وإلا ظهرت طبقة داخل كل إطار.
 */
export async function startOverlay(
  options: StartOptions = {},
): Promise<Result<OverlaySession, RasdError>> {
  const doc = options.doc ?? document
  const win = doc.defaultView
  if (!win) return errWith('unknown', 'لا نافذة لهذا المستند')

  if (!isTopFrame(win)) {
    return errWith('cancelled', 'إطار داخلي — الرسم للإطار الأعلى وحده')
  }

  const mounted = await mountHost(doc)
  if (!mounted.ok) return mounted
  const host = mounted.value

  const modes = createModeManager(options.initialMode ?? 'idle')

  let space = readSpace(win)

  const sync = startSync({
    doc,
    onFrame: () => {
      // كل قراءة تخطيط تحدث هنا وحدها، مرّة لكل إطار — لا داخل معالج تمرير.
      space = readSpace(win)
      options.onFrame?.(space)
    },
  })

  const stopDpr = watchDpr(() => sync.invalidate('dpr'), win)

  const persistence = startPersistence({
    doc,
    isAttached: () => host.hostEl.isConnected,
    reattach: () => host.reassert(),
    onRouteChange: () => {
      // تغيّر المسار يُنهي أي وضع نشط: العنصر المحدَّد لم يعد موجودًا.
      modes.escape()
      host.reassert()
      sync.invalidate('manual')
    },
  })

  const removeShortcuts = installShortcuts({
    doc,
    // `Esc` يُبتلع فقط حين يكون له معنى عندنا — وإلا فهو مفتاح الصفحة.
    shouldSwallowEscape: () => modes.mode.value !== 'idle',
    onAction: (action) => {
      switch (action.kind) {
        case 'mode':
          modes.set(action.mode)
          break
        case 'escape':
          if (modes.mode.value !== 'idle') modes.escape()
          break
        default:
          options.onAction?.(action)
      }
    },
  })

  let torn = false
  const teardown = () => {
    if (torn) return
    torn = true
    // الترتيب معكوس ترتيب التركيب: المستمعات ومراقب البقاء أوّلًا، وإلا
    // رأى المراقبُ المضيفَ يختفي فأعاد إلحاقه في اللحظة نفسها.
    removeShortcuts()
    stopDpr()
    persistence.stop()
    sync.stop()
    modes.dispose()
    host.teardown()
  }

  // من الآن، أي نداء تفكيك على علامة النافذة يوقف الجلسة كاملةً لا المضيف
  // وحده — وهو ما يجعل التفكيك نظيفًا أيًّا كان من طلبه.
  adoptTeardown(teardown, doc)

  return ok({
    host,
    modes,
    sync,
    persistence,
    space: () => space,
    teardown,
  })
}

export { readSpace, blockedFrames, isTopFrame }
export type { CoordSpace, OverlayHost, ModeManager }
