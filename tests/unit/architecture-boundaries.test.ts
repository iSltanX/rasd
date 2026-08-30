// @vitest-environment node
// يشغّل ESLint على القرص، فلا علاقة له بالـDOM.

import { fileURLToPath, URL } from 'node:url'

import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

import {
  encodeComputedSelector,
  encodeLiteralSelector,
  encodeSelector,
  encodeSelectors,
  ENCODE_ALLOWED,
  restrictedSyntax,
} from '../../eslint.config.js'

/**
 * حدود المعمار ليست اتفاقًا شفويًا — هذا الاختبار يثبت أن `pnpm lint`
 * يسقط فعلًا عند الاستيراد الممنوع.
 *
 * تُلَنت شجرة العيّنات بـ`cwd` مضبوط عليها، لأن `no-restricted-paths`
 * يحلّ مسارات الـzones نسبةً إلى مجلّد العمل.
 */

const fixtureRoot = fileURLToPath(new URL('../fixtures/lint', import.meta.url))

async function lintFixture(relPath: string) {
  const eslint = new ESLint({
    cwd: fixtureRoot,
    overrideConfigFile: `${fixtureRoot}/eslint.fixture.config.js`,
    ignore: false,
  })
  const [result] = await eslint.lintFiles([`${fixtureRoot}/${relPath}`])
  return result?.messages ?? []
}

const RULE = 'import-x/no-restricted-paths'

describe('حدود المعمار مفروضة آليًا', () => {
  it('يمنع modules/ من استيراد ui/', async () => {
    const messages = await lintFixture('src/modules/violates-ui.ts')
    const violation = messages.find((m) => m.ruleId === RULE)
    expect(violation, 'كان يجب أن تُرفع مخالفة').toBeDefined()
    expect(violation?.severity).toBe(2)
    expect(violation?.message).toContain('modules/')
  })

  /*
   * أُضيفت في المرحلة 8 — أوّل مرحلة تملأ `modules/`. القاعدة السابقة كانت
   * تمنع `ui/` وتسمح بـ`content/`، أي تسمح لمنطق خالص أن يعتمد على طبقة
   * تشغيل. الفجوة لم تظهر قبلًا لأن `modules/` كانت فارغة.
   */
  it('يمنع modules/ من استيراد content/', async () => {
    const messages = await lintFixture('src/modules/violates-content.ts')
    const violation = messages.find((m) => m.ruleId === RULE)
    expect(violation, 'كان يجب أن تُرفع مخالفة').toBeDefined()
    expect(violation?.severity).toBe(2)
    expect(violation?.message).toContain('modules/')
  })

  it('يمنع content/ من استيراد pages/', async () => {
    const messages = await lintFixture('src/content/violates-pages.ts')
    const violation = messages.find((m) => m.ruleId === RULE)
    expect(violation, 'كان يجب أن تُرفع مخالفة').toBeDefined()
    expect(violation?.severity).toBe(2)
    expect(violation?.message).toContain('content/')
  })

  it('يمنع shared/ من استيراد أي طبقة أعلى', async () => {
    const messages = await lintFixture('src/shared/violates-modules.ts')
    const violation = messages.find((m) => m.ruleId === RULE)
    expect(violation, 'كان يجب أن تُرفع مخالفة').toBeDefined()
    expect(violation?.severity).toBe(2)
    expect(violation?.message).toContain('shared/')
  })

  it('يسمح لـmodules/ باستيراد shared/', async () => {
    const messages = await lintFixture('src/modules/allowed.ts')
    expect(messages.filter((m) => m.ruleId === RULE)).toHaveLength(0)
  })
})

/**
 * طبقة `workers/` — تُفتَح في المرحلة 15، وتُختبَر **قبل** أوّل ملفّ يسكنها.
 *
 * ADR 0014 يفرض ذلك بنصّه: «قاعدة حدود مكتوبة على طبقة فارغة غير مُختبَرة
 * ادّعاء لا برهان» — وهي عين الثغرة التي سدّها ADR 0008. وهو يفترض أن
 * المرحلة 14 أوّل من يبلغها؛ وترتيب ADR 0013 (`13 ← 15 ← 18 ← 16 ← 17 ← 14`)
 * ينقض الافتراض، فورثتها المرحلة 15.
 */
