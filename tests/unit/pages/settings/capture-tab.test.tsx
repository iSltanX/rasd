import { render } from 'preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CaptureTab } from '@/pages/settings/parts/CaptureTab'
import { ok } from '@/shared/result'
import { defaultSettings, type Settings } from '@/shared/settings'

/**
 * «احفظ نسخة في مجلّد التنزيلات» — مفتاحٌ حقيقي يطلب الصلاحية الاختيارية `downloads` من
 * إيماءة القلب نفسها، ولا يحفظ القيمة إن رُفضت: مفتاحٌ يبقى «مفعَّلًا» بلا صلاحية يعِد بنسخة
 * لن تصل، وهو بعينه الضابط الصامت الذي يمنعه `AGENTS.md` §4.
 */

const LABEL = 'احفظ نسخة في مجلّد التنزيلات'
const REFUSED = 'رُفضت صلاحية التنزيلات — تبقى اللقطات في المكتبة وحدها.'
const MISSING =
  'صلاحية التنزيلات غير ممنوحة — لا تُحفظ نسخة حتى تمنحها. أطفئ المفتاح ثم أعد تشغيله.'
const NORMAL = 'نسخة من كل لقطة في مجلّد التنزيلات، داخل مجلّد «رصد».'

let container: HTMLDivElement | null = null
let request: ReturnType<typeof vi.fn>
let contains: ReturnType<typeof vi.fn>
let remove: ReturnType<typeof vi.fn>

beforeEach(() => {
  request = vi.fn().mockResolvedValue(true)
  contains = vi.fn().mockResolvedValue(true)
  remove = vi.fn().mockResolvedValue(true)
  Object.assign(globalThis.chrome, { permissions: { request, contains, remove } })
})

afterEach(() => {
  if (container) {
    render(null, container)
    container.remove()
    container = null
  }
})

const flush = () => new Promise((r) => setTimeout(r, 0))

async function mount(saveLocation: 'library' | 'library-and-downloads') {
  const base = defaultSettings()
  const settings: Settings = { ...base, capture: { ...base.capture, saveLocation } }
  const onSave = vi.fn(() => Promise.resolve(ok(settings)))
  container = document.createElement('div')
  document.body.appendChild(container)
  render(
    <CaptureTab
      settings={settings}
      onSave={onSave}
      // كما في الصفحة: الحفظ يُنفَّذ فورًا والإعلان شأن الصفحة.
      persist={(op) => void op()}
    />,
    container,
  )
  // استطلاع الصلاحية عند التركيب.
  await flush()
  return { root: container, onSave }
}

function toggle(root: HTMLElement): HTMLInputElement {
  return root.querySelector<HTMLInputElement>(`input[role="switch"][aria-label="${LABEL}"]`)!
}

function hint(root: HTMLElement): string {
  return root.querySelector('#capture-downloads-hint')?.textContent ?? ''
}

describe('CaptureTab — نسخة التنزيلات', () => {
  it('مفتاح حقيقي لا شارة «قريبًا»', async () => {
    const { root } = await mount('library')
    expect(toggle(root)).not.toBeNull()
    expect(root.textContent).not.toContain('قريبًا')
    expect(toggle(root).checked).toBe(false)
    expect(hint(root)).toBe(NORMAL)
  })

  it('القلب إلى التشغيل يطلب الصلاحية **متزامنًا** من النقرة — قبل أي انتظار', async () => {
    const { root } = await mount('library')

    toggle(root).click()

    // لا `await` بين النقرة والتحقّق: الطلب لو تأخّر ولو بمهمّة واحدة انكسرت سلسلة الإيماءة.
    expect(request).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledWith({ permissions: ['downloads'] })
  })

  it('منحُ الصلاحية ⟵ يُحفَظ library-and-downloads', async () => {
    const { root, onSave } = await mount('library')

    toggle(root).click()
    await vi.waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))

    expect(onSave).toHaveBeenCalledWith({ saveLocation: 'library-and-downloads' })
  })

  it('**رفضُ الصلاحية ⟵ لا يُحفَظ شيء** ويظهر سبب الرفض ويرجع المفتاح مطفأً', async () => {
    request.mockResolvedValue(false)
    const { root, onSave } = await mount('library')

    toggle(root).click()
    await vi.waitFor(() => expect(hint(root)).toBe(REFUSED))

    expect(onSave).not.toHaveBeenCalled()
    expect(toggle(root).checked).toBe(false)
  })

  it('الرفض الثاني يُرجع المفتاح مطفأً أيضًا — لا يبقى «مفعَّلًا» في الشاشة بلا قيمة محفوظة', async () => {
    request.mockResolvedValue(false)
    const { root, onSave } = await mount('library')

    toggle(root).click()
    await vi.waitFor(() => expect(hint(root)).toBe(REFUSED))
    toggle(root).click()
    await flush()
    await flush()

    expect(request).toHaveBeenCalledTimes(2)
    expect(onSave).not.toHaveBeenCalled()
    expect(toggle(root).checked).toBe(false)
  })

  it('عطل تقني في الطلب (رمي) يُعامَل كالرفض: لا حفظ ولا انكسار', async () => {
    request.mockRejectedValue(new Error('This function must be called during a user gesture'))
    const { root, onSave } = await mount('library')

    toggle(root).click()
    await vi.waitFor(() => expect(hint(root)).toBe(REFUSED))

    expect(onSave).not.toHaveBeenCalled()
  })

  it('الإطفاء ⟵ يُحفَظ library ولا تُسحَب الصلاحية ولا يُطلب شيء (التصدير يستعملها)', async () => {
    const { root, onSave } = await mount('library-and-downloads')
    expect(toggle(root).checked).toBe(true)

    toggle(root).click()
    await vi.waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))

    expect(onSave).toHaveBeenCalledWith({ saveLocation: 'library' })
    expect(request).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
  })

  it('محفوظ library-and-downloads والصلاحية ممنوحة ⟵ التلميح العادي', async () => {
    const { root } = await mount('library-and-downloads')
    expect(contains).toHaveBeenCalledWith({ permissions: ['downloads'] })
    expect(hint(root)).toBe(NORMAL)
  })

  it('**محفوظ library-and-downloads والصلاحية سُحبت ⟵ تلميح يسمّي العطل وعلاجه**', async () => {
    contains.mockResolvedValue(false)

    const { root, onSave } = await mount('library-and-downloads')

    await vi.waitFor(() => expect(hint(root)).toBe(MISSING))
    // القيمة المحفوظة لا تُمسّ: قرار المستخدم يبقى، والواجهة تُخبره فقط.
    expect(onSave).not.toHaveBeenCalled()
    expect(toggle(root).checked).toBe(true)
  })

  it('نصّ المفتاح لا يحمل رقم مرحلة', async () => {
    const { root } = await mount('library')
    expect(root.textContent).not.toMatch(/المرحلة\s*[\d٠-٩]/)
  })
})
