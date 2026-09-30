import { describe, expect, it } from 'vitest'

import {
  assembleGuideZip,
  base64,
  buildGuideModel,
  docBottom,
  escapeHtml,
  estimateGuideBytes,
  estimateGuidePages,
  GUIDE_HTML_CSP,
  GUIDE_MARKDOWN_NAME,
  guideCoverBlocks,
  guideFilename,
  HEADER_GAP,
  layoutStepHeader,
  MIN_IMAGE_SPACE,
  planStepWindows,
  renderGuideHtml,
  renderGuideMarkdown,
  stepHeaderBlocks,
  stepImageName,
  type GuideHtmlPalette,
  type GuideModel,
} from '@/modules/export/guide'
import { DOC_MARGIN } from '@/modules/export/pdf-document'
import { MAX_SCALE, PAGE_MARGIN, pageBox } from '@/modules/export/pdf-layout'
import { DEFAULT_GUIDE_OPTIONS, type GuideStep } from '@/shared/guide-schema'

import { unzip } from '../../../helpers/unzip'

/**
 * مولِّدات الدليل (ADR 0041) — النموذج قرارٌ واحد، والصيغ الأربع تقرؤه ولا تقرّر.
 */

const AT = Date.UTC(2026, 9, 1, 9, 30, 0)

const STEPS: GuideStep[] = [
  { captureId: 'c3', title: 'افتح الصفحة وشغّل وضع الفحص', note: 'اضغط ⌥⇧I في الصفحة.' },
  { captureId: 'c1', title: '', note: 'مرّر حتى يُبرز رصد العنصر.\n\nثمّ انقر لتثبيته.' },
  { captureId: 'c2', title: '  ', note: '' },
]

const TITLES = new Map([
  ['c1', 'السلّة — المتجر'],
  ['c3', 'الرئيسية'],
])

function model(over: Partial<typeof DEFAULT_GUIDE_OPTIONS> = {}, steps = STEPS): GuideModel {
  return buildGuideModel({
    title: 'كيف تُبلّغ عن خطأ بصري',
    steps,
    captureTitles: TITLES,
    options: { ...DEFAULT_GUIDE_OPTIONS, ...over },
    generatedAt: AT,
    version: '0.1.0',
  })
}

const PALETTE: GuideHtmlPalette = {
  light: {
    canvas: 'white',
    surface: 'white',
    text: 'black',
    muted: 'dimgray',
    border: 'silver',
    accent: 'teal',
    onAccent: 'black',
  },
  dark: {
    canvas: 'black',
    surface: 'black',
    text: 'white',
    muted: 'silver',
    border: 'gray',
    accent: 'teal',
    onAccent: 'black',
  },
}

const bytes = (...values: number[]) => Uint8Array.from(values)

const IMAGES = new Map([
  ['c1', bytes(137, 80, 78, 71, 1)],
  ['c2', bytes(137, 80, 78, 71, 2, 2)],
  ['c3', bytes(137, 80, 78, 71, 3, 3, 3)],
])

describe('النموذج', () => {
  it('الخطوات بترتيب الدليل، والعنوان: ما كُتب ثمّ عنوان اللقطة ثمّ «الخطوة ن»', () => {
    const m = model()
    expect(m.steps.map((s) => [s.ordinal, s.captureId, s.title])).toEqual([
      [1, 'c3', 'افتح الصفحة وشغّل وضع الفحص'],
      [2, 'c1', 'السلّة — المتجر'],
      [3, 'c2', 'الخطوة ٣'],
    ])
    expect(m.steps.map((s) => s.image)).toEqual([
      'images/step-01.png',
      'images/step-02.png',
      'images/step-03.png',
    ])
  })

  it('«ضمّن الملاحظات» مطفأ يُفرغ كل ملاحظة، والترقيم يتبع خياره', () => {
    const m = model({ notes: false, numbered: false })
    expect(m.steps.every((s) => s.note === '')).toBe(true)
    expect(m.numbered).toBe(false)
  })

  it('اسم الصورة رقمٌ غربيّ مُبطَّن بعرض أكبر رقم — مئة وخمسون خطوة بثلاث خانات', () => {
    expect(stepImageName(7, 150, 'png')).toBe('images/step-007.png')
    expect(stepImageName(12, 12, 'webp')).toBe('images/step-12.webp')
  })

  it('عنوان دليلٍ فارغ له بديلٌ مقروء', () => {
    const m = buildGuideModel({
      title: '   ',
      steps: [],
      captureTitles: new Map(),
      options: DEFAULT_GUIDE_OPTIONS,
      generatedAt: AT,
      version: '0.1.0',
    })
    expect(m.title).toBe('دليل بلا عنوان')
  })
})

