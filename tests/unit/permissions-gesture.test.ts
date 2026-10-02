// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import {
  createSourceFile,
  isArrowFunction,
  isAwaitExpression,
  isCallExpression,
  isFunctionDeclaration,
  isFunctionExpression,
  isConditionalExpression,
  isIdentifier,
  isIfStatement,
  isMethodDeclaration,
  isPropertyAccessExpression,
  ScriptKind,
  ScriptTarget,
  forEachChild,
  type CallExpression,
  type Node,
} from 'typescript'
import { describe, expect, it } from 'vitest'

/**
 * **كل طلب إذن يُنادى متزامنًا داخل معالج النقرة — لا `await` يسبقه** (`Docs/Browsers/Architecture.md` §4.5).
 *
 * Firefox يُسقط صفة الإيماءة بعد أي `await`، فيرفض `permissions.request` أو يرمي. والفخّ لا يظهر في Chrome ولا في
 * اختبار الوحدة (لا إيماءة هناك)، فيُمسح من الشيفرة: لكل نداءٍ إلى `requestHostPermission` أو `requestPermission`
 * أو `requestWithConsent` — أو إلى المغلِّفين اللذين يطلبانها (`resolveRoute` و`chooseRoute`) — يُنظر في أقرب دالّةٍ
 * تحويه:
 *
 * 1. لا `await` قبله فيها (بموضعه في النصّ، ودون الدوالّ المتداخلة).
 * 2. وليست هي نفسها ردًّا لـ`.then` أو `.catch` أو `.finally` ولا لمؤقّتٍ أو `useEffect` — فذلك سلسلةٌ سبقتها
 *    مهلةٌ غير متزامنة، لا معالج.
 *
 * والمسح **سلكُ إنذار لا حدّ**: لا يرى نداءً عبر متغيّرٍ (`const f = requestPermission; f()`). والحدّ الحقيقي أن
 * المواضع كلّها معدودة هنا بأسمائها؛ موضعٌ جديد يُسقط العدّ فيُراجَع بيد قبل أن يُضاف.
 */

const SRC = fileURLToPath(new URL('../../src', import.meta.url))

/** أسماء ما يطلب إذنًا. الملفّ الذي يعرّفها (`shared/permissions.ts`) مستثنى. */
const REQUESTERS = new Set([
  'requestHostPermission',
  'requestPermission',
  'requestWithConsent',
  'resolveRoute',
  'chooseRoute',
])

/** دوالّ تؤجّل رديّها خارج النقرة: ما بداخلها ليس معالجًا. */
const DEFERRING_CALLEES = new Set([
  'useEffect',
  'useLayoutEffect',
  'setTimeout',
  'setInterval',
  'queueMicrotask',
  'requestAnimationFrame',
])
const DEFERRING_METHODS = new Set(['then', 'catch', 'finally'])

type FunctionLike = Node & { body?: Node }

const isFunctionLike = (node: Node): node is FunctionLike =>
  isArrowFunction(node) ||
  isFunctionExpression(node) ||
  isFunctionDeclaration(node) ||
  isMethodDeclaration(node)

function enclosingFunction(node: Node): FunctionLike | null {
  for (let current = node.parent; current; current = current.parent) {
    if (isFunctionLike(current)) return current
  }
  return null
}

/** أسلاف عقدةٍ من أدناها إلى أعلاها. */
function ancestors(node: Node): Node[] {
  const out: Node[] = []
  for (let current = node.parent; current; current = current.parent) out.push(current)
  return out
}

/** هل العقدتان في فرعين متنافيين لـ`if` أو `?:` واحد؟ — فلا يسبق أحدهما الآخر في أي تنفيذ. */
function exclusiveBranches(a: Node, b: Node): boolean {
  const aChain = [a, ...ancestors(a)]
  const bChain = [b, ...ancestors(b)]
  const common = aChain.find((n) => bChain.includes(n))
  if (!common) return false
  const branchOf = (chain: Node[]): Node | undefined => chain[chain.indexOf(common) - 1]
  const [x, y] = [branchOf(aChain), branchOf(bChain)]
  if (!x || !y || x === y) return false
  if (isIfStatement(common)) {
    return (
      [x, y].includes(common.thenStatement) &&
      common.elseStatement !== undefined &&
      [x, y].includes(common.elseStatement)
    )
  }
  if (isConditionalExpression(common)) {
    return [x, y].includes(common.whenTrue) && [x, y].includes(common.whenFalse)
  }
  return false
}

