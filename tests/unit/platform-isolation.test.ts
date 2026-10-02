// @vitest-environment node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { describe, expect, it } from 'vitest'

import { codeOnly } from '../helpers/code-only'

/**
 * **`src/shared/platform/` هو المكان الوحيد الذي يعرف المتصفّح** — `Docs/Browsers/Architecture.md` §4.1.
 *
 * هدف البناء (`TARGET`) وأسماء المتصفّحات لا تظهر في شيفرة `src/` خارج ذلك المجلّد، فلا يختلط Chromium بFirefox
 * بOpera لاحقًا في ملفٍّ لا يدري أحدٌ أنه يعرف الفرق. المسح بلا تعليقات (`tests/helpers/code-only.ts`) على نسق
 * `egress-single-exit.test.ts`، **وهو سلكُ إنذارٍ لا حدّ**: `window['fire' + 'fox']` لا يراه. الحدّ الحقيقي أن الفرق
 * يُحسم بالكشف عن القدرة (`platform/capabilities.ts`) لا بسؤال «أيّ متصفّح».
 *
 * القائمة أدناه مواضع **مشروعة** لا تعرف متصفّحًا تشغيلًا، وكلٌّ بعدّه وسببه: نداءٌ زائد في ملفٍّ مسموح يُسقطه،
 * وبند لا يطابقه شيء (مات سببه) يُسقطه أيضًا — فلا تتراكم استثناءاتٌ ميتة.
 */

const SRC = fileURLToPath(new URL('../../src', import.meta.url))

/** المجلّد المعفى — بالشرطة الأخيرة: `shared/platform.ts` (نظام التشغيل) بجواره **ليس** معفًى. */
const PLATFORM_DIR = 'shared/platform/'

const ALLOWED: Record<string, { count: number; why: string }> = {
  'shared/restricted.ts': {
    count: 4,
    why: 'مخطّطات الروابط الداخلية (`edge:` `brave:` `opera:` `vivaldi:`) — صفحاتٌ يُرفض الحقن فيها، لا فرق تشغيل',
  },
  'modules/dom-picker/hit-test.ts': {
    count: 5,
    why: 'دالّة `edge` الهندسية لحافّة صندوق CSS — اسمٌ لا متصفّح',
  },
  'pages/editor/page-meta.ts': {
    count: 3,
    why: 'تعبير UA الذي يسمّي المتصفّح في بطاقة بيانات صفحة المحرّر (ويرجع إلى `userAgent` عند غياب العلامات) — تسمية عرضٍ لا هويّة تشخيص، فلم تنتقل إلى `platform/identity.ts` في SS2',
  },
}

/** الثابت بحساسية حالة الأحرف: `target` المتغيّر شائع، و`TARGET` الثابت وحده هو الهدف. وقراءة المتغيّر مباشرةً (`RASD_TARGET`) مسدودة. */
const TARGET_PATTERN = /\bTARGET\b|RASD_TARGET/gu
/** الأسماء كلمةً كاملة بلا حساسية حالة: `Opera` و`opera:` تُلتقطان، و`operator` و`bravery` لا. */
const NAME_PATTERN = /\b(?:firefox|opera|brave|vivaldi|edge|chromium)\b/giu

interface SourceFile {
  readonly path: string
  readonly source: string
}

function hitsIn({ path, source }: SourceFile): number {
  const code = codeOnly(source, path)
  return (code.match(TARGET_PATTERN)?.length ?? 0) + (code.match(NAME_PATTERN)?.length ?? 0)
}

/** حكمٌ واحد على قائمة ملفّات — يغذّيه المسح الحقيقي والملفّات المصنوعة، فالسالب يمرّ من الشيفرة نفسها. */
function judge(files: readonly SourceFile[]): {
  outside: string[]
  drifted: string[]
  found: Map<string, number>
} {
  const found = new Map<string, number>()
  for (const file of files) {
    if (file.path.startsWith(PLATFORM_DIR)) continue
    const hits = hitsIn(file)
    if (hits > 0) found.set(file.path, hits)
  }
  return {
    outside: [...found.keys()].filter((path) => !(path in ALLOWED)),
    drifted: Object.entries(ALLOWED)
      .filter(([path, { count }]) => (found.get(path) ?? 0) !== count)
      .map(([path, { count }]) => `${path}: متوقَّع ${count} وُجد ${found.get(path) ?? 0}`),
    found,
  }
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return walk(full)
    return /\.(ts|tsx|js|mjs)$/u.test(name) && !/\.test\./u.test(name) ? [full] : []
  })
}

function readSrc(): SourceFile[] {
  return walk(SRC).map((full) => ({
    path: relative(SRC, full).split('\\').join('/'),
    source: readFileSync(full, 'utf8'),
  }))
}