describe('Markdown', () => {
  it('العنوان ثمّ العدّ الهندي، وكل خطوة برقمها الهندي وملاحظتها وصورتها', () => {
    const md = renderGuideMarkdown(model(), { images: true })
    expect(md.startsWith('# كيف تُبلّغ عن خطأ بصري\n')).toBe(true)
    expect(md).toContain('- الخطوات: ٣ خطوات')
    expect(md).toContain('## ١. افتح الصفحة وشغّل وضع الفحص')
    expect(md).toContain('## ٢. السلّة — المتجر')
    // الفقرتان فقرتان، لا سطرٌ واحد.
    expect(md).toContain('مرّر حتى يُبرز رصد العنصر.\n\nثمّ انقر لتثبيته.')
    expect(md).toContain('](images/step-02.png)')
  })

  it('المنفردة بلا صور: لا مرجع إلى ملفٍّ لا يرافقها', () => {
    const md = renderGuideMarkdown(model(), { images: false })
    expect(md).not.toContain('![')
    expect(md).not.toContain('images/')
  })

  it('بلا ترقيم: لا رقم في العناوين', () => {
    const md = renderGuideMarkdown(model({ numbered: false }), { images: false })
    expect(md).toContain('## افتح الصفحة وشغّل وضع الفحص')
    expect(md).not.toMatch(/## [١٢٣]\./u)
  })

  it('ما كتبه المستخدم لا يكسر المستند: `#` و`*` و`[` مهرَّبة، ومحارف الاتجاه محذوفة', () => {
    const steps: GuideStep[] = [
      {
        captureId: 'c1',
        title: '*عريض* [رابط](x)',
        note: '# ليس عنوانًا\n- ولا قائمة \u202eمقلوب',
      },
    ]
    const md = renderGuideMarkdown(model({}, steps), { images: false })
    expect(md).toContain('\\*عريض\\* \\[رابط\\](x)')
    expect(md).toContain('\\# ليس عنوانًا')
    expect(md).toContain('\\- ولا قائمة')
    expect(md).not.toContain('\u202e')
  })
})

describe('ZIP', () => {
  it('المستند وصوره بأسمائها، ويُفكّ بـ`unzip` بلا خطأ', () => {
    const m = model()
    const built = assembleGuideZip(m, IMAGES)
    if (!built.ok) throw new Error(built.error.message)
    expect(built.value.files.map((f) => f.name)).toEqual([
      GUIDE_MARKDOWN_NAME,
      'images/step-01.png',
      'images/step-02.png',
      'images/step-03.png',
    ])
    const out = unzip(built.value.bytes)
    try {
      expect(out.test).toContain('No errors detected')
      expect(new TextDecoder().decode(out.read(GUIDE_MARKDOWN_NAME))).toBe(
        renderGuideMarkdown(m, { images: true }),
      )
      // الخطوة الأولى لقطة c3 — الصورة تتبع الخطوة لا ترتيب اللقطات.
      expect(new Uint8Array(out.read('images/step-01.png'))).toEqual(IMAGES.get('c3'))
    } finally {
      out.dispose()
    }
  })

  it('**لا مرجع بلا ملفّ**: صورة خطوةٍ غائبة تُسقط الحزمة باسمها', () => {
    const partial = new Map(IMAGES)
    partial.delete('c1')
    const built = assembleGuideZip(model(), partial)
    expect(built.ok).toBe(false)
    if (!built.ok) expect(built.error.detail).toBe('images/step-02.png')
  })
})

describe('الصفحة المستقلّة', () => {
  const html = (m = model()) => {
    const images = new Map(
      [...IMAGES].map(([id, b]) => [
        id,
        { bytes: b, mime: 'image/webp' as const, width: 1440, height: 900 },
      ]),
    )
    const r = renderGuideHtml(m, images, PALETTE)
    if (!r.ok) throw new Error(r.error.message)
    return r.value
  }

  it('ملفٌّ واحد عربيّ الاتجاه، وسياسته تمنع كل طلب شبكة', () => {
    const page = html()
    expect(page.startsWith('<!doctype html>\n<html lang="ar" dir="rtl">')).toBe(true)
    expect(page).toContain(
      `<meta http-equiv="Content-Security-Policy" content="${GUIDE_HTML_CSP}">`,
    )
    expect(GUIDE_HTML_CSP).toContain("default-src 'none'")
    expect(GUIDE_HTML_CSP).toContain('img-src data:')
  })

  it('**بلا اعتماد خارجي**: لا سكربت ولا رابط ولا خطّ ولا صورة إلا `data:`', () => {
    const page = html()
    expect(page).not.toMatch(/<script|<link|<iframe|@import|url\(/iu)
    expect(page).not.toMatch(/https?:|\/\//iu)
    const sources = [...page.matchAll(/\ssrc="([^"]*)"/gu)].map((m) => m[1]!)
    expect(sources).toHaveLength(3)
    expect(sources.every((s) => s.startsWith('data:image/webp;base64,'))).toBe(true)
  })

  it('كل صورةٍ بايتاتها كما خُبزت، وبأبعادها الصريحة ونصّها البديل', () => {
    const page = html()
    const imgs = [
      ...page.matchAll(
        /<img src="data:image\/webp;base64,([^"]+)" width="(\d+)" height="(\d+)" alt="([^"]+)"/gu,
      ),
    ]
    expect(imgs.map((m) => [...Buffer.from(m[1]!, 'base64')])).toEqual([
      [...IMAGES.get('c3')!],
      [...IMAGES.get('c1')!],
      [...IMAGES.get('c2')!],
    ])
    expect(imgs.every((m) => m[2] === '1440' && m[3] === '900')).toBe(true)
    expect(imgs[0]![4]).toBe('لقطة الخطوة ١ — افتح الصفحة وشغّل وضع الفحص')
  })

  it('الخطوات قائمةٌ مرتّبة برقمٍ هندي مرئي، وبلا ترقيم لا شارة', () => {
    const page = html()
    expect(page).toContain('<ol>')
    expect(page).toContain('<span class="n" aria-hidden="true">١</span>')
    expect(page).toContain('<span class="sr">الخطوة ٢: </span>')
    const plain = html(model({ numbered: false }))
    expect(plain).not.toContain('class="n"')
  })

  it('ما كتبه المستخدم نصٌّ لا وسوم: `<script>` في العنوان يُعرض ولا يُنفَّذ', () => {
    const steps: GuideStep[] = [
      { captureId: 'c1', title: '<script>alert(1)</script>', note: '"&\'' },
    ]
    const page = html(model({}, steps))
    expect(page).not.toContain('<script>')
    expect(page).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(page).toContain('&quot;&amp;&#39;')
  })

  it('صورة خطوةٍ غائبة تُسقط الصفحة باسمها', () => {
    const r = renderGuideHtml(model(), new Map(), PALETTE)
    expect(r.ok).toBe(false)
  })
})

describe('Base64 والتهريب', () => {
  it('يطابق ترميز Node لكل طول حتى الحشو', () => {
    for (let n = 0; n <= 20; n++) {
      const b = Uint8Array.from({ length: n }, (_, i) => (i * 97 + n) % 256)
      expect(base64(b), `طول ${n}`).toBe(Buffer.from(b).toString('base64'))
    }
    const big = Uint8Array.from({ length: 100_003 }, (_, i) => (i * 31) % 256)
    expect(base64(big)).toBe(Buffer.from(big).toString('base64'))
  })

  it('escapeHtml يحذف محارف الاتجاه ويحوّل الخمسة', () => {
    expect(escapeHtml('<a href="x">\u2066&\'</a>')).toBe(
      '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;',
    )
  })
})

describe('صفحات PDF', () => {
  const A4 = pageBox('a4', 'portrait')
  const measure = (text: string) => text.length * 5

  it('الغلاف: العنوان وفهرسٌ مرقَّم هنديًّا — وبلا ترقيم أسطرٌ بلا أرقام', () => {
    const blocks = guideCoverBlocks(model())
    expect(blocks[0]).toMatchObject({ kind: 'title', text: 'كيف تُبلّغ عن خطأ بصري' })
    expect(blocks[1]).toMatchObject({ kind: 'items' })
    if (blocks[1]?.kind === 'items')
      expect(blocks[1].items.map((i) => i.number)).toEqual(['١', '٢', '٣'])
    const plain = guideCoverBlocks(model({ numbered: false }))
    expect(plain.slice(1).every((b) => b.kind === 'text')).toBe(true)
  })

  it('رأس الخطوة يحمل ملاحظتها، وأسفله تحت الهامش العلوي', () => {
    const m = model()
    const blocks = stepHeaderBlocks(m, m.steps[1]!)
    expect(blocks).toHaveLength(1)
    if (blocks[0]?.kind === 'items') expect(blocks[0].items[0]!.lines).toHaveLength(1)
    const header = layoutStepHeader(m, m.steps[1]!, A4, measure)
    expect(header.pages).toHaveLength(1)
    expect(header.bottom).toBeGreaterThan(DOC_MARGIN)
    expect(header.bottom).toBe(docBottom(header.pages[0]!))
  })

  it('صورةٌ تسعها الصفحة تحت رأسها: نافذةٌ واحدة معه، بمقياس العرض', async () => {
    const windows = await planStepWindows(800, 500, A4, 120)
    expect(windows).toHaveLength(1)
    expect(windows[0]!.withHeader).toBe(true)
    expect(windows[0]!.window.y).toBe(120 + HEADER_GAP)
    expect(windows[0]!.window.scale).toBeCloseTo((A4.width - PAGE_MARGIN * 2) / 800, 6)
  })

  it('أطول قليلًا ممّا بقي: تُصغَّر لتسع صفحتها لا تنقسم', async () => {
    const scale = Math.min((A4.width - PAGE_MARGIN * 2) / 800, MAX_SCALE)
    const space = A4.height - PAGE_MARGIN - (120 + HEADER_GAP)
    const height = Math.floor((space / scale) * 1.2)
    const windows = await planStepWindows(800, height, A4, 120)
    expect(windows).toHaveLength(1)
    expect(windows[0]!.window.scale).toBeLessThan(scale)
    expect(windows[0]!.window.rows * windows[0]!.window.scale).toBeCloseTo(space, 3)
  })

  it('لقطة صفحةٍ كاملة: تنقسم بلا فجوة ولا تكرار، أوّلها تحت الرأس وباقيها صفحاتٌ لها', async () => {
    const windows = await planStepWindows(1440, 12_000, A4, 120)
    expect(windows.length).toBeGreaterThan(2)
    expect(windows[0]!.withHeader).toBe(true)
    expect(windows.slice(1).every((w) => !w.withHeader && w.window.y === PAGE_MARGIN)).toBe(true)
    let top = 0
    for (const { window } of windows) {
      expect(window.top).toBe(top)
      top += window.rows
    }
    expect(top).toBe(12_000)
  })

  it('رأسٌ لا يترك متّسعًا: الصورة تبدأ صفحتها', async () => {
    const low = A4.height - PAGE_MARGIN - HEADER_GAP - MIN_IMAGE_SPACE + 10
    const windows = await planStepWindows(1440, 12_000, A4, low)
    expect(windows[0]!.withHeader).toBe(false)
    expect(windows[0]!.window.y).toBe(PAGE_MARGIN)
  })

  it('والقاطع يُحترم داخل نافذته ولا يُقبل خارجها', async () => {
    const windows = await planStepWindows(1440, 12_000, A4, 120, (earliest) =>
      Promise.resolve(earliest - 500),
    )
    for (const { window } of windows) expect(window.rows).toBeGreaterThan(0)
  })
})

describe('الأسماء والتقدير', () => {
  it('اسم الملفّ من العنوان بامتداد صيغته، والعربية باقية', () => {
    expect(guideFilename('كيف تُبلّغ عن خطأ', 'pdf')).toBe('كيف-تُبلّغ-عن-خطأ.pdf')
    expect(guideFilename('دليل: الدفع/السلّة', 'markdown')).toBe('دليل-الدفع-السلّة.md')
    expect(guideFilename('', 'html')).toBe('دليل.html')
    expect(guideFilename('x', 'zip')).toBe('x.zip')
  })

  it('التقدير: Markdown أصغر من غيره، والصفحات الغلاف وخطوة لكلٍّ', () => {
    const sizes = [500_000, 400_000]
    expect(estimateGuideBytes('markdown', sizes)).toBeLessThan(estimateGuideBytes('html', sizes))
    expect(estimateGuideBytes('zip', sizes)).toBeGreaterThan(900_000)
    expect(estimateGuidePages(5)).toBe(6)
    expect(estimateGuidePages(0)).toBe(1)
  })
})