/**
 * `await`ات الدالّة نفسها التي **تسبق** النداء على مسارٍ ممكن: دون الدوالّ المتداخلة، ودون `await` يلفّ النداء نفسه
 * (`await requestPermission(..)` يبدأ قبله في النصّ ولا يسبقه في التنفيذ)، ودون ما في الفرع المقابل من `if`.
 */
function awaitsBefore(fn: FunctionLike, call: Node): Node[] {
  const found: Node[] = []
  const callAncestors = new Set(ancestors(call))
  const visit = (node: Node): void => {
    if (isFunctionLike(node) && node !== fn) return
    if (
      isAwaitExpression(node) &&
      node.getStart() < call.getStart() &&
      !callAncestors.has(node) &&
      !exclusiveBranches(node, call)
    ) {
      found.push(node)
    }
    forEachChild(node, visit)
  }
  if (fn.body) visit(fn.body)
  return found
}

function calleeName(call: CallExpression): string | null {
  return isIdentifier(call.expression) ? call.expression.text : null
}

/** هل الدالّة ردٌّ لنداءٍ مؤجِّل (`.then(fn)` أو `useEffect(fn)`…)؟ */
function isDeferredCallback(fn: FunctionLike): boolean {
  const parent = fn.parent
  if (!parent || !isCallExpression(parent)) return false
  if (!parent.arguments.includes(fn as never)) return false
  const callee = parent.expression
  if (isIdentifier(callee)) return DEFERRING_CALLEES.has(callee.text)
  return isPropertyAccessExpression(callee) && DEFERRING_METHODS.has(callee.name.text)
}

interface Scan {
  readonly sites: number
  readonly violations: string[]
}

/** يمسح ملفًّا واحدًا — يغذّيه المسح الحقيقي والملفّات المصنوعة، فالسالب يمرّ من الشيفرة نفسها. */
function scan(path: string, source: string): Scan {
  const file = createSourceFile(path, source, ScriptTarget.Latest, true, ScriptKind.TSX)
  let sites = 0
  const violations: string[] = []
  const visit = (node: Node): void => {
    if (isCallExpression(node)) {
      const name = calleeName(node)
      if (name !== null && REQUESTERS.has(name)) {
        sites += 1
        const fn = enclosingFunction(node)
        const line = file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1
        const where = `${path}:${line} ${name}`
        if (!fn) {
          violations.push(`${where}: خارج أي دالّة`)
        } else {
          if (isDeferredCallback(fn))
            violations.push(`${where}: داخل ردٍّ مؤجَّل (then/useEffect/مؤقّت)`)
          const before = awaitsBefore(fn, node)
          if (before.length > 0)
            violations.push(`${where}: ${before.length} await قبله في الدالّة نفسها`)
        }
      }
    }
    forEachChild(node, visit)
  }
  visit(file)
  return { sites, violations }
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return walk(full)
    return /\.(ts|tsx)$/u.test(name) && !/\.test\./u.test(name) ? [full] : []
  })
}

/** ملفّات تعرّف الطالبين أو تغلّفهم بلا إيماءة بنفسها — لا يُمسح داخلها. */
const DEFINITIONS = new Set(['shared/permissions.ts'])

function realScan(): Map<string, Scan> {
  const out = new Map<string, Scan>()
  for (const full of walk(SRC)) {
    const path = relative(SRC, full).split('\\').join('/')
    if (DEFINITIONS.has(path)) continue
    const result = scan(path, readFileSync(full, 'utf8'))
    if (result.sites > 0) out.set(path, result)
  }
  return out
}

/**
 * المواضع كلّها **بأسمائها وعدّها** — موضعٌ جديد يُسقط هذا الجدول فيُراجَع أنه لا يسبقه `await`، وموضعٌ زال يُسقطه
 * أيضًا فلا يبقى بندٌ ميّت. (تُحصى مواضع النداء لا الملفّات.)
 */
const SITES: Record<string, number> = {
  'pages/compare/parts/ReportDialog.tsx': 1,
  'pages/export/ExportFlow.tsx': 1,
  'pages/export/GuideExportDialog.tsx': 1,
  'pages/export/route.ts': 1,
  'pages/handoff/HandoffDialog.tsx': 1,
  'pages/integrations/ConnectDialog.tsx': 1,
  'pages/integrations/ConnectionsPanel.tsx': 1,
  'pages/popup/Popup.tsx': 1,
  'pages/settings/download-route.ts': 1,
  'pages/settings/parts/CaptureTab.tsx': 1,
  'pages/settings/parts/DataSection.tsx': 1,
  'pages/settings/parts/PermissionsPanel.tsx': 3,
  'pages/settings/parts/lock/LockRow.tsx': 1,
  'pages/settings/parts/report/ReportDialog.tsx': 1,
  'pages/share/CaptureShare.tsx': 2,
  'pages/share/GuideShare.tsx': 2,
}

