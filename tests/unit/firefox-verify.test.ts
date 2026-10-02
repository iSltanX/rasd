// @vitest-environment node

import { existsSync, readdirSync, readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  firefoxGuards,
  FIREFOX_LOCK_PORT,
  ORDER,
  // @ts-expect-error — سكربت أدوات بلا تعريفات أنواع؛ يُستورَد لدوالّه الخالصة.
} from '../../scripts/firefox-verify.mjs'
import {
  allGuards,
  LOCK_PORT,
  // @ts-expect-error — سكربت أدوات بلا تعريفات أنواع؛ يُستورَد لدوالّه الخالصة.
} from '../../scripts/wave-verify.mjs'

/**
 * منسّق حرّاس Firefox (SS7) — الطائفة الثانية **خارج** بوّابة كروم: لا تدخل `allGuards` ولا قفلها، وكل حارسٍ
 * على قرصه له سكربته وكل سكربتٍ له ملفّه. التشغيل الفعلي في Firefox يثبته `pnpm verify:firefox` لا اختبار وحدة.
 */
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))

describe('حرّاس Firefox المعرَّفة', () => {
  it('`firefox:<name>` وحدها، بترتيب القيمة وما ليس فيه آخرًا', () => {
    const scripts = {
      'firefox:network': 'x',
      'firefox:zeta': 'x',
      'firefox:load': 'x',
      'verify:load': 'x',
      'firefox:popup': 'x',
    }
    expect(firefoxGuards({ scripts })).toEqual(['load', 'popup', 'network', 'zeta'])
  })

  it('كل حارس في package.json له ملفّه تحت scripts/firefox/، وكل ملفٍّ له سكربته', () => {
    const guards = firefoxGuards(pkg)
    const files = readdirSync('scripts/firefox')
      .map((f: string) => /^verify-([a-z-]+)\.mjs$/u.exec(f)?.[1])
      .filter(Boolean)
    expect(guards.sort()).toEqual(files.sort())
    for (const guard of guards) {
      expect(pkg.scripts[`firefox:${guard}`]).toBe(`node scripts/firefox/verify-${guard}.mjs`)
      expect(existsSync(`scripts/firefox/verify-${guard}.mjs`)).toBe(true)
    }
  })

  it('كل حارس معرَّف في ترتيب القيمة', () => {
    for (const guard of firefoxGuards(pkg)) expect(ORDER).toContain(guard)
  })
})

describe('الطائفتان منفصلتان', () => {
  it('`verify:firefox` ليس حارس كروم، ولا حارس Firefox في allGuards', () => {
    const chrome = allGuards(pkg)
    expect(chrome).not.toContain('firefox')
    for (const guard of firefoxGuards(pkg)) expect(chrome).not.toContain(`firefox:${guard}`)
  })

  it('قفلٌ غير قفل كروم', () => {
    expect(FIREFOX_LOCK_PORT).not.toBe(LOCK_PORT)
  })

  it('منفذ BiDi لكل حارس فريدٌ وخارج منافذ كروم (9329–9399)', () => {
    const guards: string[] = firefoxGuards(pkg)
    const ports = guards.map((guard) => {
      const text = readFileSync(`scripts/firefox/verify-${guard}.mjs`, 'utf8')
      return Number(/^const PORT = (\d+)$/mu.exec(text)?.[1])
    })
    expect(new Set(ports).size).toBe(ports.length)
    for (const port of ports) {
      expect(port).toBeGreaterThanOrEqual(9231)
      expect(port).toBeLessThanOrEqual(9244)
    }
  })
})
