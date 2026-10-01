import { afterEach, describe, expect, it, vi } from 'vitest'

import { IssueComposer } from '@/pages/integrations/IssueComposer'

import { KNOWN_ISSUE, META } from '../../modules/handoff/fixture'

import {
  flush,
  json,
  mount,
  putPrefs,
  setup,
  storedPrefs,
  type,
  unmount,
  until,
  type Env,
} from './harness'

/**
 * مؤلِّف البلاغ — `STAGES/12`: **لا نداء شبكة قبل التأكيد**، وكل فشلٍ برسالته المميَّزة، والإلغاء بين الخطوات.
 */

afterEach(unmount)

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])
const baked = new Map([['capture-cta', PNG]])
const SHA = 'b'.repeat(40)

const uploaded = () => json(201, { content: { path: 'x' }, commit: { sha: SHA } })
const created = () =>
  json(201, { number: 482, html_url: 'https://github.com/northwind/web/issues/482' })

const composer = (over: Partial<Parameters<typeof IssueComposer>[0]> = {}) =>
  mount(
    <IssueComposer
      issues={[KNOWN_ISSUE]}
      source="لقطة في المحرّر"
      baked={over.baked ?? baked}
      now={META.generatedAt}
      onClose={over.onClose ?? vi.fn()}
    />,
  )

const phase = (root: HTMLElement) =>
  root.querySelector('[data-composer]')?.getAttribute('data-phase')
const q = <T extends Element>(root: HTMLElement, selector: string) =>
  root.querySelector<T>(selector)
const text = (root: HTMLElement) => root.textContent ?? ''

async function toPreview(root: HTMLElement, repo = 'northwind/web') {
  await until(() => phase(root) === 'compose', 'التأليف')
  type(q<HTMLInputElement>(root, '#composer-repo')!, repo)
  await flush()
  q<HTMLButtonElement>(root, '[data-composer-preview]')!.click()
  await until(() => phase(root) === 'preview', 'المعاينة')
}

const connectedEnv = async (): Promise<Env> => {
  const env = await setup({ connected: true })
  await putPrefs({ account: 'sultan-dev', status: 'ok' })
  return env
}

describe('لا شبكة قبل التأكيد', () => {
  it('الفتح والتأليف والتعديل والمعاينة — صفر طلبات، ثمّ يخرج الطلب بعد «افتح البلاغ» وحدها', async () => {
    const env = await connectedEnv()
    const root = composer()
    await toPreview(root)

    // تعديلاتٌ في التأليف ثمّ عودةٌ إلى المعاينة — كلّها محلّية.
    q<HTMLButtonElement>(root, '[data-composer-confirm]')
    expect(env.fetchSpy).not.toHaveBeenCalled()
    expect(env.request).not.toHaveBeenCalled()

    env.fetchSpy.mockResolvedValueOnce(uploaded()).mockResolvedValueOnce(created())
    q<HTMLButtonElement>(root, '[data-composer-confirm]')!.click()
    await until(() => phase(root) === 'sent', 'النجاح')
    expect(env.fetchSpy).toHaveBeenCalledTimes(2)
    expect(text(root)).toContain('northwind/web#482')
  })

  it('المعاينة هي ما سيُرسل: العنوان والنصّ والصورة ومسارها والتحذير', async () => {
    await connectedEnv()
    const root = composer()
    await toPreview(root)
    expect(q(root, '[data-composer-title]')?.textContent).toBe('حشوة الزرّ الرئيسي أكبر من التصميم')
    const body = q(root, '[data-composer-body]')?.textContent ?? ''
    expect(body).toContain('مشكلة واحدة من لقطة في المحرّر.')
    expect(body).toContain('.rasd/issues/20260930-120001/issue-01.png')
    expect(text(root)).toContain('البلاغ يراه كل من يصل إلى المستودع')
    expect(text(root)).toContain('تُرفع الصور إلى المستودع في التزامٍ على فرعه الافتراضي')
  })

  it('الإرسال الفعلي يحمل ما عُرض: عنوان الصورة مثبَّت على الالتزام، ومقدّمة المستخدم', async () => {
    const env = await connectedEnv()
    const root = composer()
    await until(() => phase(root) === 'compose')
    type(q<HTMLInputElement>(root, '#composer-repo')!, 'northwind/web')
    type(q<HTMLTextAreaElement>(root, '#composer-intro')!, 'مقدّمتي')
    await flush()
    q<HTMLButtonElement>(root, '[data-composer-preview]')!.click()
    await until(() => phase(root) === 'preview')
    env.fetchSpy.mockResolvedValueOnce(uploaded()).mockResolvedValueOnce(created())
    q<HTMLButtonElement>(root, '[data-composer-confirm]')!.click()
    await until(() => phase(root) === 'sent')

    const posted = JSON.parse((env.fetchSpy.mock.calls[1]![1] as RequestInit).body as string) as {
      title: string
      body: string
    }
    expect(posted.body.startsWith('مقدّمتي')).toBe(true)
    expect(posted.body).toContain(`/blob/${SHA}/.rasd/issues/20260930-120001/issue-01.png?raw=true`)
    expect((await storedPrefs()).repo).toBe('northwind/web')
  })

  it('مستودعٌ بصيغةٍ خاطئة وعنوانٌ فارغ: يُقالان في التأليف ولا تنتقل المعاينة', async () => {
    await connectedEnv()
    const root = composer()
    await until(() => phase(root) === 'compose')
    type(q<HTMLInputElement>(root, '#composer-repo')!, 'ليس مستودعًا')
    type(q<HTMLInputElement>(root, '#composer-title-field')!, '   ')
    await flush()
    q<HTMLButtonElement>(root, '[data-composer-preview]')!.click()
    await until(() => text(root).includes('اكتب المستودع بصيغة «المالك/الاسم»'))
    expect(text(root)).toContain('اكتب عنوانًا للبلاغ.')
    expect(phase(root)).toBe('compose')
  })
})

