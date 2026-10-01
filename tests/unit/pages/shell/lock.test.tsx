import 'fake-indexeddb/auto'

import { render } from 'preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { enableLock, lockStatus } from '@/modules/privacy/lock'
import { Library } from '@/pages/library/Library'
import { LockRow } from '@/pages/settings/parts/lock/LockRow'
import { mismatched } from '@/pages/settings/parts/lock/SetupDialog'
import { minutesText } from '@/pages/shell/lock/lock-text'
import { stripIsolates } from '@/shared/bidi/isolate'
import { closeDatabase, setIncognitoWritePolicy } from '@/shared/storage/db'
import { forgetLockSnapshot } from '@/shared/storage/lock-state'
import { captures, putCaptureWithBlob } from '@/shared/storage/repository'
import { DB_NAME, type CaptureRecord } from '@/shared/storage/schema'

import type { JSX } from 'preact'

/**
 * واجهة القفل — `library / locked` ونوافذ `lock / *` (ADR 0043). المحرّك مختبَرٌ في
 * `tests/unit/modules/privacy/lock.test.ts`؛ هنا ما يراه المستخدم وما يُركَّب أو لا يُركَّب.
 *
 * القياس يُستبدل بعددٍ صغير كي لا ينتظر التفعيل 600ms في كل اختبار — والقياس نفسه مختبَرٌ هناك.
 */
vi.mock('@/modules/privacy/kdf', async (original) => ({
  ...(await original<typeof import('@/modules/privacy/kdf')>()),
  calibrateIterations: () => Promise.resolve(1000),
}))

const CODE = 'رمز-المكتبة-٢٠٢٦'

let container: HTMLDivElement | null = null

function mount(node: JSX.Element) {
  container = document.createElement('div')
  document.body.appendChild(container)
  render(node, container)
  return container
}

const text = () => stripIsolates(container?.textContent ?? '')
const query = <E extends Element>(selector: string) =>
  container?.querySelector<E>(selector) ?? document.querySelector<E>(selector)

/** يكتب ثمّ ينتظر إعادة الرسم — الزرّ يُعطَّل ويُفعَّل بما في الحقل، و`setState` لا يُرسم متزامنًا. */
async function type(selector: string, value: string) {
  const input = query<HTMLInputElement>(selector)
  if (!input) throw new Error(`لا حقل ${selector}`)
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await new Promise((r) => setTimeout(r, 0))
}

function click(label: string) {
  const button = [...document.querySelectorAll('button')].find(
    (b) => stripIsolates(b.textContent ?? '').trim() === label,
  )
  if (!button) throw new Error(`لا زرّ «${label}»`)
  button.click()
}

function capture(id: string): CaptureRecord {
  return {
    id,
    createdAt: Date.now(),
    origin: 'https://shop.example',
    url: 'https://shop.example/cart',
    title: 'سلّة المتجر',
    kind: 'viewport',
    status: 'ready',
    projectId: null,
    tags: [],
    width: 10,
    height: 10,
    devicePixelRatio: 1,
    favorite: false,
    archived: false,
    trashedAt: null,
  }
}

async function lockedLibrary() {
  expect((await putCaptureWithBlob(capture('c1'), new Blob(['png']))).ok).toBe(true)
  expect((await enableLock(CODE, { iterations: 1000 })).ok).toBe(true)
  await chrome.storage.session.clear()
  forgetLockSnapshot()
}

beforeEach(async () => {
  setIncognitoWritePolicy(false)
  await closeDatabase()
  indexedDB.deleteDatabase(DB_NAME)
  forgetLockSnapshot()
  await new Promise((r) => setTimeout(r, 0))
})

afterEach(() => {
  if (container) {
    render(null, container)
    container.remove()
    container = null
  }
  vi.restoreAllMocks()
})

describe('المكتبة المقفلة — `library / locked`', () => {
  it('نافذة الفكّ فوق هيكلٍ فارغ، ولا شيء من المكتبة يُعرض', async () => {
    await lockedLibrary()
    mount(<Library />)
    await vi.waitFor(() => expect(query('[data-library-locked]')).not.toBeNull())
    expect(query('[data-data-dialog="lock-unlock"]')).not.toBeNull()
    expect(text()).toContain('لا تُقرأ لقطة قبل إدخال الرمز.')
    expect(text()).not.toContain('سلّة المتجر')
    // لا «×»: لا شيء خلف النافذة يُعاد إليه.
    expect(query('[aria-label="أغلق"]')).toBeNull()
  })

  it('الرمز الصحيح يركّب المكتبة فتُقرأ', async () => {
    await lockedLibrary()
    mount(<Library />)
    await vi.waitFor(() => expect(query('#lock-code')).not.toBeNull())
    await type('#lock-code', CODE)
    click('افتح')
    await vi.waitFor(() => expect(query('[data-library-locked]')).toBeNull(), { timeout: 3000 })
    await vi.waitFor(() => expect(text()).toContain('سلّة المتجر'), { timeout: 3000 })
  })

  it('الرمز الخاطئ يقول ما بقي قبل المهلة، والمكتبة تبقى مقفلة', async () => {
    await lockedLibrary()
    mount(<Library />)
    await vi.waitFor(() => expect(query('#lock-code')).not.toBeNull())
    await type('#lock-code', 'رمز-خاطئ-تمامًا')
    click('افتح')
    await vi.waitFor(() =>
      expect(text()).toContain('الرمز غير صحيح. بقيت ٤ محاولات قبل مهلة دقيقة'),
    )
    expect(query('[data-phase="wrong"]')).not.toBeNull()
    expect(query('[data-library-locked]')).not.toBeNull()
  })

  it('«نسيت الرمز» يطلب كلمة «احذف» ثمّ يحذف المكتبة ويُزيل القفل — لا يفتحها', async () => {
    await lockedLibrary()
    mount(<Library />)
    await vi.waitFor(() => expect(query('#lock-code')).not.toBeNull())
    click('نسيت الرمز')
    await vi.waitFor(() => expect(query('[data-data-dialog="lock-forgot"]')).not.toBeNull())
    expect(text()).toContain('رصد لا يحفظ الرمز')
    expect(text()).not.toContain('مشفّرة')
    const erase = [...document.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('احذف المكتبة'),
    )
    expect(erase?.disabled).toBe(true)

    await type('#lock-forgot-word', 'احذف')
    click('احذف المكتبة')
    await vi.waitFor(async () => expect((await lockStatus()).mode).toBe('off'), { timeout: 3000 })
    const counted = await captures.count()
    expect(counted.ok && counted.value).toBe(0)
  })
})

