// @vitest-environment node

import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  allGuards,
  planGuards,
  tryLock,
  verdict,
  // @ts-expect-error — سكربت أدوات بلا تعريفات أنواع؛ يُستورَد لدوالّه الخالصة.
} from '../../scripts/wave-verify.mjs'

/**
 * اختيار حرّاس بوّابة الموجة (ADR 0026) — الدالّة الخالصة وحدها. التشغيل الفعلي في كروم يثبته
 * أمرٌ مكتوب في `Docs/Engineering.md §6` الصفّ 151 لا اختبار وحدة.
 */
const all = ['activate', 'colour', 'compare', 'load', 'overlay', 'popup']
const blocking = ['activate', 'colour', 'load', 'overlay']
const cone = (needed: string[], unmapped = 0) => ({ needed, unmapped })

describe('الحرّاس المعرَّفة', () => {
  it('كل verify:* عدا dist وtokens وwave، مرتّبة', () => {
    const pkg = {
      scripts: {
        'verify:load': 'x',
        'verify:dist': 'x',
        'verify:tokens': 'x',
        'verify:wave': 'x',
        'verify:colour': 'x',
        build: 'x',
      },
    }
    expect(allGuards(pkg)).toEqual(['colour', 'load'])
  })

  it('package.json الحقيقي: الستّة والعشرون — `accessibility` من `STAGES/24` و`memory` من `STAGES/21` و`lighthouse` من `STAGES/22` و`visual` من `STAGES/26` و`network` من `STAGES/25`', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
    expect(allGuards(pkg)).toHaveLength(26)
  })
})

describe('اختيار الحرّاس لحجمٍ ومخروط', () => {
  it('cone: المخروط وحده', () => {
    expect(planGuards({ size: 'cone', cone: cone(['verify:popup']), all, blocking })).toEqual([
      'popup',
    ])
  })

  it('cone بلا مخروط: لا حارس', () => {
    expect(planGuards({ size: 'cone', cone: cone([]), all, blocking })).toEqual([])
  })

  it('cone وملفٌّ خارج الجدول: كلّها — الافتراض الآمن', () => {
    expect(planGuards({ size: 'cone', cone: cone([], 1), all, blocking })).toEqual(all)
  })

  it('blocking: المخروط ومعه الحاجبة، بلا تكرار', () => {
    expect(
      planGuards({ size: 'blocking', cone: cone(['verify:popup', 'verify:load']), all, blocking }),
    ).toEqual(['activate', 'colour', 'load', 'overlay', 'popup'])
  })

  it('all: كلّها', () => {
    expect(planGuards({ size: 'all', cone: cone([]), all, blocking })).toEqual(all)
  })

  it('--only: الحرّاس بأسمائها وحدها، ولا يُضاف إليها مخروط ولا حاجبة', () => {
    expect(
      planGuards({ size: 'blocking', cone: cone([], 1), all, blocking, only: ['popup', 'colour'] }),
    ).toEqual(['colour', 'popup'])
  })

  it('سكربتٌ في المخروط بلا تعريف في package.json لا يُشغَّل', () => {
    expect(planGuards({ size: 'cone', cone: cone(['verify:ghost']), all, blocking })).toEqual([])
  })
})

describe('حكم الحارس بعد محاولتيه', () => {
  it('أخضر من أوّل مرّة', () => {
    expect(verdict(true, undefined, false)).toBe('green')
  })

  it('سقط مرّتين: أحمر، معروفًا أو غير معروف', () => {
    expect(verdict(false, false, true)).toBe('red')
    expect(verdict(false, false, false)).toBe('red')
  })

  it('نجح عند الإعادة: مقبولٌ لمعروف التقطّع وحده', () => {
    expect(verdict(false, true, true)).toBe('flaky')
  })

  it('نجح عند الإعادة وليس في جدول 04: عَرَضٌ جديد يُسقط البوّابة', () => {
    expect(verdict(false, true, false)).toBe('unrecorded')
  })
})

/*
 * القفل منفذٌ محلّي تمنحه النواة لعملية واحدة وتحرّره بموتها. كان ملفًّا يُكتب بـ`wx`، فقِيس بثمانية
 * متنافسين: 15 تداخلًا في 25 جولة — قراءةُ ملفٍّ نصف مكتوب تُعدّه متروكًا فتحذفه (الصفّ 151).
 */
describe('قفل الحرّاس على الجهاز', () => {
  const PORT = 39329
  type Lock = { close: (done: () => void) => void } | null
  const take = (port: number) => tryLock(port) as Promise<Lock>
  const release = (lock: Lock) =>
    new Promise<void>((resolve) => {
      if (lock) lock.close(() => resolve())
      else resolve()
    })

  it('يمسكه واحدٌ ويُرفض الثاني ما دام الأوّل حيًّا، ثمّ يُمنح بعد تحريره', async () => {
    const first = await take(PORT)
    expect(first).not.toBeNull()
    expect(await take(PORT)).toBeNull()
    await release(first)
    const again = await take(PORT)
    expect(again).not.toBeNull()
    await release(again)
  })

  it('ثمانية متنافسين في اللحظة نفسها: واحدٌ يمسكه لا أكثر', async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => take(PORT)))
    const held = results.filter((lock) => lock !== null)
    expect(held).toHaveLength(1)
    await release(held[0] ?? null)
  })

  it('عبر العمليات: ستّ عمليات تتسابق فتمسكه واحدة، ويتحرّر بموتها بلا استرداد', async () => {
    const script = `import('./scripts/wave-verify.mjs').then(async (m) => {
      const s = await m.tryLock(${PORT}); console.log(s ? 'held' : 'busy');
      if (s) { s.ref(); setTimeout(() => process.exit(0), 2000) }
    })`
    const runs = await Promise.all(
      Array.from(
        { length: 6 },
        () =>
          new Promise<string>((resolve) => {
            const child = spawn(process.execPath, ['--input-type=module', '-e', script])
            let out = ''
            child.stdout.on('data', (chunk: Buffer) => (out += chunk.toString()))
            child.on('close', () => resolve(out.trim()))
          }),
      ),
    )
    expect(runs.filter((r) => r === 'held')).toHaveLength(1)
    expect(runs.filter((r) => r === 'busy')).toHaveLength(5)
    const after = await take(PORT)
    expect(after).not.toBeNull()
    await release(after)
  })
})
