import { render } from 'preact'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AuditPanel, type AuditPanelProps } from '@/ui/overlay/colour/AuditPanel'

import type { AuditFinding } from '@/modules/colour/audit'

/**
 * `contrast-audit / *` — ما تعرضه اللوحة في كل حالة من الثماني وما تطلبه، بلا صفحة.
 */

let container: HTMLDivElement | null = null

afterEach(() => {
  if (container) {
    render(null, container)
    container.remove()
    container = null
  }
})

const FINDINGS: readonly AuditFinding[] = [
  {
    id: 0,
    order: 0,
    severity: 'below-3',
    ratio: 2.1,
    large: false,
    unknown: null,
    label: 'footer small',
    text: 'نصّ التذييل',
  },
  {
    id: 4,
    order: 4,
    severity: 'below-3',
    ratio: 2.6,
    large: true,
    unknown: null,
    label: 'h2',
    text: 'عنوان القسم',
  },
  {
    id: 2,
    order: 2,
    severity: 'below-4.5',
    ratio: 3.9,
    large: false,
    unknown: null,
    label: '.card-desc',
    text: 'وصف البطاقة',
  },
  {
    id: 7,
    order: 7,
    severity: 'unknown',
    ratio: null,
    large: false,
    unknown: 'image',
    label: 'h1',
    text: 'العنوان فوق الصورة',
  },
]

function setup(over: Partial<AuditPanelProps> = {}) {
  const props: AuditPanelProps = {
    phase: 'done',
    done: 326,
    total: 326,
    texts: 326,
    findings: FINDINGS,
    partialShown: false,
    selected: null,
    error: null,
    onStart: vi.fn(),
    onCancel: vi.fn(),
    onClose: vi.fn(),
    onShowPartial: vi.fn(),
    onSelect: vi.fn(),
    onCopy: vi.fn(),
    onLogIssue: vi.fn(),
    ...over,
  }
  container = document.createElement('div')
  document.body.appendChild(container)
  render(<AuditPanel {...props} />, container)
  const root = container
  const q = (id: string) => root.querySelector<HTMLElement>(`[data-rasd-ov="${id}"]`)
  const text = (id: string) => q(id)?.textContent?.replace(/\s+/g, ' ').trim() ?? null
  const click = (id: string): void => q(id)?.click()
  return { props, root, q, text, click }
}