describe('صفّ «قفل المكتبة» في الخصوصية', () => {
  it('المفتاح يفتح التفعيل بالنسخة الاحتياطية أوّلًا، ولا يُفعَّل برمزين مختلفين', async () => {
    mount(<LockRow />)
    await vi.waitFor(() => expect(query('[data-lock-mode="off"]')).not.toBeNull())
    expect(text()).toContain('لا يشفّر ملفّاتها على القرص')
    query<HTMLButtonElement>('[aria-label="قفل المكتبة"]')?.click()

    await vi.waitFor(() => expect(query('[data-data-dialog="lock-setup"]')).not.toBeNull())
    expect(text()).toContain('لا طريق لاستعادة الرمز. نسيانه يعني حذف المكتبة.')
    expect(text()).toContain('آخر نسخة: لم تُؤخذ نسخة بعد')
    expect(text()).toContain('أنشئ نسخة')

    await type('#lock-new-code', CODE)
    await type('#lock-new-code-again', 'رمز-آخر-مختلف-جدًّا')
    await vi.waitFor(() => expect(text()).toContain('الرمزان غير متطابقين'))
    const enable = [...document.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('فعّل القفل'),
    )
    expect(enable?.disabled).toBe(true)
    expect((await lockStatus()).mode).toBe('off')
  })

  it('التفعيل يُبقي الجلسة مفتوحة، ثمّ «اقفل الآن» يقفلها', async () => {
    mount(<LockRow />)
    await vi.waitFor(() => expect(query('[data-lock-mode="off"]')).not.toBeNull())
    query<HTMLButtonElement>('[aria-label="قفل المكتبة"]')?.click()
    await vi.waitFor(() => expect(query('#lock-new-code')).not.toBeNull())
    await type('#lock-new-code', CODE)
    await type('#lock-new-code-again', CODE)
    click('فعّل القفل')

    await vi.waitFor(() => expect(text()).toContain('المكتبة محمية'), { timeout: 3000 })
    expect((await lockStatus()).mode).toBe('unlocked')
    click('تمّ')
    await vi.waitFor(() => expect(query('[data-lock-mode="unlocked"]')).not.toBeNull())

    click('اقفل الآن')
    await vi.waitFor(() => expect(query('[data-lock-mode="locked"]')).not.toBeNull())
    expect(text()).toContain('افتح')
  })

  it('الإيقاف بالرمز الحاليّ — بلا وعدٍ بتشفير', async () => {
    await lockedLibrary()
    mount(<LockRow />)
    await vi.waitFor(() => expect(query('[data-lock-mode="locked"]')).not.toBeNull())
    query<HTMLButtonElement>('[aria-label="قفل المكتبة"]')?.click()
    await vi.waitFor(() => expect(query('[data-data-dialog="lock-disable"]')).not.toBeNull())
    expect(text()).not.toContain('تشفير')
    await type('#lock-current-code', CODE)
    click('أوقف القفل')
    await vi.waitFor(() => expect(query('[data-lock-mode="off"]')).not.toBeNull(), {
      timeout: 3000,
    })
  })
})

describe('نصوص القفل', () => {
  it('الدقائق مجرورةً بقاعدة العدد', () => {
    expect(minutesText(60_000)).toBe('دقيقة')
    expect(minutesText(61_000)).toBe('دقيقتين')
    expect(minutesText(4 * 60_000)).toBe('٤ دقائق')
    expect(minutesText(16 * 60_000)).toBe('١٦ دقيقة')
  })

  it('عدم التطابق يُقال حين يبلغ الثاني طول الأوّل أو يحيد عنه', () => {
    expect(mismatched('abcdefgh', '')).toBe(false)
    expect(mismatched('abcdefgh', 'abc')).toBe(false)
    expect(mismatched('abcdefgh', 'abx')).toBe(true)
    expect(mismatched('abcdefgh', 'abcdefgh')).toBe(false)
    expect(mismatched('abcdefgh', 'abcdefgx')).toBe(true)
  })
})
