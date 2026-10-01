import 'fake-indexeddb/auto'

import { fakeBrowser } from '@webext-core/fake-browser'
import { openDB } from 'idb'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getSettingsResult, resetSettingsCache } from '@/shared/settings'
import { settingsFile } from '@/shared/settings/transfer'
import { eraseAllData } from '@/shared/storage/erase'
import {
  deleteVaultDatabase,
  forgetSecret,
  hasSecret,
  readSecret,
  saveSecret,
  VAULT_DB_NAME,
  vaultKey,
} from '@/shared/storage/vault'

/**
 * خزنة الرمز — ADR 0046 §5، `STAGES/11` معيار القبول الأوّل: **الرمز لا يظهر نصًّا صريحًا في `chrome.storage`**.
 *
 * والفحص على التخزين كلّه لا على مفتاحٍ واحد: `local` و`session` و`sync` مقروءةً بـ`get(null)`، بالنصّ وبـbase64
 * وبـhex — فرمزٌ يُكتب في مكانٍ آخر أو بترميزٍ آخر يُسقطه. **ويحمرّ عند تعطيل التشفير:** استُبدل نداء
 * `crypto.subtle.encrypt` بترميز النصّ نفسه فسقط «لا يظهر صريحًا» بـbase64 الرمز.
 */

const TOKEN = 'github_pat_11ABCDEFG0123456789_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOP'

