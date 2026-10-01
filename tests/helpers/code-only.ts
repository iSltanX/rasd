import {
  type CommentRange,
  createSourceFile,
  getLeadingCommentRanges,
  getTrailingCommentRanges,
  type Node,
  ScriptKind,
  ScriptTarget,
  SyntaxKind,
} from 'typescript'

/**
 * **الشيفرة بلا تعليقاتها — بمحلّل TypeScript لا بتعبيرٍ نمطي** (`STAGES/25`).
 *
 * كان مسحا `src/` (بدائيّات الشبكة ومصابّ HTML) يحذفان التعليقات بتعبيرين نمطيين، فيُخفيان شيفرةً حقيقية: `/*` داخل
 * سلسلةٍ (`'https://x/*'` — وفي `src/` ثلاثٌ منها) يبتلع ما بعدها حتى أوّل `*\/`، و`//` داخل سلسلةٍ لا يسبقه `:`
 * (`'a//b'`) يقطع بقيّة السطر. رصدتهما المراجعة المستقلّة وأثبتتهما بتشغيل.
 *
 * فالتعليقات تُقرأ من شجرة المحلّل: لكل رمزٍ تعليقاته السابقة واللاحقة، والسلاسل والقوالب والتعابير النمطية رموزٌ
 * لا تُفتَّش. ونصّ JSX يُستثنى: محتواه نصٌّ لا تعليق ولو بدأ بـ`//`. والتعليق يُستبدل بمسافاتٍ بطوله فتبقى المواضع.
 */
export function codeOnly(source: string, fileName = 'source.tsx'): string {
  const kind = /\.(tsx|jsx)$/u.test(fileName) ? ScriptKind.TSX : ScriptKind.TS
  const file = createSourceFile(fileName, source, ScriptTarget.Latest, true, kind)
  const ranges = new Map<number, number>()
  const collect = (list: CommentRange[] | undefined) => {
    for (const r of list ?? []) ranges.set(r.pos, r.end)
  }
  // نصّ JSX يبدأ حيث ينتهي `>` قبله، فقراءة «التعليق اللاحق» هناك تقرأ النصّ نفسه — فما يبدأ داخله يُسقَط.
  const jsxText: [number, number][] = []
  const visit = (node: Node) => {
    if (node.kind === SyntaxKind.JsxText) jsxText.push([node.getFullStart(), node.getEnd()])
    else {
      collect(getLeadingCommentRanges(source, node.getFullStart()))
      collect(getTrailingCommentRanges(source, node.getEnd()))
    }
    for (const child of node.getChildren(file)) visit(child)
  }
  visit(file)
  for (const pos of [...ranges.keys()]) {
    if (jsxText.some(([from, to]) => pos >= from && pos < to)) ranges.delete(pos)
  }
  let out = source
  for (const [pos, end] of ranges) {
    out = out.slice(0, pos) + ' '.repeat(end - pos) + out.slice(end)
  }
  return out
}
