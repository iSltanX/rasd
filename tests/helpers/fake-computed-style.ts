/**
 * نافذة مزيَّفة تحاكي **وراثة المتغيّرات المخصَّصة** وحالاتها الأربع.
 *
 * happy-dom يحلّ الخصائص المخصَّصة على العنصر المصرِّح وحده — بلا وراثة وبلا
 * `computedStyleMap` (مقيس في ترويسة `declaration.test.ts`). فصعود المعرِّف
 * والتفريق بين الفارغ والباطل لا يُختبَران فوقه. وهذا المزيِّف يعطي ما يعطيه
 * Chrome على الأسئلة التي يطرحها `readVar` وحدها:
 *
 * | ما يُعرَّف على أقرب سلف | `getPropertyValue` | في التعداد | `csm.has` |
 * |---|---|---|---|
 * | نصّ | النصّ | نعم | نعم |
 * | `EMPTY` (`--x: ;`) | `""` | نعم | **نعم** |
 * | `INVALID` (دورة) | `""` | نعم | **لا** |
 * | لا شيء | `""` | لا | لا |
 *
 * والأب المركَّب يعبر حدّ الظلّ كما في المتصفّح.
 */

/** معرَّف بقيمة فارغة — `--x: ;` */
export const EMPTY = Symbol('empty')

/** معرَّف بقيمة لا تُحسَب: دورة، أو إشارة إلى غير معرَّف. */
export const INVALID = Symbol('invalid')

export type Def = string | typeof EMPTY | typeof INVALID

/**
 * ما تُعلنه بيئة القراءة عن `computedStyleMap`:
 * `supported` كما في Chrome، و`absent` كبيئة اختبار قديمة، و`throws` لعنصر
 * يرمي منه المتصفّح (عنصر منفصل عن المستند مثلًا).
 */
export type StyleMapMode = 'supported' | 'absent' | 'throws'

function composedParentOf(el: Element): Element | null {
  if (el.parentElement) return el.parentElement
  const root = el.getRootNode()
  return root instanceof ShadowRoot ? root.host : null
}

export class FakeComputedStyle {
  private readonly defs = new Map<Element, Map<string, Def>>()

  constructor(private readonly mode: StyleMapMode = 'supported') {}

  /** يصرّح بأسماء على عنصر — وتصل قيمها إلى نسله بالوراثة. */
  define(el: Element, vars: Record<string, Def>): this {
    const own = this.defs.get(el) ?? new Map<string, Def>()
    for (const [name, def] of Object.entries(vars)) own.set(name, def)
    this.defs.set(el, own)
    return this
  }

  readonly win = {
    getComputedStyle: (el: Element): CSSStyleDeclaration => this.styleOf(el),
  } as unknown as Window

  /** أقرب تعريف على العنصر أو أسلافه المركَّبين. */
  private lookup(el: Element, name: string): Def | undefined {
    for (let node: Element | null = el; node; node = composedParentOf(node)) {
      const def = this.defs.get(node)?.get(name)
      if (def !== undefined) return def
    }
    return undefined
  }

  /** كل الأسماء المرئية على العنصر: أسماؤه وأسماء أسلافه، بلا تكرار. */
  private namesOf(el: Element): string[] {
    const seen = new Set<string>()
    for (let node: Element | null = el; node; node = composedParentOf(node)) {
      for (const name of this.defs.get(node)?.keys() ?? []) seen.add(name)
    }
    return [...seen]
  }

  private styleOf(el: Element): CSSStyleDeclaration {
    this.installStyleMap(el)
    const names = this.namesOf(el)
    return {
      getPropertyValue: (name: string): string => {
        const def = this.lookup(el, name)
        return typeof def === 'string' ? def : ''
      },
      get length(): number {
        return names.length
      },
      item: (i: number): string => names[i] ?? '',
    } as unknown as CSSStyleDeclaration
  }

  private installStyleMap(el: Element): void {
    // العناصر تُعاد بين اختبارات الملفّ الواحد (`documentElement`)، فالحالة تُكتب
    // كل مرّة: `absent` تمحو ما تركه اختبار سابق.
    if (this.mode === 'absent') {
      Reflect.deleteProperty(el, 'computedStyleMap')
      return
    }
    const impl =
      this.mode === 'throws'
        ? () => {
            throw new Error('computedStyleMap unavailable')
          }
        : () => ({
            has: (name: string): boolean => {
              const def = this.lookup(el, name)
              return def !== undefined && def !== INVALID
            },
          })
    Object.defineProperty(el, 'computedStyleMap', { value: impl, configurable: true })
  }
}
