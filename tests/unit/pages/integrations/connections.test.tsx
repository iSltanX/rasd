import { afterEach, describe, expect, it, vi } from 'vitest'

import { ConnectionsPanel } from '@/pages/integrations/ConnectionsPanel'
import { readSecret } from '@/shared/storage/vault'

import {
  flush,
  json,
  mount,
  putPrefs,
  setup,
  storedPrefs,
  TOKEN,
  type,
  unmount,
  until,
} from './harness'

/**
 * شاشة الاتّصالات — الحالات الأربع (`STAGES/12`، المهمّة 3): غير متّصل · متّصل · خطأ مصادقة · صلاحيات ناقصة،
 * ومعها «الوضع المحلّي فقط». **وفتح الشاشة لا يتّصل بشيء**: كل حالةٍ تُقرأ محلّيًّا.
 */

afterEach(unmount)

const panel = (onOpenPrivacy = vi.fn()) => mount(<ConnectionsPanel onOpenPrivacy={onOpenPrivacy} />)
const text = (root: HTMLElement) => root.textContent ?? ''
const button = (root: HTMLElement, label: string) =>
  [...root.querySelectorAll<HTMLButtonElement>('button')].find(
    (b) => b.textContent?.trim() === label,
  )

describe('الحالات', () => {
  it('غير متّصل: «اتّصل» فاعلة، ولا شبكة عند الفتح', async () => {
    const env = await setup()
    const root = panel()
    await until(() => root.querySelector('[data-integrations]') !== null)
    expect(root.querySelector('[data-integrations]')?.getAttribute('data-integrations')).toBe(
      'disconnected',
    )
    expect(button(root, 'اتّصل')?.disabled).toBe(false)
    expect(text(root)).toContain('رصد لا يتّصل بـGitHub قبل أن تربطه')
    expect(text(root)).toContain('رابط مشاركة سحابي')
    expect(env.fetchSpy).not.toHaveBeenCalled()
  })

  it('«الوضع المحلّي فقط»: «اتّصل» معطَّلة بسببها، وزرّ يفتح الخصوصية', async () => {
    const env = await setup({ localOnly: true })
    const onOpenPrivacy = vi.fn()
    const root = panel(onOpenPrivacy)
    await until(() => root.querySelector('[data-integrations="local-only"]') !== null)
    expect(button(root, 'اتّصل')?.disabled).toBe(true)
    expect(text(root)).toContain('معطَّل ما دام الوضع المحلّي فقط مفعَّلًا')
    button(root, 'افتح الخصوصية')?.click()
    expect(onOpenPrivacy).toHaveBeenCalledTimes(1)
    expect(env.fetchSpy).not.toHaveBeenCalled()
  })

  it('متّصل: الحساب والمستودع وطريقة الصورة، ولا شبكة', async () => {
    const env = await setup({ connected: true })
    await putPrefs({
      account: 'sultan-dev',
      repo: 'northwind/web',
      imageMode: 'asset',
      status: 'ok',
    })
    const root = panel()
    await until(() => root.querySelector('[data-integrations="connected"]') !== null)
    expect(text(root)).toContain('متّصل')
    expect(text(root)).toContain('الحساب sultan-dev')
    expect(root.querySelector<HTMLInputElement>('#github-repo-input')?.value).toBe('northwind/web')
    expect(root.querySelector<HTMLSelectElement>('select')?.value).toBe('asset')
    expect(env.fetchSpy).not.toHaveBeenCalled()
  })

  it('خطأ مصادقة: لافتة بسببها، و«أعد الاتّصال»', async () => {
    await setup({ connected: true })
    await putPrefs({ account: 'sultan-dev', status: 'auth-error' })
    const root = panel()
    await until(() => root.querySelector('[data-integrations="auth-error"]') !== null)
    expect(text(root)).toContain('خطأ مصادقة')
    expect(text(root)).toContain('رفض GitHub رمز الوصول: انتهت صلاحيته أو سُحب')
    expect(button(root, 'أعد الاتّصال')).toBeDefined()
  })

  it('صلاحيات ناقصة: لافتة بسببها، و«حدّث الرمز»', async () => {
    await setup({ connected: true })
    await putPrefs({ account: 'sultan-dev', repo: 'northwind/web', status: 'missing-permission' })
    const root = panel()
    await until(() => root.querySelector('[data-integrations="missing-permission"]') !== null)
    expect(text(root)).toContain('صلاحيات ناقصة')
    expect(text(root)).toContain('امنحه صلاحية Issues')
    expect(button(root, 'حدّث الرمز')).toBeDefined()
  })

  it('صلاحية المضيف مسحوبة: تُقال، و«امنح الصلاحية» تطلبها من النقرة', async () => {
    const env = await setup({ connected: true, host: false })
    const root = panel()
    await until(() => root.querySelector('[data-integrations="host-revoked"]') !== null)
    button(root, 'امنح الصلاحية')?.click()
    expect(env.request).toHaveBeenCalledWith({ origins: ['https://api.github.com/*'] })
  })

  it('رمزٌ محفوظ بقاعدة مفاتيح ضاعت: «غير مقروء» لا «متّصل»', async () => {
    await setup({ connected: true })
    const { deleteVaultDatabase } = await import('@/shared/storage/vault')
    await deleteVaultDatabase()
    const root = panel()
    await until(() => root.querySelector('[data-integrations="vault-error"]') !== null)
    expect(text(root)).toContain('الرمز غير مقروء')
  })
})

