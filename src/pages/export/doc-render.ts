/**
 * رسم الصفحات النصّية على قماش وخبزها — الوجه المتصفّحي لـ`modules/export/pdf-document.ts`.
 *
 * التخطيط هناك يُختبر بلا متصفّح، وهنا ما لا يُختبر إلا فيه: الخطوط محمَّلةً، والتشكيل العربي، وعزل اللاتيني
 * داخل العربي بـ`direction`. ثمّ تخرج كل صفحة من البوّابة الواحدة (`bakeRaster`) لا من `convertToBlob` هنا.
 *
 * **والورقة فاتحة دائمًا** مهما كانت سمة الواجهة: ما يُطبع ويُرسل لا يحمل سمة من صدّره — كما تُثبَّت لوحة
 * التعليق داكنةً عند الخبز (`editor/colors.ts`)، فالقيم من التوكنز بوضعها الفاتح لا من CSS الصفحة.
 */

import { bakeRaster, type ExportBytes } from '@/modules/editor/bake'
import {
  DOC_FONTS,
  layoutDocument,
  type DocBlock,
  type DocFont,
  type DocInk,
  type DocOp,
  type DocTone,
} from '@/modules/export/pdf-document'
import { TEXT_PAGE_DENSITY, textPagePixels, type PageBox } from '@/modules/export/pdf-layout'
import { ok, type Result } from '@/shared/result'
import { resolveColor } from '@/tokens/tokens'

import { buildRenderStyle } from '../editor/colors'
import { createBakeSurface } from '../editor/export'

const INK: Readonly<Record<DocInk, string>> = {
  primary: resolveColor('text/primary', 'light'),
  secondary: resolveColor('text/secondary', 'light'),
  tertiary: resolveColor('text/tertiary', 'light'),
}

const TONE: Readonly<Record<DocTone, { readonly fill: string; readonly ink: string }>> = {
  danger: {
    fill: resolveColor('status/danger/surface', 'light'),
    ink: resolveColor('status/danger/fg', 'light'),
  },
  warning: {
    fill: resolveColor('status/warning/surface', 'light'),
    ink: resolveColor('status/warning/fg', 'light'),
  },
  success: {
    fill: resolveColor('status/success/surface', 'light'),
    ink: resolveColor('status/success/fg', 'light'),
  },
  neutral: {
    fill: resolveColor('surface/sunken', 'light'),
    ink: resolveColor('text/secondary', 'light'),
  },
}

const PAPER = resolveColor('surface/default', 'light')
const RULE = resolveColor('border/subtle', 'light')
const BADGE_FILL = resolveColor('surface/sunken', 'light')

/** عائلتا الخطّ نفساهما في المحرّر — تُحمَّلان في كل صفحة إضافة. */
const STYLE = buildRenderStyle()

function fontCss(font: DocFont, density: number): string {
  const spec = DOC_FONTS[font]
  const family = spec.family === 'mono' ? STYLE.monoFamily : STYLE.textFamily
  return `${spec.weight} ${spec.size * density}px ${family}`
}

/**
 * **الخطوط قبل القياس:** قياسٌ قبل تحميل Cairo يلفّ الأسطر بعرض خطٍّ احتياطي، فتخرج الصفحة بأسطرٍ أقصر
 * أو أطول ممّا ستُرسم به. `document.fonts.load` لكل وزن مستعمل، لا `ready` وحدها: الخطّ الذي لم تطلبه
 * الصفحة بعد لا يُحمَّل من تلقاء نفسه.
 */
async function loadFonts(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return
  const wanted = new Set(Object.keys(DOC_FONTS).map((font) => fontCss(font as DocFont, 1)))
  await Promise.all([...wanted].map((css) => document.fonts.load(css).catch(() => [])))
}

type Ctx = OffscreenCanvasRenderingContext2D

function drawOp(ctx: Ctx, op: DocOp): void {
  switch (op.kind) {
    case 'text':
      ctx.font = fontCss(op.font, 1)
      ctx.fillStyle = INK[op.ink]
      ctx.direction = op.dir
      // المحاذاة فيزيائية هنا: «البداية» في صفحة عربية حافّتها اليمنى أيًّا كان اتجاه السطر نفسه.
      ctx.textAlign = op.align === 'start' ? 'right' : 'left'
      ctx.textBaseline = 'alphabetic'
      ctx.fillText(op.text, op.x, op.y)
      return
    case 'rule':
      ctx.fillStyle = RULE
      ctx.fillRect(op.x0, op.y, op.x1 - op.x0, 0.75)
      return
    case 'badge':
      ctx.fillStyle = BADGE_FILL
      ctx.beginPath()
      ctx.arc(op.cx, op.cy, op.r, 0, Math.PI * 2)
      ctx.fill()
      ctx.font = fontCss('chip', 1)
      ctx.fillStyle = INK.primary
      ctx.direction = 'rtl'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(op.text, op.cx, op.cy)
      return
    case 'chip': {
      const tone = TONE[op.tone]
      ctx.fillStyle = tone.fill
      ctx.beginPath()
      ctx.roundRect(op.x, op.y, op.w, op.h, op.h / 2)
      ctx.fill()
      ctx.font = fontCss('chip', 1)
      ctx.fillStyle = tone.ink
      ctx.direction = 'rtl'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(op.text, op.x + op.w / 2, op.y + op.h / 2)
      return
    }
  }
}

/**
 * يرسم الكتل صفحاتٍ ويخبز كلًّا منها PNG معتمًا — بترتيبها.
 *
 * يفشل بالاسم: قماشٌ لا يُنشأ، أو خبزٌ يُرفض، أو إلغاء — ولا يُعيد نصف القائمة.
 */
export async function bakeDocPages(
  blocks: readonly DocBlock[],
  box: PageBox,
  signal?: { readonly aborted: boolean },
): Promise<Result<ExportBytes[]>> {
  await loadFonts()
  const probe = new OffscreenCanvas(1, 1).getContext('2d')
  const measure = (text: string, font: DocFont): number => {
    if (!probe) return text.length * DOC_FONTS[font].size * 0.55
    probe.font = fontCss(font, 1)
    return probe.measureText(text).width
  }

  const pages = layoutDocument(blocks, box, measure)
  const pixels = textPagePixels(box)
  const out: ExportBytes[] = []

  for (const page of pages) {
    const canvas = new OffscreenCanvas(pixels.width, pixels.height)
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) {
      return { ok: false, error: { code: 'handler-failed', message: 'تعذّر رسم صفحة PDF.' } }
    }
    ctx.fillStyle = PAPER
    ctx.fillRect(0, 0, pixels.width, pixels.height)
    ctx.scale(TEXT_PAGE_DENSITY, TEXT_PAGE_DENSITY)
    for (const op of page.ops) drawOp(ctx, op)

    const baked = await bakeRaster({
      width: pixels.width,
      height: pixels.height,
      format: 'png',
      surface: createBakeSurface({ opaque: true }),
      sliceSource: async (rect) => {
        const bitmap = await createImageBitmap(canvas, rect.x, rect.y, rect.width, rect.height)
        return {
          image: bitmap,
          width: bitmap.width,
          height: bitmap.height,
          close: () => bitmap.close(),
        }
      },
      ...(signal ? { signal } : {}),
    })
    canvas.width = 0
    canvas.height = 0
    if (!baked.ok) return baked
    out.push(baked.value.blob)
  }

  return ok(out)
}
