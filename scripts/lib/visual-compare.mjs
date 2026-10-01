/**
 * مقارن اللقطات — الانحدار البصري الآلي (`STAGES/26`، ADR 0052).
 *
 * **خالص ولا يلمس كروم:** يفكّ ملفّين PNG ويقيس الفرق بينهما، فيُختبَر بوحدات `vitest` وتقرأه
 * `scripts/verify-visual.mjs` معًا. القرار في العتبات لا في الدوالّ: الدوالّ تعيد أرقامًا، والحكم
 * `judge` وحده يقارنها بالعتبات الثلاث.
 *
 * **ثلاثة أرقام لا رقم واحد، لأن كلًّا يكشف ما لا يكشفه غيره:**
 *
 *  1. `fraction` — نسبة البكسلات المختلفة من الصورة كلّها (`pixelmatch` بعتبة لونية `PIXEL_THRESHOLD`
 *     ودون عدّ حواف التنعيم). يكشف الانحراف المنتشر: لونُ خلفيةٍ تغيّر، أو كل النصوص انزاحت.
 *  2. `tile` — أسوأ بلاطة من 32×32: نسبة المختلف فيها. يكشف الانحراف الموضعي الصغير الذي يضيع في
 *     النسبة الكلّية: شارةٌ بلون آخر مساحتها 0.03% من الصورة تملأ بلاطتها كلّها فتبلغ 100%.
 *  3. `size` — اختلاف الأبعاد. تغيّر الأبعاد انحرافُ تخطيط لا يُقارَن بكسلًا ببكسل.
 *
 * **لماذا ليس مقارنةً بكسليّة صرفة:** متصفّح يتحدّث شهريًّا يغيّر تنعيم الحرف، وخطّ الأساس مأخوذ على
 * منصّة غير منصّة CI (`tests/visual-baselines/phase-15/README.md`). فالعتبات تُقاس لا تُخمَّن —
 * `Docs/ADR/0052-visual-regression.md` يدوّن قياسها، وكل رقم هنا يعود إليه.
 */
import { crc32, deflateSync, inflateSync } from 'node:zlib'

import pixelmatch from 'pixelmatch'

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** عتبة `pixelmatch` اللونية (YIQ، 0–1). ADR 0052 يدوّن قياسها. */
export const PIXEL_THRESHOLD = 0.1
/** ضلع البلاطة الموضعية بالبكسل. */
export const TILE = 32
/**
 * العتبتان — **مقيستان** (`Docs/ADR/0052-visual-regression.md`): ضجيج الالتقاط المتكرّر لشاشةٍ واحدة على
 * الجهاز نفسه لم يتجاوز 0.008% من البكسلات وبلاطةً 5.3%، وأصغر تخريبٍ مقصود أثرًا (زرٌّ أُعيد تفعيله) 0.24%
 * وبلاطةً 52%. فالعتبة بين الضجيج والإشارة بهامش ستّة أضعاف من جهة الضجيج. ولا تُرفع لتخضرّ (`AGENTS.md` §4).
 */
export const LIMITS = { fraction: 0.0005, tile: 0.2 }

/**
 * يفكّ PNG ثماني البتّ غير المتشابك (RGB أو RGBA) — ما يكتبه `Page.captureScreenshot`. ما سواه يُرمى
 * به بصوتٍ عالٍ بدل أن يُقرأ خطأً.
 * @param {Buffer} buf
 * @returns {{ width: number, height: number, data: Uint8Array }} بيانات RGBA
 */
export function decodePng(buf) {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('ليس ملفّ PNG')
  }
  let width = 0
  let height = 0
  let colourType = -1
  const idat = []
  for (let off = 8; off + 8 <= buf.length;) {
    const length = buf.readUInt32BE(off)
    const type = buf.toString('latin1', off + 4, off + 8)
    const body = buf.subarray(off + 8, off + 8 + length)
    if (type === 'IHDR') {
      width = body.readUInt32BE(0)
      height = body.readUInt32BE(4)
      const depth = body[8]
      colourType = body[9]
      if (depth !== 8) throw new Error(`عمق بتّ غير مدعوم: ${depth}`)
      if (colourType !== 2 && colourType !== 6) {
        throw new Error(`نوع لون غير مدعوم: ${colourType} (المدعوم 2 و6)`)
      }
      if (body[12] !== 0) throw new Error('PNG متشابك غير مدعوم')
    } else if (type === 'IDAT') {
      idat.push(body)
    } else if (type === 'IEND') {
      break
    }
    off += 12 + length
  }
  if (!width || !height || colourType < 0) throw new Error('PNG بلا ترويسة')
  const bpp = colourType === 6 ? 4 : 3
  const stride = width * bpp
  const raw = inflateSync(Buffer.concat(idat))
  if (raw.length !== (stride + 1) * height) throw new Error('حجم البيانات لا يطابق الأبعاد')

  const out = new Uint8Array(width * height * 4)
  const prev = new Uint8Array(stride)
  const line = new Uint8Array(stride)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0
      const b = prev[i]
      const c = i >= bpp ? prev[i - bpp] : 0
      let v = src[i]
      if (filter === 1) v += a
      else if (filter === 2) v += b
      else if (filter === 3) v += (a + b) >> 1
      else if (filter === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a)
        const pb = Math.abs(p - b)
        const pc = Math.abs(p - c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      } else if (filter !== 0) throw new Error(`مرشّح PNG مجهول: ${filter}`)
      line[i] = v & 0xff
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4
      out[o] = line[x * bpp]
      out[o + 1] = line[x * bpp + 1]
      out[o + 2] = line[x * bpp + 2]
      out[o + 3] = bpp === 4 ? line[x * bpp + 3] : 255
    }
    prev.set(line)
  }
  return { width, height, data: out }
}

