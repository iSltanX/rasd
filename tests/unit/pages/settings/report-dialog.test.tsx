import { fakeBrowser } from '@webext-core/fake-browser'
import { render } from 'preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ReportDialog, type ReportDeps } from '@/pages/settings/parts/report/ReportDialog'
import { stripIsolates } from '@/shared/bidi/isolate'
import { ok } from '@/shared/result'

import type { SendOutcome } from '@/modules/report/client'
import type { Diagnostics, ReportPayload } from '@/modules/report/payload'
import type { ReportDraftRecord } from '@/shared/storage/schema'

/**
 * نافذة البلاغ — معايير `STAGES/13` على الواجهة نفسها:
 *   - «لا طلب شبكة قبل ضغط التأكيد، ولا لقطة بلا ضغط زرّها» — ولا صلاحية تُطلب قبله، ولا لقطة أصلًا.
 *   - «التشخيص المرسَل يطابق المعروض حرفيًّا».
 *   - الفشل يحفظ المسودة ويعرض سببه، وإعادة المحاولة بالجسم نفسه والمفتاح نفسه، و«الوضع المحلّي» يُشرح ولا يُرسَل.
 *
 * المحرّكات تُحقن (`deps`): الإرسال نفسه مختبَرٌ مع المخرج في `tests/unit/modules/report/client.test.ts`، والخبز
 * بايتًا ببايت في `image.test.ts`.
 */

const DIAG: Diagnostics = {
  appVersion: '1.0.0',
  os: 'macos',
  osVersion: '15.3.0',
  arch: 'arm64',
  browser: 'Google Chrome',
  browserVersion: '153.0.7990.12',
}
const KEY = '4c1a0e8e-2a9f-4b1e-9f61-6a2b8d1c7e55'

let container: HTMLDivElement | null = null
let sendSpy: ReturnType<typeof vi.fn<ReportDeps['send']>>
let requestHost: ReturnType<typeof vi.fn<ReportDeps['requestHost']>>
let saveDraft: ReturnType<typeof vi.fn<ReportDeps['saveDraft']>>
let deleteDraft: ReturnType<typeof vi.fn<ReportDeps['deleteDraft']>>
let copy: ReturnType<typeof vi.fn<ReportDeps['copy']>>
let fetchSpy: ReturnType<typeof vi.fn>
let capture: ReturnType<typeof vi.fn>
let sendMessage: ReturnType<typeof vi.fn>

function deps(over: Partial<ReportDeps> = {}): Partial<ReportDeps> {
  return {
    diagnostics: () => Promise.resolve(DIAG),
    send: sendSpy,
    saveDraft,
    deleteDraft,
    latestDraft: () => Promise.resolve(ok(null)),
    importImage: vi.fn(),
    bakeWorking: vi.fn(),
    localOnly: () => Promise.resolve(false),
    hostGranted: () => Promise.resolve(false),
    requestHost,
    copy,
    newId: () => KEY,
    now: () => 1_790_000_000_000,
    test: false,
    ...over,
  }
}

beforeEach(() => {
  fakeBrowser.reset()
  sendSpy = vi.fn<ReportDeps['send']>().mockResolvedValue({ ok: true, id: 12, replayed: false })
  requestHost = vi.fn<ReportDeps['requestHost']>().mockResolvedValue('granted')
  saveDraft = vi.fn<ReportDeps['saveDraft']>().mockResolvedValue(ok(null))
  deleteDraft = vi.fn<ReportDeps['deleteDraft']>().mockResolvedValue(ok(null))
  copy = vi.fn<ReportDeps['copy']>().mockResolvedValue(true)
  fetchSpy = vi.fn()
  vi.stubGlobal('fetch', fetchSpy)
  capture = vi.fn()
  sendMessage = vi.fn()
  Object.assign(globalThis.chrome.tabs, { captureVisibleTab: capture })
  Object.assign(globalThis.chrome.runtime, { sendMessage })
})

