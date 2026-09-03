import { describe, expect, it } from 'vitest'

import { DEFAULT_DIFF_OPTIONS } from '@/modules/compare/diff'
import { hexToRgb, resolveDiffColors } from '@/pages/compare/diff-colors'

describe('hexToRgb', () => {
  it('يحوِّل #rrggbb', () => {
    expect(hexToRgb('#00ea6e')).toEqual([0x00, 0xea, 0x6e])
  })

  it('يحوِّل #rgb المختصر بمضاعفة كل رقم', () => {
    expect(hexToRgb('#0f0')).toEqual([0, 255, 0])
  })

  it('يتجاهل ألفا في #rrggbbaa', () => {
    expect(hexToRgb('#ffaba12e')).toEqual([0xff, 0xab, 0xa1])
  })

  it('يقبل بلا # بادئة، ويزيل المسافات المحيطة', () => {
    expect(hexToRgb(' e30018 ')).toEqual([0xe3, 0x00, 0x18])
  })

  it('يُرجع null لقيمة غير سداسية', () => {
    expect(hexToRgb('')).toBeNull()
    expect(hexToRgb('not-a-color')).toBeNull()
    expect(hexToRgb('rgb(0,0,0)')).toBeNull()
  })
})

describe('resolveDiffColors', () => {
  it('يقرأ اللونين عبر قارئ المتغيّر المُحقَن', () => {
    const getVar = (name: string): string =>
      name === '--rasd-tool-diff-added'
        ? '#00ea6e'
        : name === '--rasd-tool-diff-removed'
          ? '#ffaba1'
          : ''

    expect(resolveDiffColors(getVar)).toEqual({
      added: [0x00, 0xea, 0x6e],
      removed: [0xff, 0xab, 0xa1],
    })
  })

  it('يسقط إلى الافتراضي المحايد حين يتعذّر تحليل التوكن', () => {
    expect(resolveDiffColors(() => '')).toEqual({
      added: DEFAULT_DIFF_OPTIONS.addedColor,
      removed: DEFAULT_DIFF_OPTIONS.removedColor,
    })
  })
})
