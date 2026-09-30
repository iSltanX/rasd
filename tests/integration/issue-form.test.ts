import { fakeBrowser } from '@webext-core/fake-browser'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { startOverlay } from '@/content'
import { resetHandlers } from '@/shared/messaging/rpc'
import { resetSettingsCache } from '@/shared/settings'

import { issueFixture } from '../unit/modules/issues/fixture'

import type { IssuesController } from '@/content/tools/issues'

/**
 * نموذج «سجّل مشكلة» ولوحة «مشكلات هذه الصفحة» موصولين كما يُقلعان (ADR 0031 §4 و0032).
 *
 * `startOverlay` الحقيقي والرسائل وحدها مقلَّدة. يسقط إن فُكّ عزل المفاتيح عن الصفحة، أو صارت الحروف
 * تبدّل الأداة والمستخدم يكتب، أو أغلق `Esc` الأداة بدل النموذج، أو بدأت جولة فحص بلا إيماءة.
 */

interface Sent {
  readonly type: string
  readonly payload: unknown
}

let sent: Sent[] = []
let teardown: (() => void) | null = null

const REPLIES: Record<string, unknown> = {
  'issue/page': { issues: [issueFixture()], lines: { i1: 'الآن 14px 24px' }, checked: '' },
  'issue/recheck-save': { issues: [], lines: {} },
}

beforeEach(() => {
  fakeBrowser.reset()
  resetSettingsCache()
  resetHandlers()
  sent = []
  Object.assign(globalThis.chrome.runtime, {
    sendMessage: vi.fn((envelope: { type: string; payload: unknown }) => {
      sent.push({ type: envelope.type, payload: envelope.payload })
      return Promise.resolve({ ok: true, value: REPLIES[envelope.type] ?? { ok: true } })
    }),
  })
})

afterEach(() => {
  teardown?.()
  teardown = null
})

const settle = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms))

async function boot() {
  const started = await startOverlay()
  if (!started.ok) throw new Error(started.error.message)
  teardown = () => started.value.teardown()
  await settle()
  const session = started.value as typeof started.value & { issues: IssuesController }
  return session
}

/** يفتح النموذج بنموذجٍ ثابت — العنصر نفسه لا يلزم لاختبار الحقول والمفاتيح. */
async function openForm(issues: IssuesController): Promise<void> {
  issues.state.form.value = {
    options: [{ kind: 'style', property: 'padding', label: 'padding', value: '14px 24px' }],
    subject: '.cta-btn',
  }
  await settle()
}

const key = (target: EventTarget, code: string, init: KeyboardEventInit = {}) =>
  target.dispatchEvent(
    new KeyboardEvent('keydown', { code, key: code, bubbles: true, composed: true, ...init }),
  )

describe('نموذج «سجّل مشكلة» فوق الصفحة (ADR 0032)', () => {
  it('حرفٌ في حقل النموذج لا يبدّل الأداة، ولا يبلغ مستمع الصفحة في طور الفقاعة', async () => {
    const session = await boot()
    session.modes.set('inspect')
    await settle()
    await openForm(session.issues)

    const title = session.host.layer.querySelector<HTMLInputElement>('[data-issue-field="title"]')
    expect(title).not.toBeNull()
    const page = vi.fn()
    document.addEventListener('keydown', page)
    try {
      title?.dispatchEvent(new FocusEvent('focusin', { bubbles: true, composed: true }))
      await settle(0)
      expect(session.issues.state.typing.value).toBe(true)

      // `⌥⇧M` اختصار القياس — والمستخدم يكتب، فلا يبدّل.
      key(title as HTMLInputElement, 'KeyM', { altKey: true, shiftKey: true })
      await settle()
      expect(session.modes.mode.value).toBe('inspect')
      expect(page).not.toHaveBeenCalled()
    } finally {
      document.removeEventListener('keydown', page)
    }
  })

  it('`Esc` يُغلق النموذج وحده ويبقي الأداة', async () => {
    const session = await boot()
    session.modes.set('inspect')
    await settle()
    await openForm(session.issues)
    expect(session.host.layer.querySelector('[data-rasd-ov="issue-form"]')).not.toBeNull()

    key(window, 'Escape')
    await settle()
    expect(session.issues.state.form.value).toBeNull()
    expect(session.host.layer.querySelector('[data-rasd-ov="issue-form"]')).toBeNull()
    expect(session.modes.mode.value).toBe('inspect')
  })

  it('مغادرة الأداة تُغلق النموذج', async () => {
    const session = await boot()
    session.modes.set('inspect')
    await settle()
    await openForm(session.issues)
    session.modes.set('measure')
    await settle()
    expect(session.issues.state.form.value).toBeNull()
  })
})

describe('إعادة الفحص بإيماءة وحدها (ADR 0031 §4)', () => {
  it('نقرةٌ من سكربت بلا تفعيل مستخدم تُرفض بإشعار ولا تُقرأ الصفحة ولا يُحفظ شيء', async () => {
    const session = await boot()
    session.modes.set('issues')
    await settle()
    expect(session.host.layer.querySelector('[data-rasd-ov="issues-list"] li')).not.toBeNull()

    sent = []
    session.host.layer.querySelector<HTMLButtonElement>('[data-rasd-ov="issues-recheck"]')?.click()
    await settle()
    expect(sent.map((m) => m.type)).not.toContain('issue/recheck-save')
    expect(session.host.layer.querySelector('[data-rasd-ov="notice"]')?.textContent).toContain(
      'أعد الفحص بنقرة',
    )
  })

  it('نقرةٌ بتفعيل مستخدم تقرأ وترسل القراءات بلا حكم', async () => {
    const session = await boot()
    session.modes.set('issues')
    await settle()
    // البيئة الوهمية بلا `userActivation` — يُعرَّف كما يعرّفه Chrome عقب نقرةٍ حقيقية.
    Object.defineProperty(navigator, 'userActivation', {
      configurable: true,
      value: { isActive: true, hasBeenActive: true },
    })
    try {
      sent = []
      session.host.layer
        .querySelector<HTMLButtonElement>('[data-rasd-ov="issues-recheck"]')
        ?.click()
      await settle()
    } finally {
      Reflect.deleteProperty(navigator, 'userActivation')
    }
    const save = sent.find((m) => m.type === 'issue/recheck-save')
    expect(save).toBeDefined()
    const [observation] = (save?.payload as { observations: { outcome: string | null }[] })
      .observations
    // العنصر ليس في الصفحة: الصفحة تحسم «غير موجود»، ولا تحمل الحمولة «مطابقة» أبدًا.
    expect(observation?.outcome).toBe('not-found')
  })

  it('طلب الخلفية (من إيماءة النافذة) يفتح اللوحة ويجري الجولة', async () => {
    const session = await boot()
    sent = []
    void (await fakeBrowser.runtime.onMessage.trigger(
      { __rasd: 1, id: 'bg', type: 'issue/run-recheck', payload: undefined },
      {},
      () => undefined,
    ))
    await settle()
    expect(session.modes.mode.value).toBe('issues')
    expect(sent.map((m) => m.type)).toContain('issue/recheck-save')
  })
})
