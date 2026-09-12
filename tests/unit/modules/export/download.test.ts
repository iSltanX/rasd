import { describe, expect, it } from 'vitest'

import { afterAsk, DEGRADE_NOTE, planDownload } from '@/modules/export/download'

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
