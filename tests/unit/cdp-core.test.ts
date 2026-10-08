// @vitest-environment node
// يقرأ سكربتات الحرّاس من القرص، فلا علاقة له بالـDOM.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'

import { describe, expect, it } from 'vitest'

// @ts-expect-error — سكربت أدوات بلا تعريفات أنواع.
import { guardDeps } from '../../scripts/guards-sync.mjs'
import {
  createReport,
  pageTargetAt,
  sabotageList,
  unpackedExtensionId,
  waitForInstallFlow,
  // @ts-expect-error — سكربت أدوات بلا تعريفات أنواع؛ يُستورَد لدوالّه الخالصة.
} from '../../scripts/lib/cdp.mjs'
import { PAGE_PATHS } from '../../src/shared/page-paths'

/**
 * النواة المشتركة للحرّاس (`STAGES/17`، ADR 0042): كل حارس كروم فوقها، والتحميل فيها وحدها.
 *
 * هذا ما يُبقي معيار القبول صادقًا بعد إغلاق المرحلة: `Extensions.loadUnpacked` صفرٌ خارج النواة،
 * وحارسٌ جديد يُكتب بنسخة من الإقلاع القديم يسقط هنا قبل أن يصل CI.
 */
const root = join(__dirname, '..', '..')
const scripts = join(root, 'scripts')
const read = (rel: string): string | null =>
  existsSync(join(root, rel)) ? readFileSync(join(root, rel), 'utf8') : null

/** حرّاس كروم: كل `verify-*.mjs` عدا الساكنَين اللذين يجريان في البوّابة A. */
const chromeGuards = readdirSync(scripts)
  .filter((f) => /^verify-[a-z-]+\.mjs$/u.test(f))
  .filter((f) => f !== 'verify-dist.mjs' && f !== 'verify-tokens.mjs')

describe('الحرّاس فوق النواة المشتركة', () => {
  it('ستّة وعشرون حارس كروم — والعدد مثبَّت كي يظهر حارسٌ جديد (`accessibility` في `STAGES/24` و`memory` في `STAGES/21` و`lighthouse` في `STAGES/22` و`visual` في `STAGES/26` و`network` في `STAGES/25`)', () => {
    expect(chromeGuards).toHaveLength(26)
  })

  it.each(chromeGuards)('%s لا يحمّل الإضافة بنفسه', (file) => {
    expect(read(`scripts/${file}`)).not.toContain('Extensions.loadUnpacked')
  })

  it.each(chromeGuards)('%s يستورد النواة — فبصمته تشملها', (file) => {
    expect(guardDeps(`scripts/${file}`, read)).toContain('scripts/lib/cdp.mjs')
  })

  it('النواة وحدها تحمّل الإضافة', () => {
    expect(read('scripts/lib/cdp.mjs')).toContain("'Extensions.loadUnpacked'")
  })
})

describe('دوالّ النواة الخالصة', () => {
  /*
   * المعرّف مرجعيّ: هو ما حسبه كروم فعلًا لمسارٍ ثابت في جولة `verify:load` — أوّل 16 بايتًا من
   * SHA-256 للمسار، كل نصف بايت إلى a–p.
   */
  it('معرّف الإضافة غير المضغوطة حتميّ من المسار ومن الأحرف a–p', () => {
    const id = unpackedExtensionId('/tmp/rasd-dist')
    expect(id).toMatch(/^[a-p]{32}$/u)
    expect(unpackedExtensionId('/tmp/rasd-dist')).toBe(id)
    expect(unpackedExtensionId('/tmp/rasd-dist2')).not.toBe(id)
  })

  it('قائمة التخريب تُقرأ من البيئة، والفراغ لا شيء', () => {
    expect(sabotageList({})).toEqual([])
    expect(sabotageList({ RASD_GUARD_SABOTAGE: '' })).toEqual([])
    expect(sabotageList({ RASD_GUARD_SABOTAGE: 'content.js, service-worker-loader.js,' })).toEqual([
      'content.js',
      'service-worker-loader.js',
    ])
  })

  it('التقرير يعدّ الإخفاقات وحدها', () => {
    const r = createReport()
    r.ok('أ')
    r.note('ب')
    r.fail('ج')
    expect(r.errors).toEqual(['ج'])
    expect(r.lines).toEqual(['  ✓ أ', '  · ب', '  ✗ ج'])
  })
})