describe('الضوابط تعمل', () => {
  it('المستودع الافتراضي يُحفظ مُسوَّقًا من رابطه، وصيغةٌ خاطئة تُقال ولا تُحفظ', async () => {
    await setup({ connected: true })
    await putPrefs({ account: 'sultan-dev', status: 'ok' })
    const root = panel()
    await until(() => root.querySelector('#github-repo-input') !== null)
    const input = root.querySelector<HTMLInputElement>('#github-repo-input')!

    type(input, 'https://github.com/northwind/web.git')
    input.dispatchEvent(new FocusEvent('blur'))
    await vi.waitFor(async () => expect((await storedPrefs()).repo).toBe('northwind/web'))

    type(input, 'ليس مستودعًا')
    input.dispatchEvent(new FocusEvent('blur'))
    await flush()
    await until(() => text(root).includes('اكتب المستودع بصيغة «المالك/الاسم»'))
    expect((await storedPrefs()).repo).toBe('northwind/web')
  })

  it('طريقة الصورة تُحفظ', async () => {
    await setup({ connected: true })
    await putPrefs({ account: 'a', status: 'ok' })
    const root = panel()
    await until(() => root.querySelector('select') !== null)
    const select = root.querySelector('select')!
    select.value = 'inline'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    await vi.waitFor(async () => expect((await storedPrefs()).imageMode).toBe('inline'))
  })

  it('«افصل» ينسى الرمز والتفضيلات فورًا', async () => {
    await setup({ connected: true })
    await putPrefs({ account: 'sultan-dev', repo: 'northwind/web', status: 'ok' })
    const root = panel()
    await until(() => button(root, 'افصل') !== undefined)
    button(root, 'افصل')!.click()
    await until(() => root.querySelector('[data-integrations="disconnected"]') !== null)
    expect(await readSecret('github')).toEqual({ ok: true, value: null })
    expect(await storedPrefs()).toEqual({})
  })
})

describe('فشل «افصل»', () => {
  it('نسيان الرمز إن فشل يُقال، والتفضيلات لا تُمحى، والرمز باقٍ', async () => {
    await setup({ connected: true })
    await putPrefs({ account: 'sultan-dev', repo: 'northwind/web', status: 'ok' })
    const root = panel()
    await until(() => button(root, 'افصل') !== undefined)
    const storage = await import('@/shared/storage/vault')
    const forgetting = vi.spyOn(storage, 'forgetSecret').mockResolvedValue({
      ok: false,
      error: { failure: 'storage' },
    })
    button(root, 'افصل')!.click()
    await until(() => root.querySelector('[data-disconnect-failed]') !== null)
    expect((await storedPrefs()).account).toBe('sultan-dev')
    expect(await readSecret('github')).toEqual({ ok: true, value: TOKEN })
    forgetting.mockRestore()
  })
})

describe('نافذة الاتّصال', () => {
  const open = async () => {
    const env = await setup()
    const root = panel()
    await until(() => button(root, 'اتّصل') !== undefined)
    button(root, 'اتّصل')!.click()
    await until(() => document.querySelector('[data-connect-dialog]') !== null)
    return { env, root }
  }

  it('الرمز حقل كلمة مرور، والنصّ صادقٌ عن Issues وContents', async () => {
    await open()
    expect(document.querySelector<HTMLInputElement>('#connect-token')?.type).toBe('password')
    const dialog = document.querySelector('[data-connect-dialog]')!.textContent ?? ''
    expect(dialog).toContain('يكفيه صلاحية Issues')
    expect(dialog).toContain('Contents')
    expect(dialog).toContain('يقرأ شيفرتك')
  })

  it('الصلاحية تُطلب من النقرة متزامنًا — قبل أي انتظار — ثمّ يتحقّق ويحفظ', async () => {
    const { env } = await open()
    env.fetchSpy.mockResolvedValueOnce(json(200, { login: 'sultan-dev' }))
    type(document.querySelector<HTMLInputElement>('#connect-token')!, TOKEN)
    await flush()

    document.querySelector<HTMLButtonElement>('[data-connect-submit]')!.click()
    expect(env.request).toHaveBeenCalledTimes(1)
    expect(env.request).toHaveBeenCalledWith({ origins: ['https://api.github.com/*'] })

    await until(() => document.querySelector('[data-connect-dialog]') === null, 'إغلاق النافذة')
    expect(await readSecret('github')).toEqual({ ok: true, value: TOKEN })
    expect((await storedPrefs()).account).toBe('sultan-dev')
    expect(document.body.textContent).not.toContain(TOKEN)
  })

  it('صلاحية المضيف مرفوضة: لا طلب إلى GitHub، وتُقال', async () => {
    const { env } = await open()
    env.request.mockResolvedValueOnce(false)
    type(document.querySelector<HTMLInputElement>('#connect-token')!, TOKEN)
    await flush()
    document.querySelector<HTMLButtonElement>('[data-connect-submit]')!.click()
    await until(() => document.querySelector('[data-connect-error]') !== null)
    expect(document.querySelector('[data-connect-error]')?.textContent).toContain(
      'لم تمنح رصد صلاحية الوصول',
    )
    expect(env.fetchSpy).not.toHaveBeenCalled()
  })

  it('رمزٌ يرفضه GitHub: رسالة المصادقة، ولا يُحفظ', async () => {
    const { env } = await open()
    env.fetchSpy.mockResolvedValueOnce(json(401, {}))
    type(document.querySelector<HTMLInputElement>('#connect-token')!, TOKEN)
    await flush()
    document.querySelector<HTMLButtonElement>('[data-connect-submit]')!.click()
    await until(() => document.querySelector('[data-connect-error]') !== null)
    expect(document.querySelector('[data-connect-error]')?.textContent).toContain(
      'رفض GitHub رمز الوصول',
    )
    expect(await readSecret('github')).toEqual({ ok: true, value: null })
  })
})
