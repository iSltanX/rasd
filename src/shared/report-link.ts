/**
 * «أبلغ عن المشكلة» من أي رسالة خطأ — يفتح نافذة البلاغ في الإعدادات (`?section=about&report=1`) مملوءةً بالأداة
 * المتأثّرة ورمز الخطأ ([ADR 0050](../../Docs/ADR/0050-problem-reports.md)).
 *
 * **الأداة والرمز معرّفان تقنيّان لا نصّ:** يُقبلان بشكلٍ ضيّق هنا وفي جسم البلاغ معًا، فرابطٌ مصنوع لا يملأ النموذج
 * بعنوان صفحة أو رابط. ولا شيء يُرسَل بفتح النافذة — الإرسال بتأكيد المستخدم وحده.
 */

import { PAGE_PATHS } from './page-paths'

export interface ReportContext {
  /** معرّف الأداة: `full-page` · `library` · `data` … */
  readonly tool?: string | null
  /** رمز الخطأ كما في `RasdError.code` أو ما يقابله. */
  readonly code?: string | null
}

const TOOL = /^[a-z][a-z0-9-]{0,31}$/u
const CODE = /^[A-Za-z0-9_.-]{1,64}$/u

export function reportParams(context: ReportContext = {}): Record<string, string> {
  const params: Record<string, string> = { section: 'about', report: '1' }
  if (context.tool && TOOL.test(context.tool)) params.tool = context.tool
  if (context.code && CODE.test(context.code)) params.code = context.code
  return params
}

/** طلب البلاغ من رابط الإعدادات، أو `null` حين لا يُطلب. */
export function readReportRequest(
  search: string,
): { tool: string | null; code: string | null } | null {
  const params = new URLSearchParams(search)
  if (params.get('report') !== '1') return null
  const tool = params.get('tool')
  const code = params.get('code')
  return {
    tool: tool && TOOL.test(tool) ? tool : null,
    code: code && CODE.test(code) ? code : null,
  }
}

export function reportUrl(context: ReportContext = {}): string {
  return chrome.runtime.getURL(
    `${PAGE_PATHS.settings}?${new URLSearchParams(reportParams(context)).toString()}`,
  )
}

/** من صفحة إضافة أو النافذة المنبثقة: تبويبٌ جديد على نافذة البلاغ. */
export function openReport(context: ReportContext = {}): void {
  void chrome.tabs.create({ url: reportUrl(context) })
}
