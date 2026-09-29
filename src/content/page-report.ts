import type { Mode } from '@/shared/modes'

/**
 * **مغادرة المستند تُبلِّغ الخمول.** التنقّل لا يمرّ بتفكيك الطبقة، فكانت الجلسة المبلَّغة
 * (`session.modes`، ومعها الأيقونة النشطة في شريط الأدوات) تبقى على صفحةٍ لم تعد فيها طبقة.
 *
 * `pagehide` يقع على المغادرة الحقيقية لا على تغيّر مسار داخل تطبيق صفحة واحدة. والصفحة التي
 * تعود من ذاكرة الرجوع (`pageshow` بـ`persisted`) تعود بطبقتها كما كانت، فيُعاد تبليغ وضعها.
 */
export function reportAcrossPageLifecycle(
  win: Window,
  report: (mode: Mode) => void,
  current: () => Mode,
): () => void {
  const onPageHide = () => report('idle')
  const onPageShow = (e: Event) => {
    if ((e as PageTransitionEvent).persisted) report(current())
  }
  win.addEventListener('pagehide', onPageHide)
  win.addEventListener('pageshow', onPageShow)
  return () => {
    win.removeEventListener('pagehide', onPageHide)
    win.removeEventListener('pageshow', onPageShow)
  }
}
