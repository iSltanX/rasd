import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ensureOverlayFonts, releaseOverlayFonts, resetFontInjection } from '@/shared/bidi/fonts'

/**
 * خطوط الطبقة داخل الصفحة عبر `FontFace` — أثرٌ في مستند لا نملكه.
 *
 * happy-dom بلا `FontFace` ولا `document.fonts`، فيُركَّب بديلٌ صغير يسجّل ما
 * أُضيف وما أُزيل. المطلوب إثباته: حقنٌ مرّة واحدة، وفشلُ خطٍّ لا يُسقط البقيّة،
 * والإفراج يزيل ما أضفناه وحده، وتحميلٌ متأخّر عن الإفراج لا يُلحق شيئًا بمستند
 * تركناه — وهو التسريب الذي يظهر على صفحة ويختفي على أخرى حسب التوقيت.
 */

interface FakeFace {
  family: string
  bytes: ArrayBuffer
  descriptors: { weight: string; display: string }
}

/** مجموعة خطوط المستند المزيَّفة: تسجّل الإضافة والحذف وتتحكّم في الفشل. */
function makeTarget() {
  const set = new Set<FakeFace>()
  const fonts = {
    add: vi.fn((face: FakeFace) => set.add(face)),
    delete: vi.fn((face: FakeFace) => set.delete(face)),
  }
  return { target: { fonts } as unknown as Document, fonts, set }
}

let fetched: string[]
let loads: { face: FakeFace; resolve: () => void }[]
/** حين يكون `true` يتعلّق كل `load()` حتى يستدعي الاختبار `settleLoads`. */
let holdLoads: boolean
let failFetchFor: string | null

beforeEach(() => {
  fetched = []
  loads = []
  holdLoads = false
  failFetchFor = null
  resetFontInjection()

  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      fetched.push(url)
      if (failFetchFor !== null && url.endsWith(failFetchFor)) {
        return Promise.reject(new Error('offline'))
      }
      return Promise.resolve({
        arrayBuffer: () => Promise.resolve(new TextEncoder().encode(url).buffer),
      })
    }),
  )

  vi.stubGlobal(
    'FontFace',
    class {
      readonly face: FakeFace
      constructor(family: string, bytes: ArrayBuffer, descriptors: FakeFace['descriptors']) {
        this.face = { family, bytes, descriptors }
        Object.assign(this, this.face)
      }
      load() {
        if (!holdLoads) return Promise.resolve(this)
        return new Promise((resolve) => {
          loads.push({ face: this.face, resolve: () => resolve(this) })
        })
      }
    },
  )
})

afterEach(() => {
  releaseOverlayFonts(makeTarget().target)
  vi.unstubAllGlobals()
})

/** يحلّ كل تحميل معلَّق ويترك الوعود تستقرّ. */
async function settleLoads() {
  for (const pending of loads) pending.resolve()
  await Promise.resolve()
}

