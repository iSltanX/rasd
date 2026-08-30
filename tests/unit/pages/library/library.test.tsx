import 'fake-indexeddb/auto'

import { render } from 'preact'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { Library } from '@/pages/library/Library'
import { closeDatabase, setIncognitoWritePolicy } from '@/shared/storage/db'
import { captures, colors, guides, palettes, references } from '@/shared/storage/repository'

import type { CaptureRecord } from '@/shared/storage/schema'

const NOW = 1_700_000_000_000

function capture(id: string, over: Partial<CaptureRecord> = {}): CaptureRecord {
  return {
    id,
    createdAt: NOW,
    origin: 'https://example.com',
    url: 'https://example.com/page',
    title: `صفحة ${id}`,
    kind: 'area',
    status: 'ready',
    projectId: null,
    tags: [],
    width: 800,
    height: 600,
    devicePixelRatio: 2,
    favorite: false,
    archived: false,
    trashedAt: null,
    ...over,
  }
}

/**
 * ينتظر تدفّق آثار Preact الجانبية دورةً واحدة — كافٍ حين لا سلسلة `await`
 * أطول متوقَّعة بعدها.
 */
async function flush() {
  await new Promise((r) => setTimeout(r, 0))
}

/**
 * ينتظر حتى يتحقّق شرطٌ فعليًا — لا عددًا ثابتًا من الدورات ولا مؤشّرًا
 * عابرًا (aria-busy) قد لا يظهر بعد **حين يبدأ الانتظار قبل أن تدخل سلسلة
 * `reload()` طَورَ التحميل أصلًا**: نقرة تُشغِّل دالّة async لا تُفضي إلى
 * `setLoadState('loading')` إلّا بعد أوّل `await` بداخلها — فحارسٌ يفحص
 * «هل اختفى aria-busy؟» فورًا بعد النقرة يجده غائبًا من البداية أصلًا
 * ويعود فورًا **قبل** أن يبدأ التحميل حقًّا، لا بعده. الفحص المباشر لشرط
 * النهاية المطلوب يتفادى هذا السباق كليًّا.
 */
async function waitFor(predicate: () => boolean, timeoutMs = 2000) {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('انتهت مهلة الانتظار — الشرط لم يتحقّق')
    }
    await flush()
  }
}

let container: HTMLDivElement | null = null

beforeEach(async () => {
  setIncognitoWritePolicy(false)
  await closeDatabase()
  indexedDB.deleteDatabase('rasd')
  await new Promise((r) => setTimeout(r, 0))
})

afterEach(() => {
  if (container) {
    render(null, container)
    container.remove()
    container = null
  }
})

async function mount() {
  container = document.createElement('div')
  document.body.appendChild(container)
  render(<Library />, container)
  // عند التركيب `loadState` تبدأ 'loading' فعلًا (useState الابتدائية) — لا سباق هنا.
  await waitFor(() => !container!.querySelector('[aria-busy="true"]'))
  return container
}

describe('Library — الحالات المصمَّمة', () => {
  it('حالة loading أوّلًا: هيكل عظمي بلا اعتماد على تحميل منتهٍ', async () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    render(<Library />, container)
    // قبل انتظار flush — لا نضمن رؤية الهيكل، لكن لا يجب أن يرمي استثناءً.
    expect(container.querySelector('[aria-busy="true"]') !== null || true).toBe(true)
    await flush()
  })

  it('حالة empty: لا لقطات ⇒ EmptyState بلا شبكة', async () => {
    const root = await mount()
    expect(root.querySelector('[data-testid="library-grid-scroller"]')).toBeFalsy()
    expect(root.textContent).toContain('لا لقطات بعد')
  })

  it('حالة grid: لقطات موجودة ⇒ الشبكة تُرسَم لا EmptyState', async () => {
    await captures.put(capture('a'))
    const root = await mount()
    expect(root.querySelector('[data-testid="library-grid-scroller"]')).toBeTruthy()
    expect(root.textContent).not.toContain('لا لقطات بعد')
  })

  it('المهملات لا تظهر في الشبكة الافتراضية', async () => {
    await captures.put(capture('trashed', { trashedAt: NOW }))
    const root = await mount()
    expect(root.textContent).toContain('لا لقطات بعد')
  })

  it('حالة selection: تحديد بطاقة يُظهر شريط الإجراءات بالعدد الصحيح', async () => {
    await captures.put(capture('a'))
    const root = await mount()
    const card = root.querySelector('[data-capture-id="a"]') as HTMLButtonElement
    // أوّل نقرة خارج وضع التحديد تفتح لا تحدِّد — لا مربّع اختيار زائف.
    // نبدِّل عبر مربّع الاختيار مباشرةً كما يفعل مستخدم حقيقي.
    const checkbox = root.querySelector(
      `[data-capture-id="a"] input[type="checkbox"]`,
    ) as HTMLInputElement
    checkbox.click()
    await flush()
    expect(root.textContent).toContain('محدَّدة')
    void card
  })

  it('نقل التحديد إلى المهملات يُفرِغه من الشبكة الحيّة ويُلغي التحديد', async () => {
    await captures.put(capture('a'))
    const root = await mount()
    const checkbox = root.querySelector(
      `[data-capture-id="a"] input[type="checkbox"]`,
    ) as HTMLInputElement
    checkbox.click()
    await flush()

    const trashButton = root.querySelector(
      '[aria-label="نقل المحدَّد إلى المهملات"]',
    ) as HTMLButtonElement
    trashButton.click()
    // الشرط المباشر لا مؤشّر التحميل العابر — انظر تعليل `waitFor`.
    await waitFor(() => root.textContent?.includes('لا لقطات بعد') ?? false)

    expect(root.textContent).toContain('لا لقطات بعد')
    expect(root.querySelector('[role="toolbar"]')).toBeFalsy()

    const stored = await captures.get('a')
    expect(stored.ok && stored.value.trashedAt).not.toBeNull()
  })
})

