/**
 * معامل العنوان الذي يفتح نافذة المشاركة مع المحرّر — تبنيه النافذة ويقرؤه المحرّر. ملفٌّ وحده بلا استيراد:
 * النافذة تبنيه، فلا تحمل حزمتها ما يحمله محرّك المشاركة.
 */
export const SHARE_PARAM = 'share'

/** هل طُلبت المشاركة في عنوان المحرّر؟ */
export function shareRequested(href: string): boolean {
  try {
    return new URL(href).searchParams.get(SHARE_PARAM) === '1'
  } catch {
    return false
  }
}
