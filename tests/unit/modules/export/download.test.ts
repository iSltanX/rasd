import { describe, expect, it } from 'vitest'

import {
  afterAsk,
  DEGRADE_NOTE,
  mirrorFilename,
  planDownload,
  planMirror,
} from '@/modules/export/download'

describe('مسار التنزيل', () => {
  it('الممنوحة تمضي بلا سؤال وبلا ملاحظة', () => {
    expect(planDownload('granted')).toEqual({ route: 'managed', ask: false, note: null })
  })

  it('**والمجهولة تُسأل مرّةً واحدة**', () => {
    const decision = planDownload('unknown')
    expect(decision.ask).toBe(true)
    // وحتى تُجاب، الطريق الآمن هو المرساة — لا انتظار ولا فشل.
    expect(decision.route).toBe('anchor')
  })

  /**
   * **هذا هو بند «لا يُعاد السؤال في الجلسة نفسها» مُثبَتًا.**
   *
   * وبلاه تصير البطاقة تظهر عند كل نقرة تنزيل، فيتحوّل اختيار المستخدم إلى
   * مضايقة — وهو ما يمنعه نصّ الوحدة صراحةً.
   */
  it('والمرفوضة لا تُسأل ثانيةً، وتُعلن ما فُقد', () => {
    const decision = planDownload('denied')
    expect(decision.ask).toBe(false)
    expect(decision.route).toBe('anchor')
    expect(decision.note).toBe(DEGRADE_NOTE)
  })

  it('**والملاحظة تسمّي المفقود بعينه** لا «تعذّر»', () => {
    expect(DEGRADE_NOTE).toContain('مجلّد التنزيلات')
    expect(DEGRADE_NOTE).toContain('افتح المجلّد')
  })

  describe('بعد جواب المستخدم', () => {
    it('المنح يفتح الطريق المُدار ويُحفَظ', () => {
      expect(afterAsk('granted')).toEqual({
        decision: { route: 'managed', ask: false, note: null },
        remember: 'granted',
      })
    })

    it('الرفض يتدهور ويُحفَظ للجلسة', () => {
      const after = afterAsk('denied')
      expect(after.decision.route).toBe('anchor')
      expect(after.decision.note).toBe(DEGRADE_NOTE)
      expect(after.remember).toBe('denied')
    })

    /**
     * **العطل التقني ليس قرارًا من المستخدم.**
     *
     * يتدهور مثلَ الرفض كي لا يتعطّل التصدير، **ولا يُحفَظ** كي يُسأل مرّةً
     * أخرى لاحقًا. وخلطُ الاثنين كان يُسكِت البطاقة للأبد على عطلٍ عابر.
     */
    it('والعطل يتدهور ولا يُحفَظ', () => {
      const after = afterAsk('error')
      expect(after.decision.route).toBe('anchor')
      expect(after.remember).toBeNull()
    })
  })
})

describe('نسخة التنزيلات — planMirror', () => {
  /**
   * الجدول كلّه: الوجهة × الصلاحية. صفٌّ واحد فقط يُنزِّل، وصفٌّ واحد يُعلن فقدان
   * الصلاحية — وما عداهما صامتٌ عمدًا لأن «المكتبة وحدها» اختيار لا عطل.
   */
  it('المكتبة وحدها ⟵ off أيًّا كانت الصلاحية', () => {
    expect(planMirror('library', true)).toBe('off')
    expect(planMirror('library', false)).toBe('off')
  })

  it('المكتبة والتنزيلات مع الصلاحية ⟵ download', () => {
    expect(planMirror('library-and-downloads', true)).toBe('download')
  })

  it('**والمكتبة والتنزيلات بلا صلاحية ⟵ no-permission** لا download ولا فشل', () => {
    expect(planMirror('library-and-downloads', false)).toBe('no-permission')
  })
})

describe('نسخة التنزيلات — mirrorFilename', () => {
  /** بتوقيت الجهاز المحلّي لا UTC: المستخدم يقرأ الاسم بساعته. */
  const at = new Date(2026, 8, 30, 14, 5, 9).getTime()

  it('مجلّد «رصد» ثمّ العنوان العربي كما هو ثمّ ختم محلّي وامتداد الصيغة', () => {
    expect(mirrorFilename('لوحة التحكّم', at, 'png')).toBe('رصد/لوحة-التحكّم-20260930-140509.png')
    expect(mirrorFilename('لوحة التحكّم', at, 'webp')).toBe('رصد/لوحة-التحكّم-20260930-140509.webp')
  })

  it('محارف المسار والمحجوزة تُزال فلا يتولّد مجلّد ثانٍ ولا اسم مرفوض', () => {
    const name = mirrorFilename('a/b\\c: d?*', at, 'png')
    // مجلّد واحد بفاصل واحد — `/` في العنوان لا يُنتج مسارًا فرعيًا.
    expect(name.split('/')).toHaveLength(2)
    expect(name).toBe('رصد/a-b-c-d-20260930-140509.png')
    expect(name).not.toMatch(/[\\:*?"<>|]/)
  })

  it('عنوان فارغ يأخذ الاسم الاحتياطي لا اسمًا بلا جذع', () => {
    expect(mirrorFilename('', at, 'png')).toBe('رصد/لقطة-20260930-140509.png')
  })

  it('**اللقطتان لصفحة واحدة في ثانيتين مختلفتين لا تتطابقان** — وإلا دهست الثانية الأولى', () => {
    const a = mirrorFilename('صفحة', at, 'png')
    const b = mirrorFilename('صفحة', at + 1000, 'png')
    expect(a).not.toBe(b)
  })

  it('الأرقام ذات الخانة الواحدة تُحشى بصفر (شهر وثوانٍ)', () => {
    const early = new Date(2026, 0, 2, 3, 4, 5).getTime()
    expect(mirrorFilename('x', early, 'png')).toBe('رصد/x-20260102-030405.png')
  })
})
