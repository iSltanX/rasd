// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { OPTIONAL_PERMISSIONS, REQUIRED_PERMISSIONS } from '@/shared/permission-policy'

import {
  judgePermissionConsumers,
  PERMISSION_CONSUMERS,
  // @ts-expect-error — سكربت أدوات بلا تعريفات أنواع؛ يُستورَد لدوالّه الخالصة.
} from '../../../scripts/permission-consumers.mjs'

/**
 * حكم `verify:dist` على «لا صلاحية في البيان بلا مستهلك» — ADR 0055، `STAGES/23` المهمّة الثالثة.
 *
 * **موجبةٌ تمرّ وسالبةٌ لكل صنفٍ مرفوض:** بيان السياسة على حزمةٍ تحمل نداءات واجهاتها يمرّ؛ وصلاحيةٌ بلا بصمة،
 * وصلاحيةٌ ببصمةٍ لا تظهر في الحزمة، وبصمةٌ لصلاحيةٍ غير معلَنة، وحزمةٌ بلا ملفّات — كلٌّ يسقط باسمه.
 */

interface Source {
  file: string
  text: string
}
interface Verdict {
  problems: string[]
  matched: { permission: string; file: string }[]
}
type Table = Record<string, { pattern: RegExp; consumer: string }>

const judge = (
  manifest: { permissions?: readonly string[]; optional_permissions?: readonly string[] },
  sources: Source[],
  table?: Table,
): Verdict => judgePermissionConsumers(manifest, sources, table) as Verdict

const POLICY = {
  permissions: [...REQUIRED_PERMISSIONS],
  optional_permissions: [...OPTIONAL_PERMISSIONS],
}

/** حزمة مصغَّرة تمثيلية: نداء كل واجهة كما يتركه التصغير — أسماء الخصائص سليمة والمتغيّرات حرفٌ واحد. */
const BUNDLE: Source[] = [
  {
    file: 'assets/index.ts-x.js',
    text: [
      'await chrome.tabs.captureVisibleTab(e.windowId,{format:"png"})',
      'chrome.scripting.executeScript({target:{tabId:t},files:[n]})',
      'chrome.contextMenus.create({id:"rasd",title:a})',
      'chrome.alarms.create(o,{periodInMinutes:1})',
      'chrome.downloads.download({url:u,filename:f})',
    ].join(';'),
  },
  { file: 'assets/settings-y.js', text: 'const s=await chrome.storage.local.get(k)' },
  { file: 'assets/db-z.js', text: 'const r=indexedDB.open(e,n)' },
]

describe('الحزمة المبنيّة من السياسة الحالية', () => {
  it('تمرّ، ولكل صلاحية معلَنة ملفٌّ يحمل نداءها', () => {
    const verdict = judge(POLICY, BUNDLE)
    expect(verdict.problems).toEqual([])
    expect(verdict.matched.map((m) => m.permission).sort()).toEqual(
      [...REQUIRED_PERMISSIONS, ...OPTIONAL_PERMISSIONS].sort(),
    )
  })

  it('الجدول يغطّي السياسة حرفًا — لا بصمة ناقصة ولا زائدة', () => {
    expect(Object.keys(PERMISSION_CONSUMERS as Table).sort()).toEqual(
      [...REQUIRED_PERMISSIONS, ...OPTIONAL_PERMISSIONS].sort(),
    )
  })
})

describe('السوالب — كلٌّ يسقط باسم صلاحيته', () => {
  it('صلاحيةٌ تُضاف بلا بصمة تسقط — `tabs` المُسقطة إن عادت', () => {
    const verdict = judge(
      { ...POLICY, optional_permissions: [...OPTIONAL_PERMISSIONS, 'tabs'] },
      BUNDLE,
    )
    expect(verdict.problems).toHaveLength(1)
    expect(verdict.problems[0]).toContain('tabs بلا بصمة مستهلك')
  })

  it('صلاحيةٌ دائمة تُضاف بلا بصمة تسقط — `offscreen` المُسقطة إن عادت', () => {
    const verdict = judge(
      { ...POLICY, permissions: [...REQUIRED_PERMISSIONS, 'offscreen'] },
      BUNDLE,
    )
    expect(verdict.problems.join('\n')).toContain('offscreen بلا بصمة مستهلك')
  })

  it('صلاحيةٌ ببصمةٍ لا تظهر في الحزمة تسقط — مستهلكٌ حُذف وبقيت صلاحيته', () => {
    const withoutAlarms = BUNDLE.map((s) => ({
      ...s,
      text: s.text.replace('chrome.alarms.create(o,{periodInMinutes:1})', ''),
    }))
    const verdict = judge(POLICY, withoutAlarms)
    expect(verdict.problems).toHaveLength(1)
    expect(verdict.problems[0]).toMatch(/^alarms معلَنة ولا مستهلك لها في الحزمة/)
  })

  it('نصّ المبرّر في الحزمة لا يُرضي البصمة — النداء وحده يُرضيها', () => {
    const onlyProse = [
      { file: 'assets/permission-policy-p.js', text: 'alarms:"حارسٌ ينهي المهام"' },
    ]
    const verdict = judge({ permissions: ['alarms'] }, onlyProse, {
      alarms: (PERMISSION_CONSUMERS as Table).alarms!,
    })
    expect(verdict.problems).toHaveLength(1)
    expect(verdict.problems[0]).toContain('alarms معلَنة ولا مستهلك لها')
  })

  it('بصمةٌ لصلاحيةٍ غير معلَنة تسقط — جدولٌ متقادم', () => {
    const verdict = judge(
      { ...POLICY, optional_permissions: [] },
      BUNDLE.map((s) => ({ ...s })),
    )
    expect(verdict.problems).toEqual([
      'بصمة downloads في الجدول والصلاحية غير معلَنة — جدولٌ متقادم',
    ])
  })

  it('حزمةٌ بلا ملفّات JavaScript تسقط ولا تمرّ فارغة', () => {
    expect(judge(POLICY, []).problems).toEqual([
      'لا ملفّ JavaScript في الحزمة — تعذّر البحث عن المستهلكين',
    ])
  })

  it('اسمٌ موروث من النموذج الأوّلي للكائن لا يُعدّ بصمة', () => {
    const verdict = judge({ permissions: ['constructor'] }, BUNDLE, {})
    expect(verdict.problems[0]).toContain('constructor بلا بصمة مستهلك')
  })
})