/**
 * **جولة التعريف تتقدّم على صفحة الحارس إن فرغ مستمع التثبيت بعد فتحها** (الجولتان `36814645684` و
 * `36835982821`): الصفحة تُخبّأ، و`requestAnimationFrame` لا يجري في صفحة مخفيّة، فيعلق كل `settle`
 * حتى الحدّ الأقصى. فالنواة لا تسلّم العامل لحارسه قبل أن تصير الجولة هي النشطة — أي فرغ المستمع.
 *
 * التعبير يُقيَّم هنا على `chrome` مزيّف كما يقيّمه العامل، فيُختبر شرطه لا شكله.
 */
describe('انتظار مستمع التثبيت قبل تسليم العامل', () => {
  const ORIGIN = 'chrome-extension://abc/'
  const blank = { id: 1, active: true, url: '' }
  const tour = (active: boolean) => ({
    id: 2,
    active,
    url: '',
    pendingUrl: `${ORIGIN}${PAGE_PATHS.onboarding}`,
  })

  /** عاملٌ مزيّف: كل تقييم يقرأ اللقطة التالية من حالات التبويبات (والأخيرة تبقى). */
  const fakeWorker = (states: { id: number; active: boolean; url: string }[][]) => {
    let calls = 0
    const evaluate = (expression: string): Promise<unknown> => {
      const tabs = states[Math.min(calls++, states.length - 1)] ?? []
      const chrome = {
        runtime: { getURL: (p: string) => `${ORIGIN}${p}` },
        tabs: {
          query: (q: { active?: boolean }) =>
            Promise.resolve(tabs.filter((t) => q.active === undefined || t.active === q.active)),
        },
      }
      return Promise.resolve(runInNewContext(expression, { chrome }))
    }
    return { evaluate, calls: () => calls }
  }

  it('لا يعود حتى تصير الجولة النشطة — وجودها في الخلفية لا يكفي', async () => {
    const w = fakeWorker([[blank], [blank, tour(false)], [{ ...blank, active: false }, tour(true)]])
    await expect(waitForInstallFlow(w.evaluate, { pollMs: 0 })).resolves.toBe(true)
    expect(w.calls()).toBe(3)
  })

  it('سياقٌ يُستبدَل أثناء الإقلاع يُعاد تقييمه ولا يُقرأ «فرغ»', async () => {
    let n = 0
    const evaluate = () =>
      n++ === 0 ? Promise.reject(new Error('context')) : Promise.resolve(true)
    await expect(waitForInstallFlow(evaluate, { pollMs: 0 })).resolves.toBe(true)
    expect(n).toBe(2)
  })

  it('جولةٌ لا تأتي أبدًا تنتهي بمهلتها بـ`false` — لا تعليق', async () => {
    const w = fakeWorker([[blank]])
    await expect(waitForInstallFlow(w.evaluate, { pollMs: 1, timeoutMs: 20 })).resolves.toBe(false)
  })

  it('`startGuard` ينتظره بعد الارتباط بالعامل وقبل تسليمه', () => {
    const core = read('scripts/lib/cdp.mjs') ?? ''
    const attach = core.indexOf('await attachLiveServiceWorker(send')
    const wait = core.indexOf('await waitForInstallFlow(')
    expect(attach).toBeGreaterThan(-1)
    expect(wait).toBeGreaterThan(attach)
    expect(wait).toBeLessThan(core.indexOf('const finish = async'))
  })
})

