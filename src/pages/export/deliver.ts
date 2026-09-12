/**
 * تسليم الملفّ — الطريقان، وأيّهما يُسلَك.
 *
 * `modules/export/download.ts` يقرّر **أيّ طريق**؛ وهذا الملفّ يمشيه. والفصل
 * مقصود: القرار يُختبَر بلا متصفّح، والمشي لا يحمل قرارًا.
 *
 * **والطريقان ليسا بديلين متكافئين:**
 *
 * - `managed` عبر `chrome.downloads.download` — يعطي `saveAs` فيختار المستخدم
 *   المجلّد والاسم، ويعطي مُعرِّفًا يُفتَح به المجلّد لاحقًا. ويحتاج الصلاحية.
 * - `anchor` عبر `<a download>` — ينزل إلى المجلّد الافتراضي بالاسم المقترَح
 *   بلا سؤال. لا يحتاج شيئًا، ولا يُعيد مُعرِّفًا، فلا «افتح المجلّد» بعده.
 *
 * والفرق يُعلَن للمستخدم (`DEGRADE_NOTE`) ولا يُبتلع.
 */

import type { DownloadRoute } from '@/modules/export/download'

export interface Delivered {
  readonly route: DownloadRoute
  /** مُعرِّف تنزيل المتصفّح — `null` على مسار المرساة. */
  readonly downloadId: number | null
  /** المسار كما يعرضه المتصفّح، أو الاسم المقترَح وحده على المرساة. */
  readonly shown: string
}

/**
 * ينزّل عبر واجهة المتصفّح.
 *
 * **`saveAs: true` مقصودة**: هي ما يشتريه المستخدم بمنح الصلاحية — نصّ
 * المبرِّر في `permission-policy.ts` يَعِد حرفيًّا بـ«مجلّد التنزيلات باسم
 * تختاره»، وتنزيلٌ صامت إلى المجلّد الافتراضي كان يُنجز الوعد نصفه.
 */
async function viaDownloads(url: string, filename: string): Promise<Delivered> {
  const downloadId = await chrome.downloads.download({ url, filename, saveAs: true })
  return { route: 'managed', downloadId, shown: filename }
}

/**
 * ينزّل عبر مرساة.
 *
 * **والمرساة تُركَّب وتُنقَر وتُزال في النبضة نفسها.** تركُها في المستند
 * يُبقي `objectURL` حيًّا مرجوعًا من عنصرٍ لا يراه أحد؛ والمستدعي هو من
 * يملك تحرير العنوان لأنه من أنشأه.
 */
function viaAnchor(url: string, filename: string, doc: Document): Delivered {
  const a = doc.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  doc.body.appendChild(a)
  a.click()
  a.remove()
  return { route: 'anchor', downloadId: null, shown: filename }
}

export interface DeliverInput {
  readonly route: DownloadRoute
  readonly url: string
  readonly filename: string
  readonly doc?: Document
}

/**
 * يسلّم الملفّ بالطريق المقرَّر.
 *
 * **وفشل الطريق المُدار يتدهور إلى المرساة ولا يُفشل التصدير.** الصلاحية قد
 * تُسحَب بين الفحص والنداء، وقد يرفض المتصفّح الحفظ لسببٍ خاصّ به — وفي
 * الحالتين الملفّ موجود والمستخدم ينتظره، فالسقوط إلى الطريق الذي لا يحتاج
 * شيئًا أصدق من رسالة فشل.
 */
export async function deliver(input: DeliverInput): Promise<Delivered> {
  const doc = input.doc ?? document
  if (input.route === 'anchor') return viaAnchor(input.url, input.filename, doc)

  try {
    return await viaDownloads(input.url, input.filename)
  } catch {
    return viaAnchor(input.url, input.filename, doc)
  }
}

/**
 * يفتح مجلّد الملفّ المنزَّل.
 *
 * يُستدعى من زرّ «افتح المجلّد» في `export / done`، ولا يظهر الزرّ أصلًا بلا
 * `downloadId` — فالمرساة لا تُعطي واحدًا.
 */
export function revealDownload(downloadId: number): void {
  try {
    chrome.downloads.show(downloadId)
  } catch {
    // لا شيء يُقال: الزرّ اختياري والملفّ منزَّل على أي حال.
  }
}