/**
 * يقيس الفرق بين صورتين.
 * @param {{ width: number, height: number, data: Uint8Array }} a  خطّ الأساس
 * @param {{ width: number, height: number, data: Uint8Array }} b  اللقطة الحيّة
 * @returns {{ sameSize: boolean, width: number, height: number, fraction: number, tile: number, diffPixels: number, mask?: Uint8Array }}
 *   و`mask` (RGBA، المختلف أحمر قاطع) حين يُطلب — لتُكتب صورة الفرق عند السقوط.
 */
export function measureDiff(a, b, { wantMask = false } = {}) {
  if (a.width !== b.width || a.height !== b.height) {
    return {
      sameSize: false,
      width: b.width,
      height: b.height,
      fraction: 1,
      tile: 1,
      diffPixels: Infinity,
    }
  }
  const { width, height } = a
  const mask = new Uint8Array(width * height * 4)
  const diffPixels = pixelmatch(a.data, b.data, mask, width, height, {
    threshold: PIXEL_THRESHOLD,
    includeAA: false,
    // البكسل المختلف أحمر قاطع، وغيره يُرسم رماديًّا — فنعدّ الأحمر وحده بلا إعادة حساب.
    diffColor: [255, 0, 0],
    alpha: 0,
  })
  const tilesX = Math.ceil(width / TILE)
  const tilesY = Math.ceil(height / TILE)
  const counts = new Uint32Array(tilesX * tilesY)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4
      if (mask[o] === 255 && mask[o + 1] === 0 && mask[o + 2] === 0) {
        counts[Math.floor(y / TILE) * tilesX + Math.floor(x / TILE)]++
      }
    }
  }
  let tile = 0
  for (let ty = 0; ty < tilesY; ty++) {
    for (let tx = 0; tx < tilesX; tx++) {
      const w = Math.min(TILE, width - tx * TILE)
      const h = Math.min(TILE, height - ty * TILE)
      tile = Math.max(tile, counts[ty * tilesX + tx] / (w * h))
    }
  }
  return {
    sameSize: true,
    width,
    height,
    fraction: diffPixels / (width * height),
    tile,
    diffPixels,
    ...(wantMask ? { mask } : {}),
  }
}

/**
 * يكتب RGBA ثماني البتّ PNG. لصورة الفرق وللاختبارات — لا يُستعمل في المسار الحاكم.
 * @param {{ width: number, height: number, data: Uint8Array }} image
 * @returns {Buffer}
 */
export function encodePng({ width, height, data }) {
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0
    Buffer.from(data.buffer, data.byteOffset + y * width * 4, width * 4).copy(
      raw,
      y * (width * 4 + 1) + 1,
    )
  }
  const chunk = (type, body) => {
    const head = Buffer.alloc(8)
    head.writeUInt32BE(body.length, 0)
    head.write(type, 4, 'latin1')
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0)
    return Buffer.concat([head, body, crc])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 6
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/**
 * الحكم: العتبات تأتي من الاستدعاء لا من هنا.
 * @param {ReturnType<typeof measureDiff>} m
 * @param {{ fraction: number, tile: number }} limits
 * @returns {string | null} سبب السقوط أو `null`
 */
export function judge(m, limits) {
  if (!m.sameSize) return `الأبعاد تغيّرت إلى ${m.width}×${m.height}`
  if (m.fraction > limits.fraction) {
    return `انحراف منتشر ${(m.fraction * 100).toFixed(3)}% من البكسلات (العتبة ${(limits.fraction * 100).toFixed(3)}%)`
  }
  if (m.tile > limits.tile) {
    return `انحراف موضعي ${(m.tile * 100).toFixed(1)}% في بلاطة ${TILE}×${TILE} (العتبة ${(limits.tile * 100).toFixed(1)}%)`
  }
  return null
}