describe('حدود طبقة الـworkers', () => {
  it('يمنع workers/ من استيراد ui/', async () => {
    const messages = await lintFixture('src/workers/violates-ui.ts')
    const violation = messages.find((m) => m.ruleId === RULE)
    expect(violation, 'كان يجب أن تُرفع مخالفة').toBeDefined()
    expect(violation?.severity).toBe(2)
    expect(violation?.message).toContain('workers/')
  })

  it('يمنع workers/ من استيراد pages/', async () => {
    const messages = await lintFixture('src/workers/violates-pages.ts')
    const violation = messages.find((m) => m.ruleId === RULE)
    expect(violation, 'كان يجب أن تُرفع مخالفة').toBeDefined()
    expect(violation?.severity).toBe(2)
  })

  it('يسمح لـworkers/ باستيراد shared/', async () => {
    const messages = await lintFixture('src/workers/allowed.ts')
    expect(messages.filter((m) => m.ruleId === RULE)).toHaveLength(0)
  })

  /*
   * الاتجاه المعاكس مهمّ بقدر الأوّل: الـworker ناقلٌ لخوارزمية تعيش في
   * `modules/`، فلو استوردت `modules/` منه لانقلبت التبعية وصار المنطق
   * الخالص معتمدًا على خيط تنفيذ.
   */
  it('يمنع modules/ من استيراد workers/', async () => {
    const messages = await lintFixture('src/modules/violates-workers.ts')
    const violation = messages.find((m) => m.ruleId === RULE)
    expect(violation, 'كان يجب أن تُرفع مخالفة').toBeDefined()
    expect(violation?.message).toContain('modules/')
  })

  it('يمنع shared/ من استيراد workers/', async () => {
    const messages = await lintFixture('src/shared/violates-workers.ts')
    const violation = messages.find((m) => m.ruleId === RULE)
    expect(violation, 'كان يجب أن تُرفع مخالفة').toBeDefined()
    expect(violation?.message).toContain('shared/')
  })
})

/**
 * بوّابة الترميز — الحدّ الأمني للمرحلة 15 مفروضًا لنتًا.
 *
 * `toBlob`/`convertToBlob`/`toDataURL` هي كل مسارات خروج البكسلات من
 * المنتج. وادّعاء «الحجب لا يمكن عكسه في الملفّ المصدَّر» لا يكون قابلًا
 * للفرض إلّا إذا مرّ كل خروج من دالّة تخبز الحجب قبل الترميز.
 *
 * ويُفحَص هنا **شكل القاعدة المطبَّقة** لا سلوكها على عيّنة: الاستثناء
 * طرحُ محدِّد واحد من مصفوفة، لا إطفاء القاعدة على ملفّ — والفرق بينهما هو
 * بقاء `image-ops.ts` محروسًا من النداءات الخام والخصائص الفيزيائية.
 */
describe('بوّابة الترميز', () => {
  it('محدِّد الترميز يمنع toBlob وconvertToBlob وtoDataURL', () => {
    expect(encodeSelector.selector).toContain('toBlob')
    expect(encodeSelector.selector).toContain('convertToBlob')
    expect(encodeSelector.selector).toContain('toDataURL')
  })

  /*
   * **ثلاثة محدِّدات لا واحد — وهذا ما كشفه فحصٌ لا قراءة.**
   *
   * `callee.property.name` يطابق النداء بالنقطة وحده. وقِيس بتشغيل اللنت
   * على ملفّ عيّنة داخل `pages/editor/`: `c.convertToBlob(…)` تُرفض،
   * و`c['convertToBlob'](…)` **تمرّ**، و`const m = 'convertToBlob'; c[m](…)`
   * **تمرّ**. أي أن أي ملفّ في المحرر كان يستطيع ترميز القماش بلا خبز،
   * واللنت أخضر — عين الفشل الذي وُجدت البوّابة لمنعه.
   */
  it('**والوصول المحسوب يُمسَك كذلك** — لا بالنقطة وحدها', () => {
    expect(encodeComputedSelector.selector).toContain('computed=true')
    expect(encodeComputedSelector.selector).toContain('convertToBlob')
  })

  it('**والسلسلة نفسها تُمسَك أينما كُتبت** — فيُسدّ طريق المتغيّر الوسيط', () => {
    expect(encodeLiteralSelector.selector).toContain('Literal')
    expect(encodeLiteralSelector.selector).toContain('toDataURL')
  })

  it('والثلاثة تُطبَّق معًا لا فرادى', () => {
    expect(encodeSelectors).toHaveLength(3)
    expect(encodeSelectors).toContain(encodeSelector)
    expect(encodeSelectors).toContain(encodeComputedSelector)
    expect(encodeSelectors).toContain(encodeLiteralSelector)
    // ورسالة واحدة للثلاثة: من يقرأها يجد المسار نفسه مهما كتب النداء.
    expect(new Set(encodeSelectors.map((s) => s.message)).size).toBe(1)
  })

  it('المستثنون أربعة بالاسم — بوّابة المحرر ومسارا الالتقاط والتجميع ومُرمِّز المصغَّرات', () => {
    expect(ENCODE_ALLOWED).toEqual([
      'src/modules/editor/bake.ts',
      'src/background/image-ops.ts',
      'src/background/stitch.ts',
      'src/pages/library/thumbnail-encoder.ts',
    ])
  })

  /*
   * هذا هو البند الذي يمنع الانحراف: لو أُطفئت القاعدة على المستثنين بدل
   * طرح محدِّد واحد، لسقطت معها ستّ حراسات أخرى — وأوّلها أن `image-ops.ts`
   * لا ينادي `chrome.runtime.sendMessage` خامًا.
   */
  it('الاستثناء يُبقي بقيّة المحدِّدات السبعة سارية', () => {
    expect(restrictedSyntax).toHaveLength(7)
    const selectors = restrictedSyntax.map((r) => r.selector).join(' ')
    expect(selectors).toContain('chrome')
    expect(selectors).toContain('formatHuman')
    expect(selectors).not.toContain('toBlob')
  })
})
