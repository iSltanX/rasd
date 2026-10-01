// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  extensionPagesCsp,
  NETWORK_ORIGINS,
  OPTIONAL_HOST_PERMISSIONS,
} from '@/shared/permission-policy'

import {
  judgeExtensionCsp,
  judgeHostPermissions,
  parseCsp,
  // @ts-expect-error — سكربت أدوات بلا تعريفات أنواع؛ يُستورَد لدوالّه الخالصة.
} from '../../../scripts/csp-policy.mjs'

/**
 * حكم `verify:dist` على سياسة صفحات الإضافة — ADR 0046 §1–2، `STAGES/11` معيار القبول الثالث.
 *
 * **موجبةٌ تمرّ وسالبةٌ لكل صنفٍ مرفوض:** السياسة المبنيّة من القائمة المسمّاة تمرّ، ومصدرٌ خارجيّ ثانٍ مضافٌ عمدًا
 * يسقط باسمه — وكذلك النجمة والمخطّط العامّ وغياب `'self'` وغياب `connect-src` نفسها ومصدرٌ في `script-src`.
 */

const NAMED = [...NETWORK_ORIGINS]
const problems = (csp: string, named: readonly string[] = NAMED): string[] =>
  (judgeExtensionCsp(csp, [...named]) as { problems: string[] }).problems

describe('السياسة المبنيّة من القائمة المسمّاة', () => {
  it('تمرّ، و`connect-src` فيها `self` والخدمات المسمّاة وحدها', () => {
    const csp = extensionPagesCsp()
    expect(problems(csp)).toEqual([])
    expect(judgeExtensionCsp(csp, NAMED).connect).toEqual(["'self'", ...NAMED])
  })

  it('الخدمتان المسمّاتان اليوم: api.github.com (ADR 0046) ونقطة استقبال البلاغات (ADR 0050)', () => {
    expect(NAMED).toEqual(['https://api.github.com', 'https://app-reports.isultantf.workers.dev'])
  })

  it('كل خدمةٍ مسمّاة لها صلاحية مضيف اختيارية', () => {
    for (const origin of NAMED) expect(OPTIONAL_HOST_PERMISSIONS).toContain(`${origin}/*`)
  })
})

describe('ما يُرفض', () => {
  const base = extensionPagesCsp()

  it('مصدرٌ خارجيّ ثانٍ مضافٌ عمدًا إلى connect-src', () => {
    const tampered = base.replace('connect-src', 'connect-src https://evil.example')
    expect(problems(tampered).join('\n')).toMatch(/غير مسمًّى.*https:\/\/evil\.example/u)
  })

  it('مصدرٌ ثالث بجانب الخدمتين المسمّاتين — `STAGES/13`: يُسمح بنقطة الاستقبال وحدها لا بما بعدها', () => {
    const third = base.replace(
      'https://app-reports.isultantf.workers.dev',
      'https://app-reports.isultantf.workers.dev https://other-reports.example',
    )
    expect(problems(third).join('\n')).toMatch(/غير مسمًّى.*other-reports\.example/u)
    // ونقطة استقبالٍ غير المسمّاة بدل المسمّاة: ناقصةٌ وزائدة معًا.
    const swapped = base.replace(
      'https://app-reports.isultantf.workers.dev',
      'https://app-reports.attacker.workers.dev',
    )
    expect(problems(swapped).join('\n')).toMatch(/غائبة.*app-reports\.isultantf/u)
  })

  it('النجمة والمخطّط العامّ و`data:` و`blob:` و`http`', () => {
    for (const source of ['*', 'https:', 'data:', 'blob:', 'http://api.github.com', 'wss://x.io']) {
      expect(problems(`${base} ${source}`), source).not.toEqual([])
    }
  })

  it('خدمةٌ مسمّاة غائبة عن السياسة — تُسقط البناء لا تمرّ صامتةً', () => {
    expect(problems("script-src 'self'; object-src 'self'; connect-src 'self'").join()).toMatch(
      /غائبة/u,
    )
  })

  it("`connect-src` بلا `'self'`، أو بلا `connect-src` أصلًا", () => {
    expect(problems(`script-src 'self'; connect-src ${NAMED.join(' ')}`).join()).toMatch(/'self'/u)
    expect(problems("script-src 'self'; object-src 'self'").join()).toMatch(/لا connect-src/u)
  })

  it('مصدرٌ خارجيّ في `script-src` أو `object-src`', () => {
    expect(
      problems(base.replace("script-src 'self'", "script-src 'self' https://cdn.x")),
    ).not.toEqual([])
    expect(
      problems(base.replace("object-src 'self'", "object-src 'self' https://api.github.com")),
    ).not.toEqual([])
  })

  it('`unsafe-eval` و`unsafe-inline` في أي توجيه', () => {
    expect(
      problems(base.replace("script-src 'self'", "script-src 'self' 'unsafe-eval'")),
    ).not.toEqual([])
    expect(problems(`${base} 'unsafe-inline'`)).not.toEqual([])
  })

  it('توجيهٌ مكرَّر — الثاني يُتجاهَل في المتصفّح فلا يُعتمد عليه', () => {
    expect(problems(`${base}; connect-src 'self'`).join()).toMatch(/مكرَّر/u)
  })

  it('سياسة فارغة', () => {
    expect(problems('')).not.toEqual([])
  })

  it('أصلٌ مسمًّى بمسار أو بنجمة في القائمة نفسها', () => {
    expect(problems(extensionPagesCsp(), ['https://api.github.com/repos']).join()).toMatch(
      /غير صالح/u,
    )
    expect(problems(extensionPagesCsp(), ['https://*.github.com']).join()).toMatch(/غير صالح/u)
  })
})

describe('parseCsp و judgeHostPermissions', () => {
  it('يقسم التوجيهات بترتيبها', () => {
    expect((parseCsp("a 'self'; b x y;") as { name: string }[]).map((d) => d.name)).toEqual([
      'a',
      'b',
    ])
  })

  it('صلاحيات المضيف: زائدٌ وناقص بالاسم', () => {
    const policy = [...OPTIONAL_HOST_PERMISSIONS]
    expect(judgeHostPermissions(policy, policy)).toEqual({ extra: [], missing: [] })
    expect(judgeHostPermissions([...policy, 'https://x.io/*'], policy).extra).toEqual([
      'https://x.io/*',
    ])
    expect(judgeHostPermissions(['<all_urls>'], policy).missing).toEqual([
      'https://api.github.com/*',
      'https://app-reports.isultantf.workers.dev/*',
    ])
    expect(judgeHostPermissions(undefined, policy).missing).toEqual(policy)
  })
})
