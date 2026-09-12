import { describe, expect, it } from 'vitest'

import { exportFilename, filenameStem } from '@/modules/export/filename'

describe('اسم الملفّ المصدَّر', () => {
  it('الشكل من إطار Figma `129:1533`: الاسم ثمّ اللاحقة ثمّ الامتداد', () => {
    expect(exportFilename('hero desktop', 2, 'png')).toBe('hero-desktop@2x.png')
    expect(exportFilename('hero desktop', 1, 'png')).toBe('hero-desktop.png')
    expect(exportFilename('hero desktop', 2, 'webp')).toBe('hero-desktop@2x.webp')
  })

  it('**العربية تبقى عربية** — لا تحويل إلى اللاتينية', () => {
    expect(exportFilename('الواجهة سطح المكتب', 2, 'png')).toBe('الواجهة-سطح-المكتب@2x.png')
  })

  describe('ما يُحذف هو ما يكسر المسار وحده', () => {
    it('فواصل المسار والمحارف المحجوزة في Windows', () => {
      expect(filenameStem('a/b\\c:d*e?f"g<h>i|j')).toBe('a-b-c-d-e-f-g-h-i-j')
    })

    it('ومحارف التحكّم — بلا مدًى حرفي في التعبير', () => {
      expect(filenameStem(`سطر${String.fromCharCode(10)}ثانٍ`)).toBe('سطر-ثانٍ')
      expect(filenameStem(`نص${String.fromCharCode(0)}صفري`)).toBe('نص-صفري')
    })

    it('والمسافات بأنواعها تصير شرطةً واحدة لا شرطتين', () => {
      expect(filenameStem('كلمة    أخرى')).toBe('كلمة-أخرى')
      expect(filenameStem(`كلمة${String.fromCharCode(0x00a0)}لاصقة`)).toBe('كلمة-لاصقة')
    })
  })

  /**
   * **النقطة البادئة تُزال بعد التنظيف لا قبله.**
   *
   * عنوانٌ يبدأ بمحرفٍ محذوف كان يُخلّف نقطةً في الأوّل فيصير الملفّ مخفيًّا
   * على أنظمة يونكس — وهو عطلٌ لا يراه المستخدم إلّا حين يبحث عن ملفّه.
   */
  it('لا نقطة بادئة ولا شرطة طرفية مهما كان المدخل', () => {
    expect(filenameStem(': ملاحظاتي')).toBe('ملاحظاتي')
    expect(filenameStem('...خفيّ...')).toBe('خفيّ')
    expect(filenameStem('  ---  اسم  ---  ')).toBe('اسم')
  })

  it('والقصّ الطولي لا يترك شرطةً في آخره', () => {
    const long = `${'ا'.repeat(99)} ذيل`
    const stem = filenameStem(long)
    expect(stem.length).toBeLessThanOrEqual(100)
    expect(stem.endsWith('-')).toBe(false)
  })

  it('**واسمٌ احتياطي حين لا يبقى شيء صالح** — لا ملفّ بلا اسم', () => {
    expect(filenameStem('')).toBe('لقطة')
    expect(filenameStem('///')).toBe('لقطة')
    expect(exportFilename('   ', 1, 'webp')).toBe('لقطة.webp')
  })
})
