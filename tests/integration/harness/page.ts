import { pngDataUrl } from './canvas'
import { paint, type Pixels } from './png'

/**
 * صفحةٌ مرسومة — تخطيطٌ واحد تُجيب منه كل أسئلة المتصفّح عن الهندسة.
 *
 * happy-dom بلا تخطيط: `getBoundingClientRect()` أصفار و`elementsFromPoint()` فارغة. والدورتان تحتاجان
 * صفحةً **متّسقة مع نفسها**: العنصر الذي يصيبه المؤشِّر هو نفسه المرسوم تحته في لقطة الشاشة، وبلونه
 * المكتوب في CSS. فالصناديق هنا المصدر الواحد لثلاثة أجوبة: مستطيل العنصر، وما تحت النقطة، وبكسلات
 * `captureVisibleTab` بكثافة الجهاز. وكل ما سواها — الأنماط المحسوبة، والمحدِّدات، وشجرة DOM — حقيقيٌّ
 * من happy-dom.
 */

export interface Box {
  /** معرّف العنصر في الصفحة. */
  readonly id: string
  /** بكسلات CSS في فضاء النافذة. */
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly rgb: readonly [number, number, number]
}

export interface Page {
  readonly width: number
  readonly height: number
  readonly dpr: number
  element(id: string): HTMLElement
  /** لقطة النافذة بكثافة الجهاز — ما يعيده `captureVisibleTab`. */
  screenshot(): Pixels
  screenshotDataUrl(): string
  /** يزيل تعريفات اختبار الإصابة ويفرغ الصفحة. */
  dispose(): void
}

const hex = (rgb: readonly number[]) =>
  `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`

/**
 * يبني الصفحة: يضبط النافذة، ويكتب الصناديق عناصرَ بلون خلفية صريح، ويجيب عن الهندسة منها.
 * الصناديق بترتيب الرسم: الأخير فوق.
 */
export function layoutPage(options: {
  readonly url: string
  readonly width: number
  readonly height: number
  readonly dpr: number
  readonly background: readonly [number, number, number]
  readonly boxes: readonly Box[]
}): Page {
  const { width, height, dpr, background, boxes } = options
  const happy = (window as unknown as { happyDOM: HappyDom }).happyDOM
  happy.setURL(options.url)
  happy.setViewport({ width, height, devicePixelRatio: dpr })

  document.body.innerHTML = ''
  document.body.style.margin = '0'
  document.body.style.backgroundColor = hex(background)
  const elements = new Map<string, HTMLElement>()
  for (const box of boxes) {
    const el = document.createElement('div')
    el.id = box.id
    el.style.backgroundColor = hex(box.rgb)
    el.style.width = `${String(box.width)}px`
    el.style.height = `${String(box.height)}px`
    el.getBoundingClientRect = () =>
      DOMRect.fromRect({ x: box.x, y: box.y, width: box.width, height: box.height })
    document.body.appendChild(el)
    elements.set(box.id, el)
  }

  const inside = (b: Box, x: number, y: number) =>
    x >= b.x && y >= b.y && x < b.x + b.width && y < b.y + b.height
  const stack = (x: number, y: number): Element[] => [
    ...[...boxes]
      .reverse()
      .filter((b) => inside(b, x, y))
      .map((b) => elements.get(b.id)!),
    document.body,
    document.documentElement,
  ]
  // happy-dom لا يعرّف `elementsFromPoint` أصلًا — فيُعرَّف على المستند ويُزال في `dispose`.
  const hitTest = {
    elementsFromPoint: stack,
    elementFromPoint: (x: number, y: number) => stack(x, y)[0] ?? null,
  }
  for (const [name, value] of Object.entries(hitTest)) {
    Object.defineProperty(document, name, { value, configurable: true, writable: true })
  }

  const screenshot = (): Pixels =>
    paint(Math.round(width * dpr), Math.round(height * dpr), (dx, dy) => {
      const x = dx / dpr
      const y = dy / dpr
      const top = [...boxes].reverse().find((b) => inside(b, x, y))
      return [...(top?.rgb ?? background), 255] as const
    })

  return {
    width,
    height,
    dpr,
    element: (id) => elements.get(id)!,
    screenshot,
    screenshotDataUrl: () => pngDataUrl(screenshot()),
    dispose: () => {
      for (const name of Object.keys(hitTest)) Reflect.deleteProperty(document, name)
      document.body.innerHTML = ''
    },
  }
}

interface HappyDom {
  setURL(url: string): void
  setViewport(viewport: { width: number; height: number; devicePixelRatio: number }): void
}
