import { describe, expect, it } from 'vitest'

import { buildGroups, tidyPx } from '@/content/inspect-view'

import type { InspectDetail } from '@/content/tools/inspect'

/** `inspect / element-selected` (`62:2`): قيمٌ مقروءة وتسميات لا تتكرّر. */
describe('inspect-view — صفوف اللوحة', () => {
  it('البكسلات بمرتبتين عشريّتين على الأكثر، والأعداد الصحيحة كما هي', () => {
    expect(tidyPx('254.672px')).toBe('254.67px')
    expect(tidyPx('123.578px')).toBe('123.58px')
    expect(tidyPx('8px')).toBe('8px')
    expect(tidyPx('0.5px')).toBe('0.5px')
    expect(tidyPx('0 1.3333px 2.0001px rgb(0 0 0 / 0.25)')).toBe('0 1.33px 2px rgb(0 0 0 / 0.25)')
  })

  it('`display` و`width` بتسميتين مختلفتين، والقيمة الكسرية مرتّبة في الصفّ', () => {
    const detail = {
      snapshot: {
        styles: {
          display: { value: 'block' },
          width: { value: '254.672px' },
          height: { value: '123.578px' },
        },
      },
      rules: new Map(),
      vars: new Map(),
    } as unknown as InspectDetail
    const rows = buildGroups(detail).styles.flatMap((g) => g.rows)
    const labels = rows.map((r) => r.label)
    expect(new Set(labels).size).toBe(labels.length)
    expect(rows.find((r) => r.value === 'block')?.label).toBe('طريقة العرض')
    expect(rows.find((r) => r.label === 'العرض')?.value).toBe('254.67px')
  })
})
