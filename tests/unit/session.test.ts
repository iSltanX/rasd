import { fakeBrowser } from '@webext-core/fake-browser'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  clearSession,
  defaultSession,
  getSession,
  patchSession,
  setTabMode,
} from '@/shared/storage/session'

beforeEach(() => {
  fakeBrowser.reset()
})

describe('حالة الجلسة', () => {
  it('تبدأ فارغة', async () => {
    expect(await getSession()).toEqual(defaultSession())
  })

  it('تحفظ وضع كل تبويب على حدة', async () => {
    await setTabMode(11, 'inspect')
    await setTabMode(22, 'measure')
    const s = await getSession()
    expect(s.modes[11]).toBe('inspect')
    expect(s.modes[22]).toBe('measure')
  })

  it('العودة إلى idle تحذف المدخل بدل تخزين حالة خاملة', async () => {
    await setTabMode(11, 'inspect')
    await setTabMode(11, 'idle')
    expect((await getSession()).modes[11]).toBeUndefined()
  })

  it('تحفظ المهمة الجارية وتمحوها', async () => {
    await patchSession({
      job: { id: 'j1', kind: 'full-page', tabId: 5, startedAt: 1, done: 2, total: 10 },
    })
    expect((await getSession()).job?.id).toBe('j1')
    await patchSession({ job: null })
    expect((await getSession()).job).toBeNull()
  })

  it('القيمة التالفة تعود إلى الافتراضي', async () => {
    await fakeBrowser.storage.session.set({ 'rasd:session': 'ليست كائنًا' })
    expect(await getSession()).toEqual(defaultSession())
  })

  it('المسح يُفرِغ كل شيء', async () => {
    await setTabMode(1, 'colour')
    await clearSession()
    expect(await getSession()).toEqual(defaultSession())
  })
})
