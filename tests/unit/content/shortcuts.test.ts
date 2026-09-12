import { describe, expect, it } from 'vitest'

import { BINDINGS, buildBindings } from '@/content/shortcuts'

describe('buildBindings', () => {
  it('بلا وسيط تعيد BINDINGS حرفًا بحرف', () => {
    expect(buildBindings()).toEqual(BINDINGS)
  })

  it('تستبدل حرف أداة واحدة وتُبقي البقيّة (اللوحة · Esc · الأسهم) كما هي', () => {
    const next = buildBindings({ inspect: 'KeyJ' })
    const inspectBinding = next.find((b) => b.action.kind === 'mode' && b.action.mode === 'inspect')
    expect(inspectBinding?.code).toBe('KeyJ')

    const untouched = next.filter((b) => !(b.action.kind === 'mode' && b.action.mode === 'inspect'))
    const original = BINDINGS.filter(
      (b) => !(b.action.kind === 'mode' && b.action.mode === 'inspect'),
    )
    expect(untouched).toEqual(original)
  })

  it('تستبدل الأربعة معًا', () => {
    const next = buildBindings({
      inspect: 'KeyJ',
      measure: 'KeyN',
      colour: 'KeyL',
      compare: 'KeyF',
    })
    const codeFor = (mode: string) =>
      next.find((b) => b.action.kind === 'mode' && b.action.mode === mode)?.code
    expect(codeFor('inspect')).toBe('KeyJ')
    expect(codeFor('measure')).toBe('KeyN')
    expect(codeFor('colour')).toBe('KeyL')
    expect(codeFor('compare')).toBe('KeyF')
  })

  it('لا تمسّ ⌥⇧/`swallow` — الحرف وحده يتغيّر', () => {
    const next = buildBindings({ inspect: 'KeyJ' })
    const inspectBinding = next.find((b) => b.action.kind === 'mode' && b.action.mode === 'inspect')
    expect(inspectBinding?.alt).toBe(true)
    expect(inspectBinding?.shift).toBe(true)
    expect(inspectBinding?.swallow).toBe(true)
  })
})