describe('ensureOverlayFonts', () => {
  it('يجلب كل وجه من أصل الإضافة ويضيفه إلى مجموعة المستند', async () => {
    const { target, fonts } = makeTarget()

    const ok = await ensureOverlayFonts(target)

    expect(ok).toBe(true)
    expect(fonts.add).toHaveBeenCalledTimes(4)
    // البايتات تُجلَب من سياقنا بمسارات الإضافة لا بنصّ `url()` يطلبه المستند.
    expect(fetched.map((u) => u.split('assets/fonts/')[1])).toEqual([
      'cairo-400-arabic.woff2',
      'cairo-400-arabic.woff2',
      'almarai-700-arabic.woff2',
      'geistmono-400-latin.woff2',
    ])
    const added = fonts.add.mock.calls.map(([face]) => face)
    expect(added.map((f) => [f.family, f.descriptors.weight])).toEqual([
      ['Cairo', '400'],
      ['Cairo', '600'],
      ['Almarai', '700'],
      ['Geist Mono', '400'],
    ])
    // `swap`: احتياطي النظام يظهر فورًا بدل نصٍّ مخفيّ.
    expect(added.every((f) => f.descriptors.display === 'swap')).toBe(true)
  })

  it('مرّة واحدة لكل مستند: النداء الثاني يعود true بلا جلب ولا إضافة', async () => {
    const { target, fonts } = makeTarget()
    await ensureOverlayFonts(target)
    fetched.length = 0
    fonts.add.mockClear()

    const again = await ensureOverlayFonts(target)

    expect(again).toBe(true)
    expect(fetched).toEqual([])
    expect(fonts.add).not.toHaveBeenCalled()
  })

  it('فشل جلب خطّ واحد يُرجع false لكن لا يمنع بقيّة الخطوط', async () => {
    failFetchFor = 'almarai-700-arabic.woff2'
    const { target, fonts } = makeTarget()

    const ok = await ensureOverlayFonts(target)

    expect(ok).toBe(false)
    const families = fonts.add.mock.calls.map(([face]) => face.family)
    expect(families).toEqual(['Cairo', 'Cairo', 'Geist Mono'])
  })

  it('غياب `FontFace` (بيئة لا تدعمه) يُرجع false ولا يرمي', async () => {
    vi.stubGlobal('FontFace', undefined)
    const { target, fonts } = makeTarget()

    await expect(ensureOverlayFonts(target)).resolves.toBe(false)
    expect(fonts.add).not.toHaveBeenCalled()
  })

  it('تحميلٌ ينتهي بعد الإفراج لا يُضاف إلى مستند تركناه', async () => {
    holdLoads = true
    const { target, fonts } = makeTarget()

    const pending = ensureOverlayFonts(target)
    // ننتظر أن يبلغ كل وجه `load()` المعلَّق ثم نفرج قبل أن يكتمل أيّ منها.
    await vi.waitFor(() => expect(loads).toHaveLength(4))
    releaseOverlayFonts(target)
    await settleLoads()
    const ok = await pending

    expect(ok).toBe(false)
    expect(fonts.add, 'أُضيف وجهٌ إلى مستندٍ فُكِّكت طبقته').not.toHaveBeenCalled()
  })

  it('الإفراج يفتح الباب لحقنٍ جديد بجيلٍ جديد', async () => {
    const { target, fonts } = makeTarget()
    await ensureOverlayFonts(target)
    releaseOverlayFonts(target)
    fonts.add.mockClear()

    expect(await ensureOverlayFonts(target)).toBe(true)
    expect(fonts.add).toHaveBeenCalledTimes(4)
  })
})

describe('releaseOverlayFonts', () => {
  it('يزيل ما أضفناه وحده ويُرجع عدده، ولا يمسّ وجه الصفحة', async () => {
    const { target, set } = makeTarget()
    const pageFace: FakeFace = {
      family: 'PageFont',
      bytes: new ArrayBuffer(0),
      descriptors: { weight: '400', display: 'auto' },
    }
    set.add(pageFace)
    await ensureOverlayFonts(target)
    expect(set.size).toBe(5)

    const removed = releaseOverlayFonts(target)

    expect(removed).toBe(4)
    expect([...set]).toEqual([pageFace])
  })

  it('ثاني إفراج لا يجد شيئًا فيُرجع صفرًا', async () => {
    const { target } = makeTarget()
    await ensureOverlayFonts(target)
    releaseOverlayFonts(target)

    expect(releaseOverlayFonts(target)).toBe(0)
  })

  it('مجموعة ترمي عند الحذف لا تُسقط الإفراج ولا تُحسب إزالةً', async () => {
    const { target, fonts } = makeTarget()
    await ensureOverlayFonts(target)
    // المجموعة أُفرغت من تحتنا: أوّل حذف يرمي والبقيّة تنجح.
    fonts.delete.mockImplementationOnce(() => {
      throw new Error('already cleared')
    })

    expect(releaseOverlayFonts(target)).toBe(3)
    expect(fonts.delete).toHaveBeenCalledTimes(4)
  })
})

describe('resetFontInjection', () => {
  it('ينسى ما حُقن دون أن يمسّ المستند — للاختبارات', async () => {
    const { target, fonts } = makeTarget()
    await ensureOverlayFonts(target)
    resetFontInjection()

    // لا شيء في `added` بعد التصفير، فالإفراج لا يجد ما يزيله.
    expect(releaseOverlayFonts(target)).toBe(0)
    expect(fonts.delete).not.toHaveBeenCalled()
  })
})
