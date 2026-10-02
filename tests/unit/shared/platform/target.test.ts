import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * `TARGET` ثابت بناءٍ من `VITE_RASD_TARGET` (يضعه `define` في `vite.config.ts`). غيابه ⇒ `chromium`، وما ليس `firefox`
 * يرجع إليه — قيمةٌ مجهولة لا تُنتج ثالثًا صامتًا. والوحدة تُقرأ عند الاستيراد، فكل حالة تعيد تحميلها.
 */
afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

async function targetWith(value: string | undefined): Promise<string> {
  vi.resetModules()
  if (value === undefined) vi.stubEnv('VITE_RASD_TARGET', '')
  else vi.stubEnv('VITE_RASD_TARGET', value)
  const mod = await import('@/shared/platform/target')
  return mod.TARGET
}

describe('TARGET', () => {
  it('بلا تحديد ⇒ chromium (الاختبارات والتطوير)', async () => {
    expect(await targetWith(undefined)).toBe('chromium')
  })

  it('firefox يُقرأ كما هو', async () => {
    expect(await targetWith('firefox')).toBe('firefox')
  })

  it('chromium صريحًا', async () => {
    expect(await targetWith('chromium')).toBe('chromium')
  })

  it.each(['opera', 'Firefox', 'FIREFOX', 'edge', 'firefox ', '0'])(
    'سالب: «%s» ليس هدفًا فيرجع إلى chromium',
    async (junk) => {
      expect(await targetWith(junk)).toBe('chromium')
    },
  )
})