afterEach(() => {
  if (container) {
    render(null, container)
    container.remove()
    container = null
  }
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function mount(
  over: Partial<ReportDeps> = {},
  request: { tool: string | null; code: string | null } | null = null,
) {
  container = document.createElement('div')
  document.body.appendChild(container)
  const onClose = vi.fn()
  render(
    <ReportDialog request={request} onClose={onClose} onOpenPrivacy={vi.fn()} deps={deps(over)} />,
    container,
  )
  return { onClose }
}

const text = () => stripIsolates(container?.textContent ?? '')
const phase = () => container?.querySelector('[data-phase]')?.getAttribute('data-phase')

function button(label: string): HTMLButtonElement {
  const found = [...(container?.querySelectorAll('button') ?? [])].find(
    (b) => stripIsolates(b.textContent ?? '').trim() === label,
  )
  if (!found) throw new Error(`لا زرّ «${label}» — ${text()}`)
  return found
}

/** يكتب في حقل ثمّ ينتظر إعادة الرسم — Preact يؤجّلها، ونقرةٌ قبلها ترى النموذج القديم. */
async function type(id: string, value: string) {
  const el = container?.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#${id}`)
  if (!el) throw new Error(`لا حقل ${id}`)
  el.value = value
  el.dispatchEvent(new Event('input', { bubbles: true }))
  await new Promise((r) => setTimeout(r, 0))
}

/** يملأ الخطوة الأولى ويتخطّى الصورة إلى المراجعة. */
async function toReview() {
  await vi.waitFor(() => expect(phase()).toBe('describe'))
  await type('report-field-title', 'اللقطة الكاملة تتوقّف')
  await type('report-field-what', 'توقّف الشريط عند ٦٠٪')
  button('التالي: الصورة').click()
  await vi.waitFor(() => expect(phase()).toBe('image'))
  button('التالي: المراجعة').click()
  await vi.waitFor(() => expect(phase()).toBe('review'))
}

/** لا شيء خرج ولا شيء التُقط ولا إذن طُلب — حتى هذه اللحظة. */
function nothingLeft() {
  expect(sendSpy).not.toHaveBeenCalled()
  expect(requestHost).not.toHaveBeenCalled()
  expect(fetchSpy).not.toHaveBeenCalled()
  expect(capture).not.toHaveBeenCalled()
  expect(sendMessage).not.toHaveBeenCalled()
}

describe('لا طلب قبل التأكيد، ولا لقطة', () => {
  it('الخطوات الثلاث حتى المراجعة بلا طلب شبكة ولا إذن ولا التقاط — ثمّ «أرسل» يطلب الإذن ويرسل مرّة', async () => {
    mount()
    await toReview()
    nothingLeft()

    button('أرسل البلاغ').click()
    await vi.waitFor(() => expect(phase()).toBe('sent'))
    expect(requestHost).toHaveBeenCalledTimes(1)
    expect(sendSpy).toHaveBeenCalledTimes(1)
    expect(sendSpy.mock.calls[0]?.[1].key).toBe(KEY)
    expect(text()).toContain('#12')
    expect(deleteDraft).toHaveBeenCalledWith(KEY)
    // ولا التقاط في المسار كلّه: الصورة ملفٌّ يختاره المستخدم وحده.
    expect(capture).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('خطوة أولى ناقصة لا تتقدّم، وتقول ما المطلوب', async () => {
    mount()
    await vi.waitFor(() => expect(phase()).toBe('describe'))
    button('التالي: الصورة').click()
    await vi.waitFor(() => expect(text()).toContain('اكتب عنوانًا قصيرًا للمشكلة'))
    expect(text()).toContain('صف ما حدث بجملة أو جملتين')
    expect(phase()).toBe('describe')
  })
})

describe('المعروض هو المرسَل', () => {
  it('كل صفٍّ في المراجعة قيمته حرفًا في الجسم المرسَل — والتشخيص بأداته ورمزه من رسالة الخطأ', async () => {
    mount(
      { hostGranted: () => Promise.resolve(true) },
      { tool: 'full-page', code: 'CAPTURE_STITCH_TIMEOUT' },
    )
    await toReview()

    const shown = Object.fromEntries(
      [...(container?.querySelectorAll('[data-report-key]') ?? [])].map((row) => [
        row.getAttribute('data-report-key'),
        stripIsolates(row.lastElementChild?.textContent ?? ''),
      ]),
    )
    expect(shown['diagnostics.tool']).toBe('full-page')
    expect(shown['diagnostics.error_code']).toBe('CAPTURE_STITCH_TIMEOUT')

    button('أرسل البلاغ').click()
    await vi.waitFor(() => expect(sendSpy).toHaveBeenCalledTimes(1))
    const sent = sendSpy.mock.calls[0]![0]
    expect(requestHost).not.toHaveBeenCalled()

    const leaves: Record<string, string> = {
      kind: sent.kind,
      description: sent.description,
      app_version: sent.app_version,
      os: sent.os,
      os_version: sent.os_version,
      arch: sent.arch,
      locale: sent.locale,
      product: sent.product,
      ...Object.fromEntries(
        Object.entries(sent.diagnostics).map(([k, v]) => [`diagnostics.${k}`, v]),
      ),
    }
    expect(shown).toEqual(leaves)
    expect(text()).not.toMatch(/https?:/u)
  })
})

describe('الفشل وإعادة المحاولة', () => {
  const failing = (outcome: SendOutcome) => sendSpy.mockResolvedValueOnce(outcome)

  it.each([
    [{ failure: 'network' as const }, 'تعذّر الوصول إلى جهة الدعم'],
    [{ failure: 'server' as const, detail: '500' }, 'العطل من جهتها لا من جهازك'],
    [{ failure: 'rate-limited' as const, retryAfterSeconds: 600 }, 'بعد ١٠ دقائق'],
  ])(
    '%o: رسالته، والمسودة محفوظة، و«أعد المحاولة» بالجسم والمفتاح نفسيهما',
    async (error, message) => {
      failing({ ok: false, error })
      mount({ hostGranted: () => Promise.resolve(true) })
      await toReview()
      button('أرسل البلاغ').click()
      await vi.waitFor(() => expect(phase()).toBe('failed'))
      expect(text()).toContain(message)
      expect(text()).toContain('محفوظة على هذا الجهاز')

      expect(saveDraft).toHaveBeenCalledTimes(1)
      const draft = saveDraft.mock.calls[0]![0] as ReportDraftRecord
      expect(draft.id).toBe(KEY)
      expect(draft.title).toBe('اللقطة الكاملة تتوقّف')

      button('أعد المحاولة').click()
      await vi.waitFor(() => expect(phase()).toBe('sent'))
      expect(sendSpy).toHaveBeenCalledTimes(2)
      const [first, second] = sendSpy.mock.calls
      expect(second![0]).toEqual(first![0])
      expect(second![1].key).toBe(first![1].key)
      expect(deleteDraft).toHaveBeenCalledWith(KEY)
    },
  )

  it('400: لا «أعد المحاولة» — «انسخ البلاغ نصًّا» يضع الجسم بلا بيانات الصورة', async () => {
    failing({ ok: false, error: { failure: 'invalid', detail: '400' } })
    mount({ hostGranted: () => Promise.resolve(true) })
    await toReview()
    button('أرسل البلاغ').click()
    await vi.waitFor(() => expect(phase()).toBe('failed'))
    expect(text()).not.toContain('أعد المحاولة')
    button('انسخ البلاغ نصًّا').click()
    await vi.waitFor(() => expect(copy).toHaveBeenCalledTimes(1))
    const copied = JSON.parse(copy.mock.calls[0]![0]) as ReportPayload
    expect(copied.product).toBe('rasd')
  })

  it('رفض الإذن: لا إرسال، والمسودة محفوظة، والسبب مسمّى', async () => {
    requestHost.mockResolvedValue('denied')
    mount()
    await toReview()
    button('أرسل البلاغ').click()
    await vi.waitFor(() => expect(phase()).toBe('failed'))
    expect(sendSpy).not.toHaveBeenCalled()
    expect(text()).toContain('لم يُمنح رصد إذن الاتّصال')
    expect(saveDraft).toHaveBeenCalledTimes(1)
  })

  it('الإلغاء أثناء الإرسال: يُوقف الطلب، والمسودة محفوظة، و«أكمل البلاغ»', async () => {
    sendSpy.mockImplementationOnce(
      (_payload, options) =>
        new Promise((resolve) => {
          options.signal?.addEventListener('abort', () =>
            resolve({ ok: false, error: { failure: 'cancelled' } }),
          )
        }),
    )
    mount({ hostGranted: () => Promise.resolve(true) })
    await toReview()
    button('أرسل البلاغ').click()
    await vi.waitFor(() => expect(phase()).toBe('sending'))
    button('ألغِ').click()
    await vi.waitFor(() => expect(phase()).toBe('cancelled'))
    expect(text()).toContain('مسودتك محفوظة على هذا الجهاز')
    expect(saveDraft).toHaveBeenCalledTimes(1)
  })
})

describe('«الوضع المحلّي فقط»', () => {
  it('يُشرح ولا يُرسل ولا يُطلب إذن — والبديل نسخ البلاغ نصًّا', async () => {
    mount({ localOnly: () => Promise.resolve(true) })
    await toReview()
    button('أرسل البلاغ').click()
    await vi.waitFor(() => expect(phase()).toBe('local-only'))
    expect(text()).toContain('الوضع المحلّي فقط مفعَّل')
    nothingLeft()
    button('انسخ البلاغ نصًّا').click()
    await vi.waitFor(() => expect(copy).toHaveBeenCalledTimes(1))
    expect(sendSpy).not.toHaveBeenCalled()
  })
})

describe('الإغلاق في منتصف الخطوات', () => {
  it('ما كُتب لا يضيع: يُحفظ مسودةً وتُعرض «لم يُرسَل البلاغ»', async () => {
    mount()
    await vi.waitFor(() => expect(phase()).toBe('describe'))
    await type('report-field-title', 'عطل')
    button('ألغِ').click()
    await vi.waitFor(() => expect(phase()).toBe('cancelled'))
    expect(saveDraft).toHaveBeenCalledTimes(1)
    nothingLeft()
  })

  it('ونموذجٌ فارغ يُغلق بلا مسودة', async () => {
    const { onClose } = mount()
    await vi.waitFor(() => expect(phase()).toBe('describe'))
    button('ألغِ').click()
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(saveDraft).not.toHaveBeenCalled()
  })
})