describe('مسبقًا: لا يُفتح بلاغ', () => {
  it.each([
    [
      '«الوضع المحلّي فقط» مفعَّل',
      { localOnly: true, connected: true },
      'local-only',
      'الوضع المحلّي فقط',
    ],
    ['غير متّصل', { connected: false }, 'disconnected', 'لم تتّصل بـGitHub بعد'],
  ])('%s', async (_name, opts, kind, expected) => {
    const env = await setup(opts)
    const root = composer()
    await until(() => phase(root) === 'blocked')
    expect(q(root, '[data-composer-blocked]')?.getAttribute('data-composer-blocked')).toBe(kind)
    expect(text(root)).toContain(expected)
    expect(q(root, '[data-composer-preview]')).toBeNull()
    expect(env.fetchSpy).not.toHaveBeenCalled()
  })

  it('خطأ مصادقة سابق ونقص صلاحية سابق: كلٌّ برسالته', async () => {
    await setup({ connected: true })
    await putPrefs({ account: 'a', status: 'auth-error' })
    let root = composer()
    await until(() => phase(root) === 'blocked')
    expect(text(root)).toContain('رفض GitHub رمز الوصول')
    unmount()

    await putPrefs({ account: 'a', status: 'missing-permission' })
    root = composer()
    await until(() => phase(root) === 'blocked')
    expect(text(root)).toContain('امنحه صلاحية Issues')
  })
})

