import { Icon, type IconName } from '@/ui/icons/Icon'

import type { JSX } from 'preact'

export type NoticeTone = 'success' | 'info' | 'danger'

/** إشعار داخل الطبقة — ما حدث، وتفصيله، وفعلٌ تالٍ اختياري. */
export interface OverlayNotice {
  readonly tone: NoticeTone
  readonly title: string
  readonly detail?: string
  readonly action?: { readonly label: string; readonly run: () => void }
}

const TONE_ICON: Readonly<Record<NoticeTone, IconName>> = {
  success: 'check',
  info: 'info',
  danger: 'alert',
}

/**
 * إشعار الأدوات فوق الصفحة — بمواصفة `Toast` في الصفحات، كما في `capture / success`
 * (`302:332`) و`inspect / cancelled` (`303:20779`) و`colors / error` (`303:22356`): زجاج
 * بحدّ، ودائرة الدرجة، وسطران، وفعل ثانوي اختياري، وإغلاق. ترتيب DOM ترتيب القراءة.
 *
 * **الجسم لا يلتقط المؤشِّر، والزرّان وحدهما يلتقطانه** (`overlay.css`): الإشعار يمرّ فوق
 * صفحةٍ قد تكون أداةٌ تقرأ ما تحت المؤشِّر فيها، فلا يحجب منها إلا زرّيه.
 */
export function NoticeToast({
  notice,
  onClose,
}: {
  notice: OverlayNotice
  onClose: () => void
}): JSX.Element {
  const danger = notice.tone === 'danger'
  return (
    <div
      class="rasd-ov-toast"
      data-tone={notice.tone}
      // الفشل يُقاطع قارئ الشاشة، والباقي ينتظر دوره — كإشعار الصفحات.
      role={danger ? 'alert' : 'status'}
      aria-live={danger ? 'assertive' : 'polite'}
    >
      <span class="rasd-ov-toast-badge" aria-hidden="true">
        <Icon name={TONE_ICON[notice.tone]} size="xs" />
      </span>
      <span class="rasd-ov-toast-text">
        <span class="rasd-ov-toast-title">{notice.title}</span>
        {notice.detail ? <span class="rasd-ov-toast-detail">{notice.detail}</span> : null}
      </span>
      {notice.action ? (
        <button type="button" class="rasd-ov-toast-action" onClick={notice.action.run}>
          {notice.action.label}
        </button>
      ) : null}
      <button
        type="button"
        class="rasd-ov-tool rasd-ov-tool-close"
        aria-label="إغلاق"
        onClick={onClose}
      >
        <Icon name="close" size="xs" />
      </button>
    </div>
  )
}
