#!/usr/bin/env node
/**
 * صور صفحة رصد في موقع المالك (`bysltan.com/rasd`) — قصّات من اللقطات الحيّة لا رسمٌ لها.
 *
 *   pnpm design:shots --dpr=2 --only=overlay,editor,library,settings   # → artifacts/design/shots@2x/
 *   node scripts/site-images.mjs --out=<مجلّد public/rasd/shots في مستودع الموقع>
 *
 * **مربّعات القصّ من Figma حرفًا** (الملفّ `Gr0dOsmjcVBcaX9M1slf5m`، الصفحة `28 — Website Arabic`: الإطارات 433:140 و442:749):
 * كل طبقة لقطة هناك اسمها `shot · <الأداة> · x,y w×h` بإحداثيات منطقية على لقطة 1440×900، وتعبئتها CROP بالمقياس 1:1. فالقصّ
 * هنا من اللقطة بكثافة 2× عند الإحداثيات نفسها مضروبةً في 2، فتُعرض الصورة بعرضها المنطقي حادّةً على شاشات 2×. والتكبير
 * (`zoom`) بأقرب جار بلا تنعيم إلى ضعف مقاس عرضه، كما في معالجة Zoom في مكوّن Product Shot.
 *
 * لا تُرفع الصور إلى هذا المستودع: مكانها مستودع الموقع (`public/rasd/shots/`)، وهذا السكربت مصدرها الوحيد.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { ROOT } from './lib/cdp.mjs'
import { decodePng, encodePng } from './lib/visual-compare.mjs'

const DPR = 2
const SHOTS = join(ROOT, 'artifacts', 'design', `shots@${DPR}x`)

/**
 * `crop` بالبكسل المنطقي على اللقطة (1440×900، والنافذة 360×520)، و`zoom` مقاس العرض المنطقي للتكبير.
 * الأسماء أسماء الملفّات في الموقع؛ و`m-` لقصّة الهاتف (390) حين تختلف عن قصّة سطح المكتب.
 */
export const SITE_IMAGES = [
  { name: 'hero-measure', shot: 'measure_two-elements--dark', crop: [580, 330, 600, 420] },
  // النموذج الإنجليزي (445:12) يضيّق اللقطة إلى 520: قصٌّ أضيق من الموضع نفسه، لا تصغير (قاعدة Product Shot).
  { name: 'hero-measure-en', shot: 'measure_two-elements--dark', crop: [580, 330, 520, 420] },
  { name: 'hero-measure-zoom', shot: 'measure_two-elements--dark', crop: [930, 500, 80, 60], zoom: [240, 180] },
  { name: 'inspect', shot: 'inspect_element-selected--light', crop: [30, 55, 820, 645] },
  { name: 'capture', shot: 'capture_area-select--dark', crop: [310, 190, 760, 420] },
  { name: 'colors-panel', shot: 'colors_sampling--light', crop: [36, 42, 368, 524] },
  { name: 'colors-loupe', shot: 'colors_sampling--light', crop: [683, 539, 40, 40], zoom: [280, 280] },
  { name: 'compare-split', shot: 'compare_split-reference--dark', crop: [390, 60, 720, 500] },
  { name: 'compare-diff', shot: 'compare_two-captures--dark', crop: [12, 156, 290, 124] },
  { name: 'editor', shot: 'editor_redact--dark', crop: [0, 70, 720, 720] },
  { name: 'library', shot: 'library_grid--dark', crop: [720, 320, 720, 520] },
  { name: 'privacy-local-only', shot: 'privacy_controls--dark', crop: [20, 150, 920, 112] },
  { name: 'popup', shot: 'popup_default--dark', crop: [0, 0, 360, 520] },
  { name: 'm-measure', shot: 'measure_two-elements--dark', crop: [760, 310, 350, 230] },
  { name: 'm-inspect', shot: 'inspect_element-selected--light', crop: [41, 55, 380, 645] },
  { name: 'm-capture', shot: 'capture_area-select--dark', crop: [560, 180, 350, 300] },
  { name: 'm-colors-panel', shot: 'colors_sampling--light', crop: [36, 42, 350, 300] },
  { name: 'm-compare-split', shot: 'compare_split-reference--dark', crop: [560, 80, 350, 360] },
  { name: 'm-editor', shot: 'editor_redact--dark', crop: [376, 187, 350, 420] },
  { name: 'm-library', shot: 'library_grid--dark', crop: [1180, 540, 260, 300] },
  { name: 'm-popup', shot: 'popup_default--dark', crop: [5, 0, 350, 520] },
]

/** يقصّ مستطيلًا بالبكسل الفعلي من صورة RGBA. */
function crop(img, x, y, w, h) {
  if (x < 0 || y < 0 || x + w > img.width || y + h > img.height) {
    throw new Error(`القصّ ${x},${y} ${w}×${h} يخرج من الصورة ${img.width}×${img.height}`)
  }
  const data = new Uint8Array(w * h * 4)
  for (let row = 0; row < h; row++) {
    const from = ((y + row) * img.width + x) * 4
    data.set(img.data.subarray(from, from + w * 4), row * w * 4)
  }
  return { width: w, height: h, data }
}

/** تكبير بأقرب جار إلى مقاسٍ بعينه — بلا تنعيم، فيبقى كل بكسل مربّعًا. */
function nearest(img, w, h) {
  const data = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++) {
    const sy = Math.floor((y * img.height) / h)
    for (let x = 0; x < w; x++) {
      const sx = Math.floor((x * img.width) / w)
      const from = (sy * img.width + sx) * 4
      data.set(img.data.subarray(from, from + 4), (y * w + x) * 4)
    }
  }
  return { width: w, height: h, data }
}

function main() {
  const arg = process.argv.find((a) => a.startsWith('--out='))
  if (!arg) throw new Error('حدّد مجلّد الإخراج: --out=<public/rasd/shots في مستودع الموقع>')
  const out = resolve(arg.slice('--out='.length))
  if (!existsSync(SHOTS)) throw new Error(`لا لقطات في ${SHOTS} — شغّل pnpm design:shots --dpr=2 أوّلًا`)
  mkdirSync(out, { recursive: true })
  const cache = new Map()
  for (const spec of SITE_IMAGES) {
    if (!cache.has(spec.shot)) cache.set(spec.shot, decodePng(readFileSync(join(SHOTS, `${spec.shot}.png`))))
    const [x, y, w, h] = spec.crop.map((v) => v * DPR)
    let img = crop(cache.get(spec.shot), x, y, w, h)
    if (spec.zoom) img = nearest(img, spec.zoom[0] * DPR, spec.zoom[1] * DPR)
    writeFileSync(join(out, `${spec.name}.png`), encodePng(img))
    console.log(`✓ ${spec.name}.png  ${img.width}×${img.height}  ← ${spec.shot} ${spec.crop.join(',')}`)
  }
}

main()