describe('كل فشلٍ برسالته المميَّزة', () => {
  const cases: [
    string,
    () => Response | Error,
    string,
    'auth-error' | 'missing-permission' | 'ok',
  ][] = [
    ['المصادقة', () => json(401, {}), 'رفض GitHub رمز الوصول: انتهت صلاحيته', 'auth-error'],
    ['الصلاحيات', () => json(403, {}), 'امنحه صلاحية Issues', 'missing-permission'],
    ['الشبكة', () => new TypeError('Failed to fetch'), 'لم يصل ردٌّ من GitHub', 'ok'],
    ['الخادم', () => json(503, {}), 'لم يستجب GitHub الآن', 'ok'],
  ]

  it.each(cases)('%s', async (_name, outcome, expected, status) => {
    const env = await connectedEnv()
    await putPrefs({ account: 'sultan-dev', status: 'ok', imageMode: 'inline' })
    const root = composer()
    await toPreview(root)
    const failure = outcome()
    if (failure instanceof Error) env.fetchSpy.mockRejectedValueOnce(failure)
    else env.fetchSpy.mockResolvedValueOnce(failure)

    q<HTMLButtonElement>(root, '[data-composer-confirm]')!.click()
    await until(() => phase(root) === 'failed')
    expect(q(root, '[data-composer-error]')?.textContent).toContain(expected)
    expect((await storedPrefs()).status).toBe(status)
  })

  it('الرسائل الأربع مختلفة بعضها عن بعض', async () => {
    const seen = new Set<string>()
    for (const [, outcome] of cases) {
      const env = await connectedEnv()
      await putPrefs({ account: 'a', status: 'ok', imageMode: 'inline' })
      const root = composer()
      await toPreview(root)
      const failure = outcome()
      if (failure instanceof Error) env.fetchSpy.mockRejectedValueOnce(failure)
      else env.fetchSpy.mockResolvedValueOnce(failure)
      q<HTMLButtonElement>(root, '[data-composer-confirm]')!.click()
      await until(() => phase(root) === 'failed')
      seen.add(q(root, '[data-composer-error]')?.textContent ?? '')
      unmount()
    }
    expect(seen.size).toBe(cases.length)
  })

  it('رفض الرفع بصلاحية Contents يُقال بسببه — ولا يُفتح بلاغ بصورةٍ مكسورة', async () => {
    const env = await connectedEnv()
    const root = composer()
    await toPreview(root)
    env.fetchSpy.mockResolvedValueOnce(json(403, {}))
    q<HTMLButtonElement>(root, '[data-composer-confirm]')!.click()
    await until(() => phase(root) === 'failed')
    expect(q(root, '[data-composer-error]')?.textContent).toContain('صلاحية Contents')
    expect(env.fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('403 في الرفع (Contents) لا يحجب المؤلِّف: الحالة سليمة، والمخرج «عُد للتعديل» ثمّ التضمين', async () => {
    const env = await connectedEnv()
    const root = composer()
    await toPreview(root)
    env.fetchSpy.mockResolvedValueOnce(json(403, {}))
    q<HTMLButtonElement>(root, '[data-composer-confirm]')!.click()
    await until(() => phase(root) === 'failed')
    expect((await storedPrefs()).status).toBe('ok')
    expect(q(root, '[data-composer-edit]')).not.toBeNull()
    unmount()

    // الفتح التالي مفتوح لا محجوب.
    const again = composer()
    await until(() => phase(again) === 'compose')
  })

  it('403 في **الفتح** (Issues) يحفظ «صلاحيات ناقصة» فيُحجب المؤلِّف بسببها', async () => {
    const env = await connectedEnv()
    await putPrefs({ account: 'a', status: 'ok', imageMode: 'inline' })
    const root = composer()
    await toPreview(root)
    env.fetchSpy.mockResolvedValueOnce(json(403, {}))
    q<HTMLButtonElement>(root, '[data-composer-confirm]')!.click()
    await until(() => phase(root) === 'failed')
    expect((await storedPrefs()).status).toBe('missing-permission')
  })

  it('نقرتان متتاليتان على «افتح البلاغ» لا تُرسلان بلاغين', async () => {
    const env = await connectedEnv()
    await putPrefs({ account: 'a', status: 'ok', imageMode: 'inline' })
    const root = composer()
    await toPreview(root)
    env.fetchSpy.mockResolvedValue(created())
    const confirm = q<HTMLButtonElement>(root, '[data-composer-confirm]')!
    confirm.click()
    confirm.click()
    await until(() => phase(root) === 'sent')
    expect(env.fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('صورةٌ رُفعت ثمّ فشل الفتح: الملفّ الباقي في المستودع يُقال', async () => {
    const env = await connectedEnv()
    const root = composer()
    await toPreview(root)
    env.fetchSpy.mockResolvedValueOnce(uploaded()).mockResolvedValueOnce(json(422, {}))
    q<HTMLButtonElement>(root, '[data-composer-confirm]')!.click()
    await until(() => phase(root) === 'failed')
    expect(q(root, '[data-composer-error]')?.textContent).toContain('رفض GitHub محتوى البلاغ')
    expect(q(root, '[data-composer-error]')?.textContent).toContain('رُفع ملفّ واحد إلى المستودع')
    // فشلٌ يعالجه المستخدم بالتعديل: «أعد المحاولة» لا «افتح التكاملات».
    expect(q(root, '[data-composer-retry]')).not.toBeNull()
  })
})

describe('حدّ GitHub قبل الإرسال', () => {
  it('صورةٌ كبيرة مضمَّنة: «افتح البلاغ» معطَّل بسببه — ولا طلب', async () => {
    const env = await connectedEnv()
    await putPrefs({ account: 'a', status: 'ok', imageMode: 'inline' })
    const big = new Uint8Array(60_000).map((_, i) => i % 251)
    const root = composer({ baked: new Map([['capture-cta', big]]) })
    await toPreview(root)
    expect(q(root, '[data-composer-problem]')?.getAttribute('data-composer-problem')).toBe(
      'body-too-long',
    )
    expect(q<HTMLButtonElement>(root, '[data-composer-confirm]')?.disabled).toBe(true)
    q<HTMLButtonElement>(root, '[data-composer-confirm]')!.click()
    await flush()
    expect(env.fetchSpy).not.toHaveBeenCalled()
    expect(phase(root)).toBe('preview')
  })
})

describe('الإلغاء', () => {
  it('أثناء رفع الصورة: لا يُفتح بلاغ، وتُقال الصورة المرفوعة', async () => {
    await connectedEnv()
    const root = composer()
    await toPreview(root)
    let release: (r: Response) => void = () => undefined
    const pending = vi.fn(
      (): Promise<Response> =>
        new Promise((resolve) => {
          release = resolve
        }),
    )
    vi.stubGlobal('fetch', pending)
    q<HTMLButtonElement>(root, '[data-composer-confirm]')!.click()
    await until(() => phase(root) === 'sending')

    q<HTMLButtonElement>(root, '[data-composer-cancel]')!.click()
    release(uploaded())
    await until(() => phase(root) === 'cancelled')
    expect(pending).toHaveBeenCalledTimes(1)
    expect(text(root)).toContain('لم يُفتح بلاغ في GitHub')
    expect(text(root)).toContain('رُفع ملفّ واحد إلى المستودع')
  })
})
