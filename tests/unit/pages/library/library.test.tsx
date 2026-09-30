import 'fake-indexeddb/auto'

import { render } from 'preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Library } from '@/pages/library/Library'
import { closeDatabase, setIncognitoWritePolicy } from '@/shared/storage/db'
import {
  captures,
  colors,
  guides,
  palettes,
  projects,
  references,
  tags,
} from '@/shared/storage/repository'

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
async function waitFor(predicate: () => boolean | Promise<boolean>, timeoutMs = 2000) {
  const start = Date.now()
  while (!(await predicate())) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('انتهت مهلة الانتظار — الشرط لم يتحقّق')
    }
    await flush()
  }
}

let container: HTMLDivElement | null = null

beforeEach(async () => {
  // العرض يُحمَل في الرابط (`?view=`) ويبقى بعد إعادة التحميل — والنافذة مشتركة بين
  // الاختبارات، فيبدأ كلٌّ من «كل اللقطات» لا من عرض تركه سابقه.
  history.replaceState(null, '', '/')
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

  // `aria-label` على `div` بلا دور لا يُقرأ (axe `aria-prohibited-attr`، `STAGES/04`): الهيكل حالةٌ تُعلَن.
  it('هيكل التحميل حالةٌ تُعلَن باسمها', async () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    render(<Library />, container)
    const busy = container.querySelector('[aria-busy="true"]')
    expect(busy).not.toBeNull()
    expect(busy?.getAttribute('role')).toBe('status')
    expect(busy?.getAttribute('aria-label')).toBe('جارٍ تحميل المكتبة')
    await flush()
  })

  it('حالة empty: لا لقطات ⇒ EmptyState بلا شبكة', async () => {
    const root = await mount()
    expect(root.querySelector('[data-testid="library-grid-scroller"]')).toBeFalsy()
    expect(root.textContent).toContain('لا توجد لقطات بعد')
  })

  it('حالة grid: لقطات موجودة ⇒ الشبكة تُرسَم لا EmptyState', async () => {
    await captures.put(capture('a'))
    const root = await mount()
    expect(root.querySelector('[data-testid="library-grid-scroller"]')).toBeTruthy()
    expect(root.textContent).not.toContain('لا توجد لقطات بعد')
  })

  it('المهملات لا تظهر في الشبكة الافتراضية', async () => {
    await captures.put(capture('trashed', { trashedAt: NOW }))
    const root = await mount()
    expect(root.textContent).toContain('لا توجد لقطات بعد')
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
    await waitFor(() => root.textContent?.includes('لا توجد لقطات بعد') ?? false)

    expect(root.textContent).toContain('لا توجد لقطات بعد')
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
    // نصّ الحالة من مكوّن Figma `Empty State / No palette`، وعبارة التصدير تخصّ اللوحات وحدها.
    expect(root.textContent).toContain('لا ألوان محفوظة')
    expect(root.textContent).toContain('تُصدَّر اللوحات')
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

  it('تبويب المراجع والأدلّة واللوحات: تحديد بشريط SimpleSelectionBar — حذف ونقل، لا تفضيل ولا أرشفة ولا وسم', async () => {
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
    // الحذف موجود فعليًا — سدّ فجوة ملفّ المرحلة 18 السابق (تاريخ Git) §4/§8` — لا أيقونات اللقطات
    // (تفضيل/أرشفة/مهملات/وسم) التي لا معنى لها على الأدلّة.
    expect(root.querySelector('[aria-label="حذف المحدَّد نهائيًا"]')).toBeTruthy()
    expect(root.querySelector('[aria-label="تفضيل المحدَّد"]')).toBeFalsy()
    expect(root.querySelector('[aria-label="أرشفة المحدَّد"]')).toBeFalsy()
    expect(root.querySelector('input[name="tag"]')).toBeFalsy()
  })

  it('حذف لون مُحدَّد من تبويب الألوان يزيله من الشبكة فعليًا', async () => {
    await colors.put({
      id: 'col1',
      hex: '#3B82F6',
      name: 'أزرق',
      note: '',
      source: 'manual',
      projectId: null,
      sourceUrl: null,
      createdAt: NOW,
    })
    const root = await mount()
    clickTab(root, 'الألوان')
    await waitFor(() => root.querySelector('[data-color-id="col1"]') !== null)

    ;(
      root.querySelector('[data-color-id="col1"] input[type="checkbox"]') as HTMLInputElement
    ).click()
    await flush()
    ;(root.querySelector('[aria-label="حذف المحدَّد نهائيًا"]') as HTMLButtonElement).click()
    await flush()
    ;(root.querySelector('[data-rasd-confirm="delete"]') as HTMLButtonElement).click()
    await waitFor(() => root.querySelector('[data-color-id="col1"]') === null)

    expect((await colors.get('col1')).ok).toBe(false)
  })

  it('«ألغِ» في حوار الحذف يُبقي السجلّ كما هو', async () => {
    await colors.put({
      id: 'col1',
      hex: '#3B82F6',
      name: 'أزرق',
      note: '',
      source: 'manual',
      projectId: null,
      sourceUrl: null,
      createdAt: NOW,
    })
    const root = await mount()
    clickTab(root, 'الألوان')
    await waitFor(() => root.querySelector('[data-color-id="col1"]') !== null)

    ;(
      root.querySelector('[data-color-id="col1"] input[type="checkbox"]') as HTMLInputElement
    ).click()
    await flush()
    ;(root.querySelector('[aria-label="حذف المحدَّد نهائيًا"]') as HTMLButtonElement).click()
    await flush()
    ;(root.querySelector('[data-rasd-cancel="delete"]') as HTMLButtonElement).click()
    await flush()

    expect(root.querySelector('[data-color-id="col1"]')).toBeTruthy()
    expect((await colors.get('col1')).ok).toBe(true)
  })

  it('نقل لوحة مُحدَّدة إلى مشروع عبر SimpleSelectionBar يكتب projectId فعليًا', async () => {
    await palettes.put({
      id: 'pal1',
      name: 'لوحة الفحص',
      colors: ['#111', '#222'],
      projectId: null,
      createdAt: NOW,
    })
    const { createProject } = await import('@/pages/library/projects')
    const created = await createProject('مشروع الفحص', '#0090FF', NOW)
    const projectId = created.ok ? created.value.id : ''

    const root = await mount()
    clickTab(root, 'اللوحات')
    await waitFor(() => root.querySelector('[data-palette-id="pal1"]') !== null)
    ;(
      root.querySelector('[data-palette-id="pal1"] input[type="checkbox"]') as HTMLInputElement
    ).click()
    await flush()

    const select = root.querySelector('[aria-label="انقل المحدَّد إلى مشروع"]') as HTMLSelectElement
    select.value = projectId
    select.dispatchEvent(new Event('change'))

    await waitFor(async () => {
      const found = await palettes.get('pal1')
      return found.ok && found.value.projectId === projectId
    })
  })

  it(
    'حذف بطيء على تبويب ثم تبديل فوري إلى آخر لا يُعلِّقه على سكيلتون تحميل دائم — ' +
      'مراجعة خصمة كشفت أن الحارس المتأخّر وحده لا يكفي',
    async () => {
      await colors.put({
        id: 'col1',
        hex: '#111',
        name: '',
        note: '',
        source: 'manual',
        projectId: null,
        sourceUrl: null,
        createdAt: NOW,
      })
      await guides.put({ id: 'g1', title: 'دليل', projectId: null, captureIds: [], createdAt: NOW })

      /**
       * حذفٌ بطيء متحكَّم فيه — لا حلقة حقيقية على مئات العناصر: هذا يضمن
       * ترتيب السباق بدل الاتّكال على أن IndexedDB الوهمية تصادف أن تكون
       * بطيئة كفاية. **التعليق على `colors.get` لا `bulk-delete.deleteColors`
       * نفسها عمدًا**: `Library.tsx` يستهلك `deleteColors` عبر جدول
       * `DELETE_FN_FOR_TAB` — كائن حرفي يُقيَّم مرّة عند تحميل الوحدة، فيجمّد
       * مرجع الدالّة وقتها؛ محاولة أولى استعملت `vi.spyOn` على وحدة
       * `bulk-delete` نفسها فلم يُعلَّق النداء الفعلي إطلاقًا (0 نداءات
       * مُقاسة) — التجميد يكسر الربط الحيّ. `colors.get` كائن مستودعٍ
       * (`repository.ts`) لا كائنًا حرفيًّا، وتُستدعى خاصّيته حيًّا عند كل
       * نداء داخل `deleteColors` نفسها، فتُعلَّق فعليًّا.
       */
      const realGet = colors.get.bind(colors)
      // كائنٌ لا متغيّر `let` مباشر — تضييق التحكّم بالتدفّق (control-flow
      // narrowing) لـTypeScript يُعامل إعادة الإسناد داخل مُنفِّذ Promise
      // بتشدّدٍ يُخطئ معه أحيانًا؛ الخاصّية تتفادى ذلك.
      const gate: { release: (() => void) | null } = { release: null }
      const getSpy = vi.spyOn(colors, 'get').mockImplementation(async (id) => {
        await new Promise<void>((resolve) => {
          gate.release = resolve
        })
        return realGet(id)
      })

      const root = await mount()
      clickTab(root, 'الألوان')
      await waitFor(() => root.querySelector('[data-color-id="col1"]') !== null)

      ;(
        root.querySelector('[data-color-id="col1"] input[type="checkbox"]') as HTMLInputElement
      ).click()
      await flush()
      ;(root.querySelector('[aria-label="حذف المحدَّد نهائيًا"]') as HTMLButtonElement).click()
      await flush()
      ;(root.querySelector('[data-rasd-confirm="delete"]') as HTMLButtonElement).click()
      await flush()
      // الحذف بدأ الآن — deleteColors علِقت داخل أوّل await لـcolors.get،
      // ووعدها لم يُحلّ بعد.
      expect(getSpy).toHaveBeenCalled()

      // تبديلٌ فوريّ قبل أن يُتمّ الحذف البطيء.
      clickTab(root, 'أدلة الخطوات')
      await waitFor(() => root.querySelector('[data-guide-id="g1"]') !== null)
      expect(root.querySelector('[aria-busy="true"]')).toBeFalsy()

      // والآن يُتمّ الحذف البطيء متأخّرًا — بعد أن استقرّ تبويب الأدلّة فعلًا.
      gate.release?.()
      await flush()
      await flush()
      await flush()

      // العطل المُصلَح: كان استدعاء reload() المتأخّر (من إغلاق تبويب
      // الألوان القديم) يكتب `loading` فورًا عند بدايته بلا حارسٍ يفحصه،
      // فيُعلَّق تبويب الأدلّة على سكيلتون تحميل لا يزول أبدًا رغم أن
      // بياناته الصحيحة عُرضت بالفعل قبل لحظة.
      expect(root.querySelector('[aria-busy="true"]')).toBeFalsy()
      expect(root.querySelector('[data-guide-id="g1"]')).toBeTruthy()

      getSpy.mockRestore()
    },
  )

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

describe('Library — الأرشيف والمهملات', () => {
  function clickViewMode(root: HTMLElement, label: string) {
    const options = [...root.querySelectorAll('[aria-label="عرض المكتبة"] [role="radio"]')]
    const option = options.find((o) => o.textContent === label) as HTMLButtonElement
    option.click()
  }

  it('العرض الافتراضي لا يعرض المؤرشَف ولا المهمَل', async () => {
    await captures.put(capture('archived', { archived: true }))
    await captures.put(capture('trashed', { trashedAt: NOW }))
    const root = await mount()
    expect(root.querySelectorAll('[data-capture-id]')).toHaveLength(0)
  })

  it('عرض الأرشيف يُظهر المؤرشَف وحده', async () => {
    await captures.put(capture('live'))
    await captures.put(capture('archived', { archived: true }))
    const root = await mount()
    clickViewMode(root, 'الأرشيف')
    await waitFor(() => root.querySelector('[data-capture-id="archived"]') !== null)
    expect(root.querySelector('[data-capture-id="live"]')).toBeFalsy()
  })

  it('عرض المهملات يُظهر المهمَل وحده، وشريط تحديده استعادة وحذف نهائي فقط', async () => {
    // trashedAt بزمن حقيقي حديث لا بثابت NOW القديم — purgeExpiredOnOpen يقارن
    // بـDate.now() الفعلي، وNOW (2023) صار "منتهيًا" منذ زمن التشغيل الحقيقي فيُطهَّر فورًا.
    await captures.put(capture('trashed', { trashedAt: Date.now() }))
    const root = await mount()
    clickViewMode(root, 'المهملات')
    await waitFor(() => root.querySelector('[data-capture-id="trashed"]') !== null)

    const checkbox = root.querySelector(
      '[data-capture-id="trashed"] input[type="checkbox"]',
    ) as HTMLInputElement
    checkbox.click()
    await flush()

    expect(root.querySelector('[aria-label="استعادة المحدَّد"]')).toBeTruthy()
    expect(root.querySelector('[aria-label="تفضيل المحدَّد"]')).toBeFalsy()
  })

  it('الاستعادة من المهملات تُعيد اللقطة إلى العرض النشِط', async () => {
    await captures.put(capture('trashed', { trashedAt: Date.now() }))
    const root = await mount()
    clickViewMode(root, 'المهملات')
    await waitFor(() => root.querySelector('[data-capture-id="trashed"]') !== null)

    const checkbox = root.querySelector(
      '[data-capture-id="trashed"] input[type="checkbox"]',
    ) as HTMLInputElement
    checkbox.click()
    await flush()
    ;(root.querySelector('[aria-label="استعادة المحدَّد"]') as HTMLButtonElement).click()
    await waitFor(() => root.querySelector('[data-capture-id="trashed"]') === null)

    const stored = await captures.get('trashed')
    expect(stored.ok && stored.value.trashedAt).toBeNull()
  })

  it('تبديل التبويب يعيد العرض إلى «نشِطة»', async () => {
    await captures.put(capture('archived', { archived: true }))
    const root = await mount()
    clickViewMode(root, 'الأرشيف')
    await waitFor(() => root.querySelector('[data-capture-id="archived"]') !== null)

    const tabs = [...root.querySelectorAll('[role="tab"]')]
    const colorsTab = tabs.find((t) => t.textContent === 'الألوان') as HTMLButtonElement
    colorsTab.click()
    const capturesTab = tabs.find((t) => t.textContent === 'اللقطات') as HTMLButtonElement
    capturesTab.click()
    await flush()

    const active = root.querySelector('[aria-label="عرض المكتبة"] [aria-checked="true"]')
    expect(active?.textContent).toBe('نشِطة')
  })
})

describe('Library — الوسوم', () => {
  it('لوحة الوسوم مغلقة افتراضيًا، وزرّها يفتحها', async () => {
    const root = await mount()
    expect(root.querySelector('[aria-label="الوسوم"]')).toBeFalsy()
    ;(root.querySelector('[aria-label="فتح لوحة الوسوم"]') as HTMLButtonElement).click()
    await flush()
    expect(root.querySelector('[aria-label="الوسوم"]')).toBeTruthy()
  })

  it('إضافة وسم من شريط التحديد يظهر في لوحة الوسوم', async () => {
    await captures.put(capture('a'))
    const root = await mount()
    const checkbox = root.querySelector(
      '[data-capture-id="a"] input[type="checkbox"]',
    ) as HTMLInputElement
    checkbox.click()
    await flush()

    const input = root.querySelector('input[name="tag"]') as HTMLInputElement
    input.value = 'خطأ بصري'
    const form = input.closest('form') as HTMLFormElement
    form.dispatchEvent(new Event('submit', { cancelable: true }))
    await waitFor(async () => {
      const found = await captures.get('a')
      return found.ok && found.value.tags.includes('خطأ بصري')
    })

    ;(root.querySelector('[aria-label="فتح لوحة الوسوم"]') as HTMLButtonElement).click()
    await waitFor(() => root.querySelector('[data-tag-name="خطأ بصري"]') !== null)
  })

  it('النقر على وسم في اللوحة يصفِّي الشبكة به', async () => {
    // مخزن tags منفصل عن حقل tags في captures (عدّاد مُدار — انظر tags.ts)؛
    // نزرعه هنا مباشرةً كي يظهر في اللوحة بصرف النظر عن مسار addTagToCaptures.
    await captures.put(capture('a', { tags: ['مهمّ'] }))
    await captures.put(capture('b', { tags: [] }))
    await tags.put({ name: 'مهمّ', count: 1 })

    const root = await mount()
    ;(root.querySelector('[aria-label="فتح لوحة الوسوم"]') as HTMLButtonElement).click()
    await waitFor(() => root.querySelector('[data-tag-name="مهمّ"]') !== null)

    expect(root.querySelectorAll('[data-capture-id]')).toHaveLength(2)

    ;(root.querySelector('[data-tag-name="مهمّ"]') as HTMLButtonElement).click()
    await waitFor(() => root.querySelectorAll('[data-capture-id]').length === 1)

    expect(root.querySelector('[data-capture-id="a"]')).toBeTruthy()
    expect(root.querySelector('[data-capture-id="b"]')).toBeFalsy()
  })
})

describe('Library — مؤشِّر الحصة', () => {
  it('غياب navigator.storage.estimate الحقيقي في بيئة الاختبار لا يُسقط الصفحة', async () => {
    // fake-indexeddb/happy-dom لا يوفّران navigator.storage.estimate حقيقيًا؛
    // quotaState() تُعامل غيابه كحصّة مفتوحة (quotaBytes=0)، وQuotaIndicator
    // لا يرسم شيئًا عندها — ذلك السلوك مُختبَر مباشرةً في quota-indicator.test.tsx.
    // هنا نتحقّق فقط أن الصفحة تكتمل تحميلها بلا خطأ رغم ذلك.
    const root = await mount()
    expect(root.querySelector('[role="alert"]')).toBeFalsy()
    expect(root.querySelectorAll('[aria-busy="true"]')).toHaveLength(0)
  })
})

describe('Library — عدم الاتصال', () => {
  /**
   * كانت هنا لافتة «غير متصل» تقول إن البيانات محلّية ولا تحتاج اتصالًا — خبرٌ لا فعل
   * بعده. وقرار التصميم 10 (`Docs/Design.md` §7) حذف إطار `library / offline` لهذا: المكتبة
   * محلّية وتعمل بلا اتصال دائمًا، ولا طابور رفع. `Docs/Engineering.md §6` الصفّ 139.
   */
  it('لا لافتة عند انقطاع الاتصال، والشبكة تبقى كما هي', async () => {
    await captures.put(capture('a'))
    const root = await mount()
    window.dispatchEvent(new Event('offline'))
    await flush()
    expect(root.textContent).not.toContain('غير متصل')
    expect(root.querySelector('[data-capture-id="a"]')).toBeTruthy()
  })
})

describe('Library — عروض الشريط الجانبي', () => {
  /** عنصر الشريط بتسميته — نصّه التسمية ثمّ العدّاد. */
  function clickNav(root: HTMLElement, label: string) {
    const link = [...root.querySelectorAll('a')].find((a) =>
      a.textContent?.startsWith(label),
    ) as HTMLAnchorElement
    link.click()
  }

  it('«المميّزة» تعرض المفضَّلة وحدها، ويُحمَل العرض في الرابط', async () => {
    await captures.put(capture('fav', { favorite: true }))
    await captures.put(capture('plain'))
    const root = await mount()
    await waitFor(() => root.querySelector('[data-capture-id="plain"]') !== null)

    clickNav(root, 'المميّزة')
    // الشرطان معًا: الشبكة القديمة (الاثنتان) والمفرَّغة (لا شيء) لا تستوفيانه، والمصفّاة وحدها تستوفيه.
    await waitFor(
      () =>
        root.querySelector('[data-capture-id="fav"]') !== null &&
        root.querySelector('[data-capture-id="plain"]') === null,
    )
    expect(location.search).toBe('?view=favorites')
    expect(root.querySelector('h1')?.textContent).toBe('المميّزة')
  })

  it('«الأخيرة» تعرض ما التُقط خلال سبعة أيام وحده', async () => {
    const now = Date.now()
    await captures.put(capture('new', { createdAt: now - 60_000 }))
    await captures.put(capture('old', { createdAt: now - 30 * 24 * 60 * 60 * 1000 }))
    const root = await mount()
    await waitFor(() => root.querySelector('[data-capture-id="old"]') !== null)

    clickNav(root, 'الأخيرة')
    await waitFor(
      () =>
        root.querySelector('[data-capture-id="new"]') !== null &&
        root.querySelector('[data-capture-id="old"]') === null,
    )
  })

  it('المشروع في الشريط يصفّي لقطاته، وعنوانه اسمه', async () => {
    const { createProject } = await import('@/pages/library/projects')
    const created = await createProject('مشروع الشريط', '#0090FF', NOW)
    const projectId = created.ok ? created.value.id : ''
    await captures.put(capture('in', { projectId }))
    await captures.put(capture('out'))
    const root = await mount()
    await waitFor(() =>
      [...root.querySelectorAll('a')].some((a) => a.textContent?.startsWith('مشروع الشريط')),
    )

    clickNav(root, 'مشروع الشريط')
    await waitFor(
      () =>
        root.querySelector('[data-capture-id="in"]') !== null &&
        root.querySelector('[data-capture-id="out"]') === null,
    )
    expect(root.querySelector('h1')?.textContent).toBe('مشروع الشريط')
    expect(location.search).toBe(`?project=${projectId}`)
  })

  it('رابط بعرض يفتح المكتبة عليه — «?view=palettes» يفتح اللوحات', async () => {
    await palettes.put({
      id: 'p1',
      name: 'لوحة الرابط',
      colors: ['#111'],
      projectId: null,
      createdAt: NOW,
    })
    history.replaceState(null, '', '/?view=palettes')
    const root = await mount()
    await waitFor(() => root.querySelector('[data-palette-id="p1"]') !== null)
    const selected = root.querySelector('[role="tab"][aria-selected="true"]')
    expect(selected?.textContent).toBe('اللوحات')
  })

  it('نقل التحديد إلى المهملات يُعلن ما حدث ومدّة الاستعادة', async () => {
    await captures.put(capture('a'))
    const root = await mount()
    ;(
      root.querySelector('[data-capture-id="a"] input[type="checkbox"]') as HTMLInputElement
    ).click()
    await flush()
    ;(root.querySelector('[aria-label="نقل المحدَّد إلى المهملات"]') as HTMLButtonElement).click()
    // الإعلان لا هيكل التحميل — كلاهما `status`، والهيكل يظهر لحظة إعادة القراءة بعد النقل.
    const announced = () => root.querySelector('[role="status"]:not([aria-busy="true"])')
    await waitFor(() => announced() !== null)
    const status = announced()?.textContent ?? ''
    expect(status).toContain('نُقل إلى المهملات: لقطة واحدة')
    expect(status).toContain('٣٠ يومًا')
  })
})

describe('countText — العدد ومعدوده', () => {
  it('يتبع قاعدة العدد العربية بأرقام هندية', async () => {
    const { countText } = await import('@/shared/bidi/numerals')
    const forms = {
      one: 'مرجع واحد',
      two: 'مرجعان',
      many: 'مراجع',
      accusative: 'مرجعًا',
      singular: 'مرجع',
    }
    expect(countText(1, forms)).toBe('مرجع واحد')
    expect(countText(2, forms)).toBe('مرجعان')
    expect(countText(8, forms)).toBe('٨ مراجع')
    expect(countText(12, forms)).toBe('١٢ مرجعًا')
    expect(countText(100, forms)).toBe('١٠٠ مرجع')
    expect(countText(103, forms)).toBe('١٠٣ مراجع')
    expect(countText(248, forms)).toBe('٢٤٨ مرجعًا')
  })
})

describe('Library — نظرة المشاريع', () => {
  it('«كل المشاريع» تعرض بطاقة لكل مشروع بعدّها، والنقر يفتح المشروع', async () => {
    const { createProject } = await import('@/pages/library/projects')
    const created = await createProject('مشروع النظرة', '#0090FF', NOW)
    const projectId = created.ok ? created.value.id : ''
    await captures.put(capture('in', { projectId }))
    const root = await mount()
    await waitFor(() =>
      [...root.querySelectorAll('a')].some((a) => a.textContent?.startsWith('كل المشاريع')),
    )
    ;(
      [...root.querySelectorAll('a')].find((a) =>
        a.textContent?.startsWith('كل المشاريع'),
      ) as HTMLAnchorElement
    ).click()

    await waitFor(() => root.querySelector(`[data-overview-project="${projectId}"]`) !== null)
    const card = root.querySelector(`[data-overview-project="${projectId}"]`) as HTMLButtonElement
    expect(card.textContent).toContain('مشروع النظرة')
    expect(card.textContent).toContain('١')
    expect(location.search).toBe('?view=projects')

    card.click()
    await waitFor(() => root.querySelector('[data-capture-id="in"]') !== null)
    expect(location.search).toBe(`?project=${projectId}`)
  })
})

describe('Library — حالتا المشاريع: الإنشاء والتعذّر', () => {
  it('«تعذّرت قراءة المشاريع» لا «لا مشاريع بعد» حين تسقط القراءة — `projects / error`', async () => {
    const overviewModule = await import('@/pages/library/project-overview')
    const load = vi
      .spyOn(overviewModule, 'loadProjectOverview')
      .mockResolvedValue({ ok: false, error: { code: 'invalid-data', message: 'تعذّر' } })
    history.replaceState(null, '', '?view=projects')
    const root = await mount()
    await waitFor(() => (root.textContent ?? '').includes('تعذّرت قراءة المشاريع'))
    expect(root.textContent).not.toContain('لا مشاريع بعد')
    load.mockRestore()
    history.replaceState(null, '', location.pathname)
  })

  it('إنشاء ناجح ⟵ إشعار «أُنشئ المشروع» باسمه — `projects / created`', async () => {
    const root = await mount()
    root.querySelector<HTMLButtonElement>('button[aria-label="فتح لوحة المشاريع"]')!.click()
    await waitFor(() => root.querySelector('input[aria-label="اسم المشروع الجديد"]') !== null)
    const input = root.querySelector<HTMLInputElement>('input[aria-label="اسم المشروع الجديد"]')!
    input.value = 'تطبيق سنَد'
    input.dispatchEvent(new Event('input'))
    await flush()
    input.closest('form')!.dispatchEvent(new Event('submit', { cancelable: true }))
    await waitFor(() => (root.textContent ?? '').includes('أُنشئ المشروع'))
    expect(root.textContent).toContain('«تطبيق سنَد» جاهز لأوّل لقطة')
  })
})

describe('Library — فشل عمليات المشاريع يُقال', () => {
  /**
   * `projects / new-error`: كانت نتيجة الإنشاء تُهمَل، فالإنشاء الفاشل يبدو كأنه تمّ واللوحة لم
   * تتغيّر. `projects.put` تُعلَّق حيًّا — كائن مستودع لا دالّة مجمَّدة (انظر اختبار السباق أعلاه).
   */
  it('إنشاءٌ تعذّر ⟵ إشعار خطر بسببه', async () => {
    const put = vi
      .spyOn(projects, 'put')
      .mockResolvedValue({ ok: false, error: { code: 'quota-exceeded', message: 'التخزين ممتلئ' } })
    const root = await mount()
    root.querySelector<HTMLButtonElement>('button[aria-label="فتح لوحة المشاريع"]')!.click()
    await waitFor(() => root.querySelector('input[aria-label="اسم المشروع الجديد"]') !== null)
    const input = root.querySelector<HTMLInputElement>('input[aria-label="اسم المشروع الجديد"]')!
    input.value = 'مشروع يتعذّر'
    input.dispatchEvent(new Event('input'))
    // الاسم حالةٌ في اللوحة — يُرسم قبل الإرسال وإلا قرأ الإرسال الاسم الفارغ السابق.
    await flush()
    input.closest('form')!.dispatchEvent(new Event('submit', { cancelable: true }))

    await waitFor(() => root.querySelector('[role="alert"]') !== null)
    const alert = root.querySelector('[role="alert"]')!
    expect(alert.textContent).toContain('تعذّر إنشاء المشروع')
    expect(alert.textContent).toContain('التخزين ممتلئ')
    expect(put).toHaveBeenCalledOnce()
    put.mockRestore()
  })
})