describe('عزل المتصفّح في src/shared/platform/', () => {
  const real = judge(readSrc())

  it('المجلّد موجود وفيه ثابت الهدف — فالإعفاء ليس فارغًا', () => {
    expect(existsSync(join(SRC, 'shared/platform/target.ts'))).toBe(true)
    expect(existsSync(join(SRC, 'shared/platform/README.md'))).toBe(true)
  })

  it('لا TARGET ولا اسم متصفّح خارج المجلّد وقائمته', () => {
    expect(real.outside, 'معرفةٌ بالمتصفّح خارج src/shared/platform/ — Architecture §4.1').toEqual(
      [],
    )
  })

  it('ولا عدّ منحرف في ملفٍّ مسموح، ولا بندٌ ميّت', () => {
    expect(real.drifted).toEqual([])
  })
})

describe('الحارس يسقط على ما يجب أن يسقط عليه — ملفّاتٌ مصنوعة', () => {
  const file = (path: string, source: string): SourceFile => ({ path, source })
  const outsideOf = (...files: SourceFile[]) => judge(files).outside

  it('الثابت `TARGET` في وحدة عادية', () => {
    expect(
      outsideOf(
        file(
          'modules/x/leak.ts',
          "import { TARGET } from '@/shared/platform/target'\nif (TARGET === 'x') run()",
        ),
      ),
    ).toEqual(['modules/x/leak.ts'])
  })

  it('قراءة المتغيّر مباشرةً تتجاوز الثابت فتُمنع كذلك', () => {
    expect(
      outsideOf(file('ui/y.tsx', 'const t = import.meta.env.VITE_RASD_TARGET ?? "chromium"')),
    ).toEqual(['ui/y.tsx'])
  })

  it.each([
    ['firefox', "const b = 'firefox'"],
    ['Firefox', 'const f = /Firefox\\//u'],
    ['opera', 'const o = ua.includes("opera")'],
    ['Brave', 'if (navigator.brave) hide()'],
    ['vivaldi', "const v = { name: 'vivaldi' }"],
    ['edge', "const e = 'edge'"],
    ['chromium', "const c = 'chromium'"],
  ])('اسم المتصفّح %s في الشيفرة', (_name, source) => {
    expect(outsideOf(file('pages/z.ts', source))).toEqual(['pages/z.ts'])
  })

  it('المجلّد نفسه معفًى: يعرف الهدف والأسماء', () => {
    expect(
      outsideOf(
        file('shared/platform/target.ts', "export const TARGET = 'firefox' // Opera Brave Vivaldi"),
        file('shared/platform/identity.ts', "const names = ['edge', 'chromium']"),
      ),
    ).toEqual([])
  })

  it('لكن `shared/platform.ts` بجواره (نظام التشغيل) ليس المجلّد فلا يُعفى', () => {
    expect(outsideOf(file('shared/platform.ts', 'const x = TARGET'))).toEqual([
      'shared/platform.ts',
    ])
  })

  it('التعليق وحده لا يسقط: الشرح مشروع', () => {
    expect(
      outsideOf(
        file('modules/c.ts', '// نبني لـFirefox وOpera وBrave\n/** TARGET و edge */\nconst a = 1'),
      ),
    ).toEqual([])
  })

  it('ولا ما يشبه الاسم أو الثابت: كلمةٌ كاملة وحساسية حالة للثابت', () => {
    expect(
      outsideOf(
        file(
          'modules/near.ts',
          [
            'const target = pick()', // المتغيّر لا الثابت
            'scroll(target.top)',
            'const operator = 1', // opera داخل كلمة
            'const bravery = 2',
            'const edgeless = 3',
            'const knowledgeEdge2 = 4', // لاصق بحرفٍ ورقم: ليست كلمةً كاملة
            'const SUBTARGET = 5', // TARGET داخل كلمة
          ].join('\n'),
        ),
      ),
    ).toEqual([])
  })

  it('انحراف العدّ: نداءٌ زائد في ملفٍّ مسموح يسقط، وبندٌ بلا مطابق يسقط', () => {
    const verdict = judge([
      // مسموح بـ4 فوجد 1
      { path: 'shared/restricted.ts', source: "const a = 'edge:'" },
    ])
    expect(verdict.drifted).toContain('shared/restricted.ts: متوقَّع 4 وُجد 1')
    // والبنود الأخرى لم تُقدَّم ملفّاتها فهي «وُجد 0» — بندٌ ميّت يُرى
    expect(verdict.drifted).toContain('pages/editor/page-meta.ts: متوقَّع 3 وُجد 0')
  })
})