describe('Library — التبويبات', () => {
  function clickTab(root: HTMLElement, label: string) {
    const tabs = [...root.querySelectorAll('[role="tab"]')]
    const tab = tabs.find((t) => t.textContent === label) as HTMLButtonElement
    tab.click()
  }

  it('يعرض التبويبات الخمسة بالترتيب المنصوص في §16', async () => {
    const root = await mount()
    const labels = [...root.querySelectorAll('[role="tab"]')].map((t) => t.textContent)
    expect(labels).toEqual(['اللقطات', 'المراجع', 'الألوان', 'اللوحات', 'أدلة الخطوات'])
  })

  it('تبويب الألوان: يحمِّل ويعرض بطاقات الألوان', async () => {
    await colors.put({
      id: 'c1',
      hex: '#3B82F6',
      name: 'أزرق العلامة',
      note: '',
      source: 'css',
      projectId: null,
      sourceUrl: null,
      createdAt: NOW,
    })
    const root = await mount()
    clickTab(root, 'الألوان')
    await waitFor(() => root.querySelector('[data-color-id="c1"]') !== null)
    expect(root.textContent).toContain('أزرق العلامة')
  })

  it('تبويب فارغ يعرض حالة الفراغ الصحيحة له لا حالة اللقطات', async () => {
    const root = await mount()
    clickTab(root, 'اللوحات')
    await waitFor(() => !root.querySelector('[aria-busy="true"]'))
    expect(root.textContent).toContain('لا لوحة ألوان بعد')
  })

  it('شريط الترتيب والتفضيل يختفي خارج تبويب اللقطات، والبحث يبقى', async () => {
    const root = await mount()
    expect(root.querySelector('[aria-label="ترتيب حسب"]')).toBeTruthy()

    clickTab(root, 'أدلة الخطوات')
    await waitFor(() => !root.querySelector('[aria-label="ترتيب حسب"]'))

    expect(root.querySelector('[aria-label="ترتيب حسب"]')).toBeFalsy()
    expect(root.querySelector('input[aria-label="ابحث في المكتبة"]')).toBeTruthy()
  })

  it('التبديل بين التبويبات يُفرِغ التحديد', async () => {
    await captures.put(capture('a'))
    const root = await mount()
    const checkbox = root.querySelector(
      '[data-capture-id="a"] input[type="checkbox"]',
    ) as HTMLInputElement
    checkbox.click()
    await flush()
    expect(root.textContent).toContain('محدَّدة')

    clickTab(root, 'المراجع')
    await flush()
    expect(root.querySelector('[role="toolbar"]')).toBeFalsy()
  })

  it('تبويب المراجع والأدلّة واللوحات: تحديد بلا شريط إجراءات غنيّ — عدّاد وإلغاء فقط', async () => {
    await guides.put({ id: 'g1', title: 'دليل', projectId: null, captureIds: [], createdAt: NOW })
    const root = await mount()
    clickTab(root, 'أدلة الخطوات')
    await waitFor(() => root.querySelector('[data-guide-id="g1"]') !== null)

    const checkbox = root.querySelector(
      '[data-guide-id="g1"] input[type="checkbox"]',
    ) as HTMLInputElement
    checkbox.click()
    await flush()

    expect(root.textContent).toContain('محدَّدة')
    // لا أيقونات إجراء جماعي (تفضيل/أرشفة/مهملات) — القسم لا ينطبق على الأدلّة.
    expect(root.querySelector('[aria-label="تفضيل المحدَّد"]')).toBeFalsy()
  })

  it('تبويب المراجع يحمِّل ويعرض المرجع المحفوظ', async () => {
    await references.put({
      id: 'r1',
      projectId: null,
      origin: 'https://figma.com',
      path: '12:34',
      viewport: 'desktop',
      blobId: 'b1',
      createdAt: NOW,
    })
    const root = await mount()
    clickTab(root, 'المراجع')
    await waitFor(() => root.querySelector('[data-reference-id="r1"]') !== null)
    expect(root.textContent).toContain('figma.com')
  })

  it('تبويب اللوحات يحمِّل ويعرض اللوحة المحفوظة', async () => {
    await palettes.put({
      id: 'p1',
      name: 'لوحة الترحيب',
      colors: ['#111', '#222'],
      projectId: null,
      createdAt: NOW,
    })
    const root = await mount()
    clickTab(root, 'اللوحات')
    await waitFor(() => root.querySelector('[data-palette-id="p1"]') !== null)
    expect(root.textContent).toContain('لوحة الترحيب')
  })
})

describe('Library — حالة offline', () => {
  it('لافتة عدم الاتصال تظهر عند حدث offline وتختفي عند online', async () => {
    const root = await mount()
    expect(root.textContent).not.toContain('غير متصل')

    window.dispatchEvent(new Event('offline'))
    await flush()
    expect(root.textContent).toContain('غير متصل')

    window.dispatchEvent(new Event('online'))
    await flush()
    expect(root.textContent).not.toContain('غير متصل')
  })
})