const encodings = (secret: string) => {
  const bytes = new TextEncoder().encode(secret)
  return [secret, btoa(secret), Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')]
}

async function everythingInChromeStorage(): Promise<string> {
  const areas = ['local', 'session', 'sync'] as const
  const dumps = await Promise.all(areas.map((a) => chrome.storage[a].get(null)))
  return JSON.stringify(dumps)
}

async function vaultKeyCount(): Promise<number> {
  const db = await openDB(VAULT_DB_NAME)
  try {
    return db.objectStoreNames.contains('keys') ? await db.count('keys') : 0
  } finally {
    db.close()
  }
}

beforeEach(async () => {
  fakeBrowser.reset()
  resetSettingsCache()
  await deleteVaultDatabase()
})

describe('الحفظ والقراءة', () => {
  it('يُقرأ كما حُفظ', async () => {
    expect((await saveSecret('github', TOKEN)).ok).toBe(true)
    expect(await readSecret('github')).toEqual({ ok: true, value: TOKEN })
    expect(await hasSecret('github')).toEqual({ ok: true, value: true })
  })

  it('لا سجلّ ⇐ `null` لا خطأ (غير متّصل)', async () => {
    expect(await readSecret('github')).toEqual({ ok: true, value: null })
    expect(await hasSecret('github')).toEqual({ ok: true, value: false })
  })

  it('الرمز لا يظهر صريحًا في chrome.storage — لا نصًّا ولا base64 ولا hex', async () => {
    await saveSecret('github', TOKEN)
    const dump = await everythingInChromeStorage()
    for (const form of encodings(TOKEN)) expect(dump).not.toContain(form)
    // وجزءٌ مميِّز منه لا يظهر أيضًا: تشفيرٌ جزئيّ لا يمرّ.
    expect(dump).not.toContain('abcdefghijklmnop')
  })

  it('السجلّ في local وحده، ومفتاحه في قاعدة الخزنة لا في chrome.storage', async () => {
    await saveSecret('github', TOKEN)
    const record = (await chrome.storage.local.get(vaultKey('github')))[
      vaultKey('github')
    ] as Record<string, unknown>
    expect(Object.keys(record).sort()).toEqual(['data', 'iv', 'keyId', 'v'])
    expect(await vaultKeyCount()).toBe(1)
  })

  it('المفتاح غير قابل للتصدير', async () => {
    await saveSecret('github', TOKEN)
    const db = await openDB(VAULT_DB_NAME)
    const [row] = (await db.getAll('keys')) as { key: CryptoKey }[]
    db.close()
    expect(row?.key.extractable).toBe(false)
    await expect(crypto.subtle.exportKey('raw', row!.key)).rejects.toThrow()
  })

  it('كل حفظٍ مفتاحٌ جديد ومتّجهٌ جديد، والمفاتيح السابقة تُزال', async () => {
    await saveSecret('github', TOKEN)
    const first = (await chrome.storage.local.get(vaultKey('github')))[vaultKey('github')]
    await saveSecret('github', `${TOKEN}-2`)
    const second = (await chrome.storage.local.get(vaultKey('github')))[vaultKey('github')]
    expect(second).not.toEqual(first)
    expect(await vaultKeyCount()).toBe(1)
    expect(await readSecret('github')).toEqual({ ok: true, value: `${TOKEN}-2` })
  })
})

describe('ما لا يُفكّ', () => {
  it('سجلٌّ بلا مفتاحه ⇐ `unreadable` لا `null`: «أعد الاتّصال» لا «غير متّصل»', async () => {
    await saveSecret('github', TOKEN)
    await deleteVaultDatabase()
    const read = await readSecret('github')
    expect(read.ok).toBe(false)
    if (!read.ok) expect(read.error.failure).toBe('unreadable')
  })

  it('نصٌّ عُبث به لا يُفكّ (المصادقة في AES-GCM)', async () => {
    await saveSecret('github', TOKEN)
    const key = vaultKey('github')
    const record = (await chrome.storage.local.get(key))[key] as { data: string }
    const bytes = Uint8Array.from(atob(record.data), (c) => c.charCodeAt(0))
    bytes[0] = (bytes[0] ?? 0) ^ 1
    await chrome.storage.local.set({
      [key]: { ...record, data: btoa(String.fromCharCode(...bytes)) },
    })
    const read = await readSecret('github')
    expect(read.ok ? read.value : read.error.failure).toBe('unreadable')
  })

  it('سجلٌّ بشكلٍ غير معروف ⇐ `unreadable`', async () => {
    await chrome.storage.local.set({ [vaultKey('github')]: { token: TOKEN } })
    const read = await readSecret('github')
    expect(read.ok ? read.value : read.error.failure).toBe('unreadable')
  })
})

describe('الكتابات المتزامنة — المراجعة المستقلّة', () => {
  it('حفظان متزامنان: يبقى آخرهما مقروءًا، لا سجلٌّ بلا مفتاحه', async () => {
    for (let round = 0; round < 10; round++) {
      await Promise.all([saveSecret('github', `${TOKEN}-a`), saveSecret('github', `${TOKEN}-b`)])
      expect(await readSecret('github')).toEqual({ ok: true, value: `${TOKEN}-b` })
      expect(await vaultKeyCount()).toBe(1)
    }
  })

  /**
   * الترتيب ترتيب النداء لا ترتيب انتهاء التشفير. كان التشفير يجري قبل القفل، فحفظٌ تأخّر تشفيره دخل الطابور بعد
   * حفظٍ نودي بعده وكتب فوقه — سقط الاختبار السابق مرّةً في جولة CI ‏36835982821 (4.5% من الأزواج تحت حملٍ محلّي).
   * هنا يُحبس تشفير الأوّل حتمًا: إن كان الثاني قد بدأ تشفيره (خارج القفل — العطل) انتظر الأوّل حتى يُتمّه ويطلب
   * القفل؛ وإن لم يبدأ فهو واقفٌ في الطابور خلف الأوّل (الإصلاح) فلا انتظار. لا مهلة زمنية في الحالتين.
   */
  it('حفظان متزامنان وتشفير أوّلهما أبطأ: يبقى آخرهما نداءً', async () => {
    const subtle = crypto.subtle
    const encrypt = subtle.encrypt.bind(subtle)
    const generateKey = subtle.generateKey.bind(subtle) as (
      ...args: Parameters<SubtleCrypto['generateKey']>
    ) => Promise<CryptoKey>
    const tick = () => new Promise((resolve) => setTimeout(resolve, 0))
    let keysGenerated = 0
    let secondEncrypted = false
    const keys = vi.spyOn(subtle, 'generateKey').mockImplementation(((
      ...args: Parameters<SubtleCrypto['generateKey']>
    ) => {
      keysGenerated++
      return generateKey(...args)
    }) as SubtleCrypto['generateKey'])
    const encryption = vi.spyOn(subtle, 'encrypt').mockImplementation(async (params, key, data) => {
      const plain = new TextDecoder().decode(data)
      if (plain === `${TOKEN}-a`) {
        while (keysGenerated > 1 && !secondEncrypted) await tick()
        // دورةٌ أخرى كي يبلغ الثاني طلبَ القفل بعد تشفيره.
        await tick()
      }
      const cipher = await encrypt(params, key, data)
      if (plain === `${TOKEN}-b`) secondEncrypted = true
      return cipher
    })
    let saved
    try {
      saved = await Promise.all([
        saveSecret('github', `${TOKEN}-a`),
        saveSecret('github', `${TOKEN}-b`),
      ])
    } finally {
      keys.mockRestore()
      encryption.mockRestore()
    }
    // الحفظان نجحا كلاهما — فحفظٌ أوّل فشل لا يُخضرّ الاختبار زورًا.
    expect(saved.map((r) => r.ok)).toEqual([true, true])
    expect(await readSecret('github')).toEqual({ ok: true, value: `${TOKEN}-b` })
    expect(await vaultKeyCount()).toBe(1)
  })

  it('«اقطع الاتّصال» بعد «اتّصل» مباشرةً لا يُبقي رمزًا', async () => {
    await Promise.all([saveSecret('github', TOKEN), forgetSecret('github')])
    expect(await readSecret('github')).toEqual({ ok: true, value: null })
    expect(await vaultKeyCount()).toBe(0)
  })

  it('النسيان أثناء حفظٍ معلّق لا يُبعث سجلًّا بلا مفتاح', async () => {
    const local = chrome.storage.local
    let release!: () => void
    let entered!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    const writing = new Promise<void>((resolve) => (entered = resolve))
    Object.assign(globalThis.chrome.storage, {
      local: {
        ...local,
        set: async (items: Record<string, unknown>) => {
          entered()
          await gate
          return local.set(items)
        },
      },
    })
    try {
      // الحفظ كتب مفتاحه وينتظر كتابة سجلّه، ثمّ يضغط المستخدم «اقطع الاتّصال».
      const saving = saveSecret('github', TOKEN)
      await writing
      const forgetting = forgetSecret('github')
      await new Promise((resolve) => setTimeout(resolve, 20))
      release()
      await Promise.all([saving, forgetting])
    } finally {
      Object.assign(globalThis.chrome.storage, { local })
    }
    expect(await readSecret('github')).toEqual({ ok: true, value: null })
    expect(await hasSecret('github')).toEqual({ ok: true, value: false })
  })
})

describe('النسيان والحذف', () => {
  it('forgetSecret يزيل السجلّ والمفتاح', async () => {
    await saveSecret('github', TOKEN)
    expect((await forgetSecret('github')).ok).toBe(true)
    expect(await readSecret('github')).toEqual({ ok: true, value: null })
    expect(await vaultKeyCount()).toBe(0)
  })

  it('«احذف كل البيانات» يزيل السجلّ وقاعدة المفاتيح', async () => {
    await saveSecret('github', TOKEN)
    expect((await eraseAllData()).ok).toBe(true)
    expect(await everythingInChromeStorage()).not.toContain(vaultKey('github'))
    const names = (await indexedDB.databases()).map((d) => d.name)
    expect(names).not.toContain(VAULT_DB_NAME)
  })
})

describe('الرمز لا يخرج في تصدير', () => {
  it('ملفّ تصدير الإعدادات لا يحمل الرمز ولا سجلّه', async () => {
    await saveSecret('github', TOKEN)
    const settings = await getSettingsResult()
    expect(settings.ok).toBe(true)
    if (!settings.ok) return
    const file = settingsFile(settings.value, Date.now(), '1.0.0')
    for (const form of encodings(TOKEN)) expect(file).not.toContain(form)
    expect(file).not.toContain('rasd:vault')
  })
})
