import { fakeBrowser } from '@webext-core/fake-browser'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { startOverlay } from '@/content'
import { resetHandlers } from '@/shared/messaging/rpc'
import { resetSettingsCache } from '@/shared/settings'

import type { ContrastAuditTool } from '@/content/tools/contrast-audit'
import type { IssuesController } from '@/content/tools/issues'

/**
 * تدقيق التباين موصولًا كما يُقلع (`STAGES/14`): من لوحة خمول الفحص، إلى المسح، إلى النتيجة المختارة وإطارها،
 * إلى «سجّلها مشكلة» بنموذج 32 مملوءًا بحدّ النصّ — ومغادرة الوضع تُسقطه.
 *
 * `startOverlay` الحقيقي، والرسائل مقلَّدة، والتخطيط يُحقن: happy-dom بلا صناديق.
 */

let teardown: (() => void) | null = null
const scroll = vi.fn()

beforeEach(() => {
  fakeBrowser.reset()
  resetSettingsCache()
  resetHandlers()
  Object.assign(globalThis.chrome.runtime, {
    sendMessage: vi.fn(() => Promise.resolve({ ok: true, value: { ok: true } })),
  })
})

afterEach(() => {
  teardown?.()
  teardown = null
  vi.restoreAllMocks()
  document.body.innerHTML = ''
  document.body.removeAttribute('style')
})

const settle = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms))

type Session =
  Awaited<ReturnType<typeof startOverlay>> extends infer R
    ? R extends { ok: true; value: infer V }
      ? V & { audit: ContrastAuditTool; issues: IssuesController }
      : never
    : never

async function boot(): Promise<Session> {
  // نصٌّ رماديّ فاتح (2.32) وآخر أسود سليم على جسمٍ أبيض — وكل صندوقٍ في الصفحة ظاهر. واللون الأسود
  // مصرَّح: happy-dom يترك اللون الافتراضي بلا حلّ، وChrome يحلّه `rgb(0, 0, 0)`.
  document.body.innerHTML =
    '<p id="faint" style="color: rgb(170, 170, 170)">نصّ باهت</p>' +
    '<p id="ok" style="color: rgb(0, 0, 0)">نصّ سليم</p>'
  document.body.setAttribute('style', 'background-color: rgb(255, 255, 255)')
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 5000, 120, 20),
  )
  scroll.mockClear()
  Element.prototype.scrollIntoView = scroll

  const started = await startOverlay()
  if (!started.ok) throw new Error(started.error.message)
  teardown = () => started.value.teardown()
  await settle()
  return started.value as Session
}

const q = (session: Session, id: string) =>
  session.host.layer.querySelector<HTMLElement>(`[data-rasd-ov="${id}"]`)

/**
 * نقرةٌ داخل جذر الظلّ لا تعبره. وضع الفحص يكبت النقرات في طور الالتقاط على النافذة إلا ما هدفه مضيفنا؛
 * وChrome يعيد استهداف النقرة المركّبة إلى المضيف هناك، وhappy-dom لا يفعل — فيكبتها. والمختبَر هنا الربط
 * لا الكبت؛ والنقر الحقيقي يثبته `verify:colour`.
 */
const tap = (el: Element | null | undefined): void => {
  el?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: false }))
}

describe('تدقيق التباين في وضع الفحص', () => {
  it('المدخل في لوحة الخمول يفتح اللوحة، والمسح يجد الباهت وحده، والنتيجة تُبرز وتُسجَّل مشكلة', async () => {
    const session = await boot()
    session.modes.set('inspect')
    await settle()

    tap(q(session, 'audit-open'))
    await settle()
    expect(q(session, 'audit-panel')?.dataset.phase).toBe('idle')

    tap(q(session, 'audit-start'))
    await settle()
    expect(session.audit.state.phase.value).toBe('done')
    const rows = session.host.layer.querySelectorAll<HTMLElement>('[data-rasd-ov="audit-row"]')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.textContent).toContain('نصّ باهت')

    tap(rows[0])
    await settle()
    expect(scroll.mock.contexts).toEqual([document.getElementById('faint')])
    expect(q(session, 'audit-box')).not.toBeNull()

    tap(q(session, 'audit-log-issue'))
    await settle()
    const form = session.issues.state.form.value
    expect(form?.expected).toBe('4.5')
    expect(form?.title).toBe('تباين دون الحدّ: #faint')
    expect(form?.options.map((o) => o.kind)).toEqual(['contrast'])
    // «الآن» في النموذج بالقارئ نفسه الذي حكم به التدقيق — 2.32 مقصوصةً.
    expect(form?.options[0]?.value).toBe('2.32')
    const expected = session.host.layer.querySelector<HTMLInputElement>(
      '[data-issue-field="expected"]',
    )
    expect(expected?.value).toBe('4.5')
  })

  it('مغادرة وضع الفحص تُغلق اللوحة وتُسقط نتائجها', async () => {
    const session = await boot()
    session.modes.set('inspect')
    await settle()
    tap(q(session, 'audit-open'))
    await settle()
    tap(q(session, 'audit-start'))
    await settle()
    expect(session.audit.state.findings.value).toHaveLength(1)

    session.modes.set('measure')
    await settle()
    expect(session.audit.state.open.value).toBe(false)
    expect(session.audit.state.findings.value).toEqual([])
    session.modes.set('inspect')
    await settle()
    expect(q(session, 'audit-panel')).toBeNull()
  })

  it('لا مدخل للتدقيق في غير وضع الفحص', async () => {
    const session = await boot()
    session.modes.set('measure')
    await settle()
    expect(q(session, 'audit-open')).toBeNull()
  })
})