/**
 * **الارتباط بالصفحة بعنوانها كاملًا لا بجزءٍ منه** (`Docs/Engineering.md §6` الصفّ 479): الترتيب أدناه هو ما
 * أعاده `Target.getTargets` في Chrome 155 عند الخطوة 15 من `verify:colour` — صفحة `cases.html` المخفيّة قبل التبويب
 * الجديد — فكان «أوّل تطابق جزئي» يمسك المخفيّة وينتظر إطارًا لا يأتي.
 */
describe('الارتباط بالصفحة بعنوانها كاملًا', () => {
  const BASE = 'http://127.0.0.1:5399'
  const page = (targetId: string, url: string) => ({ type: 'page', targetId, url })
  const chrome155 = [
    page('tour', 'chrome-extension://abc/src/pages/onboarding/index.html'),
    page('cases', `${BASE}/contrast-5000/cases.html`),
    page('blank', 'about:blank'),
    page('big', `${BASE}/contrast-5000/`),
    page('colour', `${BASE}/colour/`),
    { type: 'service_worker', targetId: 'sw', url: `${BASE}/contrast-5000/` },
  ]

  it('يختار الصفحة التي عنوانها هو المطلوب ولو سبقتها صفحةٌ تحتوي النصّ — ويطبّع العنوان لا أكثر', () => {
    expect(pageTargetAt(chrome155, `${BASE}/contrast-5000/`)?.targetId).toBe('big')
    expect(pageTargetAt(chrome155, `${BASE}/contrast-5000/cases.html`)?.targetId).toBe('cases')
    expect(pageTargetAt(chrome155, `${BASE}/colour/`)?.targetId).toBe('colour')
    // التطبيع: حالة أحرف الأصل ومنفذٌ افتراضي مكتوب — لا أكثر: شرطةٌ ناقصة أو جزءٌ زائد لا يطابقان.
    expect(pageTargetAt(chrome155, 'HTTP://127.0.0.1:5399/colour/')?.targetId).toBe('colour')
    expect(pageTargetAt([page('p', 'http://h/')], 'http://h:80/')?.targetId).toBe('p')
    expect(pageTargetAt(chrome155, `${BASE}/colour`)).toBeNull()
    expect(pageTargetAt(chrome155, `${BASE}/colour/#x`)).toBeNull()
  })

  it('المطابقة الجزئية القديمة كانت تمسك المخفيّة — وهو السالب الذي أعاد السقوط', () => {
    const first = chrome155.find((t) => t.type === 'page' && t.url.includes('/contrast-5000/'))
    expect(first?.targetId).toBe('cases')
    expect(pageTargetAt(chrome155, `${BASE}/contrast-5000/`)?.targetId).not.toBe(first?.targetId)
  })

  it('الاستعلام يميّز الصفحة، وغير الصفحات لا تُطابَق، وما لا يوجد `null`', () => {
    const withHuge = [...chrome155, page('huge', `${BASE}/contrast-5000/?n=50000`)]
    expect(pageTargetAt(withHuge, `${BASE}/contrast-5000/?n=50000`)?.targetId).toBe('huge')
    expect(pageTargetAt(withHuge, `${BASE}/contrast-5000/`)?.targetId).toBe('big')
    expect(pageTargetAt(chrome155, `${BASE}/contrast-5000/?n=50000`)).toBeNull()
    expect(
      pageTargetAt([{ type: 'service_worker', targetId: 'sw', url: `${BASE}/x/` }], `${BASE}/x/`),
    ).toBeNull()
  })

  it('`verify-colour.mjs` يرتبط عبر النواة ولا يعود إلى المطابقة الجزئية', () => {
    const guard = read('scripts/verify-colour.mjs') ?? ''
    expect(guard).toContain('pageTargetAt(targetInfos, `${BASE}${path}`)')
    expect(guard).not.toMatch(/\burl\)?\.(includes|startsWith|indexOf)\(/u)
  })
})
