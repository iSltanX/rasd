/**
 * روابط `modulepreload` لصفحات الإضافة — لمخطّط الاستيراد الساكن وحده.
 *
 * **العلّة، مقيسةً في `STAGES/04`.** `build.modulePreload: false` في `vite.config.ts` لازمٌ لسببه
 * (مساعد `__vitePreload` يلمس `window` فيكسر أوّل استيراد ديناميكي في الـservice worker)، لكنه يحذف
 * معه روابط التحميل المسبق من HTML. فتُجلب قطع الصفحة **على ثلاث جولات متتابعة**: الوحدة الأولى،
 * ثمّ ما تستورده حين تُترجَم، ثمّ ما يستورده ذلك. قِيس في أثر Chrome لفتح النافذة بإبطاء ستّة أضعاف:
 * نحو 26ms من 48 قبل تقييم الحزمة انتظارُ جولات، وعلى عدّاء CI بنواتين كانت المسافة من تحليل
 * المستند إلى تقييم الحزمة 36ms والميزانية كلّها 100ms.
 *
 * فهذا الملحق يضيف إلى HTML كل صفحة رابطًا لكل قطعة في مخطّطها الساكن، فتُجلب كلّها في جولة واحدة
 * مع الوحدة الأولى. **ولا يمسّ الاستيراد الديناميكي** — لا مساعد يُحقن، والـservice worker بلا HTML.
 */

import type { IndexHtmlTransformContext, Plugin } from 'vite'

type Bundle = NonNullable<IndexHtmlTransformContext['bundle']>

/** كل قطعة يبلغها المدخل باستيراد ساكن، مباشرةً أو عبر غيرها — بلا المدخل نفسه وبلا تكرار. */
export function staticImportGraph(entry: string, bundle: Bundle): string[] {
  const seen = new Set<string>()
  const visit = (file: string): void => {
    const chunk = bundle[file]
    if (!chunk || chunk.type !== 'chunk') return
    for (const dep of chunk.imports) {
      if (seen.has(dep) || dep === entry) continue
      seen.add(dep)
      visit(dep)
    }
  }
  visit(entry)
  return [...seen]
}

export function modulePreloadLinks(): Plugin {
  return {
    name: 'rasd:module-preload',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        if (!ctx.bundle || !ctx.chunk) return
        return staticImportGraph(ctx.chunk.fileName, ctx.bundle).map((file) => ({
          tag: 'link',
          attrs: { rel: 'modulepreload', crossorigin: true, href: `/${file}` },
          injectTo: 'head' as const,
        }))
      },
    },
  }
}