describe('AuditPanel', () => {
  it('الخمول: الحدّان، وما ليس التدقيق، و«ابدأ التدقيق» يبدأ', () => {
    const { props, root, text, click } = setup({ phase: 'idle', findings: [] })
    expect(text('audit-subtitle')).toBe('يفحص كل نصّ ظاهر في الصفحة')
    expect(root.textContent).toContain('الحدّ للنصّ العادي')
    expect(root.textContent).toContain('4.5 : 1')
    expect(root.textContent).toContain('تباين نصوص فقط، لا تدقيق إتاحة كامل.')
    click('audit-start')
    expect(props.onStart).toHaveBeenCalledOnce()
  })

  it('المسح: التقدّم بأرقام هندية وشريطٌ بقيمته، و«ألغِ» يلغي', () => {
    const { props, root, text, click } = setup({ phase: 'scanning', done: 212, total: 326 })
    expect(text('audit-subtitle')).toBe('يُفحص النصّ الظاهر')
    expect(text('audit-progress')).toBe('٢١٢ من ٣٢٦')
    expect(root.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('212')
    click('audit-cancel')
    expect(props.onCancel).toHaveBeenCalledOnce()
  })

  it('النتائج: الشرائح بعناوينها وأعدادها، والرقاقة بالنسبة أو «بلا رقم»، والملخّص في الرأس', () => {
    const { root, text } = setup()
    expect(text('audit-subtitle')).toBe('٣٢٦ نصًّا · ٣ دون الحدّ · نصّ واحد بلا رقم')
    const groups = [...root.querySelectorAll('.rasd-ov-insp-group-title')].map((g) =>
      g.textContent?.replace(/[⁦⁩]/g, ''),
    )
    expect(groups).toEqual([
      'دون 3 : 1 · نصّان',
      'دون 4.5 : 1 · نصّ واحد',
      'تعذّر الحساب · نصّ واحد',
    ])
    const rows = [...root.querySelectorAll('[data-rasd-ov="audit-row"]')].map((r) =>
      r.textContent?.replace(/[⁦⁩]/g, '').replace(/\s+/g, ' '),
    )
    expect(rows[0]).toBe('نصّ التذييلfooter small · نصّ عادي الحجم2.10 : 1')
    expect(rows[1]).toBe('عنوان القسمh2 · نصّ كبير، وحدّه 3 : 12.60 : 1')
    expect(rows[3]).toBe('العنوان فوق الصورةh1 · الخلفية صورة، فلا لون واحد يُقاس عليهبلا رقم')
  })

  it('النقر على نتيجة يطلب القفز إليها، والمختارة تكشف «سجّلها مشكلة»', () => {
    const { props, q, click, root } = setup({ selected: 2 })
    const rows = root.querySelectorAll<HTMLElement>('[data-rasd-ov="audit-row"]')
    rows[0]?.click()
    expect(props.onSelect).toHaveBeenCalledWith(0)
    expect(rows[2]?.getAttribute('aria-current')).toBe('true')
    expect(q('audit-log-issue')?.hasAttribute('disabled')).toBe(false)
    click('audit-log-issue')
    expect(props.onLogIssue).toHaveBeenCalledOnce()
  })

  it('نتيجةٌ بلا رقم لا تُسجَّل مشكلة، والسبب مكتوب', () => {
    const { q, root } = setup({ selected: 7 })
    expect(q('audit-log-issue')?.hasAttribute('disabled')).toBe(true)
    expect(root.textContent).toContain('لا رقم يُسجَّل')
  })

  it('«انسخ التقرير» و«أعد التدقيق» في التذييل', () => {
    const { props, click } = setup()
    click('audit-copy')
    click('audit-restart')
    expect(props.onCopy).toHaveBeenCalledOnce()
    expect(props.onStart).toHaveBeenCalledOnce()
  })

  it('كل النصوص تبلغ الحدّ ⟵ رسالة النجاح وإعادة التدقيق وحدها', () => {
    const { q, text } = setup({ findings: [] })
    expect(text('audit-all-pass')).toContain('كل النصوص تبلغ الحدّ')
    expect(q('audit-copy')).toBeNull()
    expect(q('audit-restart')).not.toBeNull()
  })

  it('لا نصّ ظاهر ⟵ الفراغ لا النجاح', () => {
    const { q, text } = setup({ findings: [], texts: 0 })
    expect(text('audit-subtitle')).toBe('لا نصّ ظاهر')
    expect(q('audit-empty')).not.toBeNull()
    expect(q('audit-all-pass')).toBeNull()
  })

  it('الحدّ الزمني: تنبيهٌ وما فُحص من كم، و«اعرض النتائج» يكشف القائمة', () => {
    const { props, text, root, click } = setup({ phase: 'timeout', done: 212, total: 326 })
    expect(text('audit-subtitle')).toBe('توقّف التدقيق عند حدّه الزمني')
    expect(text('audit-timeout')).toContain('توقّف التدقيق بعد ٥ ثوانٍ')
    expect(root.textContent).toContain('٢١٢ نصًّا من ٣٢٦')
    // «دون الحدّ» ما سقط وحده، و«تعذّر الحساب» صفٌّ بجواره لا منه (المراجعة المستقلّة).
    const kv = [...root.querySelectorAll('.rasd-ov-au-kv div')].map((d) =>
      d.textContent?.replace(/\s+/g, ' '),
    )
    expect(kv).toEqual(['فُحص٢١٢ نصًّا من ٣٢٦', 'دون الحدّ٣ نصوص', 'بلا رقمنصّ واحد'])
    expect(root.querySelector('[data-rasd-ov="audit-results"]')).toBeNull()
    click('audit-show-partial')
    expect(props.onShowPartial).toHaveBeenCalledOnce()
  })

  it('…وبعد كشفها: القائمة ورأسٌ يقول إنها جزئية', () => {
    const { text, q } = setup({ phase: 'timeout', done: 212, total: 326, partialShown: true })
    expect(text('audit-subtitle')).toBe('نتائج جزئية: ٢١٢ من ٣٢٦ · ٣ دون الحدّ · نصّ واحد بلا رقم')
    expect(q('audit-results')).not.toBeNull()
  })

  it('الإلغاء: «لم تُحفظ نتائج» و«ابدأ من جديد»', () => {
    const { props, text, click } = setup({ phase: 'cancelled', findings: [] })
    expect(text('audit-cancelled')).toContain('لم تُحفظ نتائج.')
    click('audit-restart')
    expect(props.onStart).toHaveBeenCalledOnce()
  })

  it('الخطأ: رسالته وتفصيله، و«أغلق» و«أعد المحاولة» — بلا «أبلغ» لا محرّك له', () => {
    const { props, text, root, click } = setup({ phase: 'error', error: 'blocked', findings: [] })
    expect(text('audit-subtitle')).toBe('لم يكتمل التدقيق')
    expect(text('audit-error')).toContain('تعذّر تدقيق هذه الصفحة')
    expect(text('audit-error')).toContain('blocked')
    expect(root.textContent).not.toContain('أبلغ')
    click('audit-close')
    click('audit-restart')
    expect(props.onClose).toHaveBeenCalledOnce()
    expect(props.onStart).toHaveBeenCalledOnce()
  })

  it('زرّ الإغلاق في الرأس في كل حالة', () => {
    const { props, click } = setup({ phase: 'scanning' })
    click('audit-x')
    expect(props.onClose).toHaveBeenCalledOnce()
  })
})
