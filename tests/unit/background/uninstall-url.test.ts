/**
 * رابط ما بعد الإزالة — `STAGES/28`.
 *
 * مطفأٌ ما دامت صفحات المالك غير منشورة (`OWNER_PAGES_LIVE` — لا رابط يعطي 404)، وحين يُشعل يُمرَّر حرفًا كما هو: لا معرّف ولا
 * نسخة ولا لغة تُلحق به. والإطفاء يمحو رابطًا ضبطه بناءٌ سابق.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { registerUninstallUrl } from '@/background/uninstall-url'
import { OWNER_PAGES_LIVE, UNINSTALL_SURVEY_URL } from '@/shared/links'

const original = chrome.runtime.setUninstallURL

function stub(result: Promise<void> = Promise.resolve()) {
  const fn = vi.fn((_url: string) => result)
  chrome.runtime.setUninstallURL = fn
  return fn
}

afterEach(() => {
  chrome.runtime.setUninstallURL = original
})

describe('رابط ما بعد الإزالة', () => {
  it('مطفأٌ ما دامت صفحات المالك غير منشورة', () => {
    expect(OWNER_PAGES_LIVE).toBe(false)
    const fn = stub()
    registerUninstallUrl()
    expect(fn).toHaveBeenCalledWith('')
  })

  it('حين يُشعل يُمرَّر الرابط كما هو — https في موقع المالك، بلا استعلام ولا جزء', () => {
    const fn = stub()
    registerUninstallUrl(true)
    expect(fn).toHaveBeenCalledTimes(1)
    const url = new URL(fn.mock.calls[0]![0])
    expect(url.href).toBe(UNINSTALL_SURVEY_URL)
    expect(url.protocol).toBe('https:')
    expect(url.hostname).toBe('www.bysltan.com')
    expect(url.search).toBe('')
    expect(url.hash).toBe('')
  })

  it('الإطفاء يمحو رابطًا سابقًا بدل أن يتركه', () => {
    const fn = stub()
    registerUninstallUrl(false)
    expect(fn).toHaveBeenCalledWith('')
  })

  it('رفض المتصفّح لا يرمي في العامل', async () => {
    stub(Promise.reject(new Error('Invalid URL')))
    expect(() => registerUninstallUrl(true)).not.toThrow()
    await new Promise((r) => setTimeout(r, 0))
  })
})