describe('طلب الإذن متزامنٌ داخل معالج النقرة', () => {
  const real = realScan()

  it('لا موضعَ يسبقه await ولا يقع في ردٍّ مؤجَّل', () => {
    const all = [...real.values()].flatMap((r) => r.violations)
    expect(all).toEqual([])
  })

  it('المواضع المعدودة تطابق الشيفرة — لا موضعَ جديدًا بلا مراجعة ولا بندًا ميّتًا', () => {
    const found = Object.fromEntries([...real].map(([path, r]) => [path, r.sites]))
    expect(found).toEqual(SITES)
  })

  it('البلاغ: النداء يمرّ من `deps.requestHost` لا باسمٍ من القائمة، فيُمسح لهذا بذاته — أوّل ما يقع في «أرسل» — لا await قبله في confirm', () => {
    const path = 'pages/settings/parts/report/ReportDialog.tsx'
    const source = readFileSync(join(SRC, path), 'utf8')
    const file = createSourceFile(path, source, ScriptTarget.Latest, true, ScriptKind.TSX)
    let checked = 0
    const visit = (node: Node): void => {
      if (
        isCallExpression(node) &&
        isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'requestHost'
      ) {
        checked += 1
        const fn = enclosingFunction(node)
        expect(fn).not.toBeNull()
        expect(isDeferredCallback(fn!)).toBe(false)
        expect(awaitsBefore(fn!, node)).toEqual([])
      }
      forEachChild(node, visit)
    }
    visit(file)
    expect(checked).toBe(1)
  })

  describe('السالب — ملفّاتٌ مصنوعة تمرّ من المسح نفسه', () => {
    it('await قبل الطلب في المعالج ⇒ يُلتقط', () => {
      const bad = `
        export function Dialog() {
          const onClick = async () => {
            const settings = await readSettings()
            void requestHostPermission(['https://x/*'])
          }
          return <button onClick={onClick} />
        }`
      const out = scan('fake/bad.tsx', bad)
      expect(out.sites).toBe(1)
      expect(out.violations).toHaveLength(1)
      expect(out.violations[0]).toContain('await قبله')
    })

    it('الطلب داخل then ⇒ يُلتقط', () => {
      const bad = `
        const onClick = () => {
          void prepare().then(() => requestWithConsent({ origins: [] }))
        }`
      const out = scan('fake/then.ts', bad)
      expect(out.violations).toHaveLength(1)
      expect(out.violations[0]).toContain('ردٍّ مؤجَّل')
    })

    it('الطلب داخل useEffect ⇒ يُلتقط', () => {
      const bad = `
        useEffect(() => {
          void requestPermission(['downloads'])
        }, [])`
      expect(scan('fake/effect.tsx', bad).violations).toHaveLength(1)
    })

    it('المغلِّف resolveRoute بعد await ⇒ يُلتقط', () => {
      const bad = `
        const run = async () => {
          await ready
          void resolveRoute(permission)
        }`
      expect(scan('fake/wrapper.ts', bad).violations).toHaveLength(1)
    })

    it('الموجب: الطلب أوّلًا ثمّ await بعده ⇒ يمرّ', () => {
      const good = `
        const onClick = async () => {
          const pending = requestWithConsent({ origins: [] })
          const outcome = await pending
          await save(outcome)
        }
        const onOther = () => {
          void requestHostPermission(['https://x/*']).then(async (o) => { await save(o) })
        }`
      const out = scan('fake/good.tsx', good)
      expect(out.sites).toBe(2)
      expect(out.violations).toEqual([])
    })

    it('await في الفرع المقابل من if لا يُحسب — ولكن await قبل if يُحسب', () => {
      const branch = `
        const toggle = async () => {
          if (granted) await revokePermission(['downloads'])
          else await requestPermission(['downloads'])
        }`
      expect(scan('fake/branch.ts', branch).violations).toEqual([])
      const before = `
        const toggle = async () => {
          await ready
          if (granted) await revokePermission(['downloads'])
          else await requestPermission(['downloads'])
        }`
      expect(scan('fake/branch2.ts', before).violations).toHaveLength(1)
    })

    it('await في دالّةٍ متداخلة لا يُحسب على المعالج', () => {
      const good = `
        const onClick = () => {
          const later = async () => { await save() }
          void requestPermission(['downloads']).then(later)
        }`
      expect(scan('fake/nested.ts', good).violations).toEqual([])
    })
  })
})
