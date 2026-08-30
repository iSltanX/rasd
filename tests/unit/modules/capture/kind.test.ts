import { describe, expect, it } from 'vitest'

import { captureKindFor } from '@/modules/capture/kind'
import { viewportRect } from '@/shared/geometry'

/**
 * نوع اللقطة — العطل الذي أوجب هذا الملفّ.
 *
 * التقاط العنصر كان يُسجَّل `'area'` لأن النوع كان يُشتقّ من وجود مستطيل وحده،
 * والأداتان كلتاهما تُسلّم مستطيلًا. لا اختبار كان يمرّ على هذا المسار، والعطل
 * لا يظهر عند وقوعه: يظهر في المرحلة 18 حين تكذب تصفية المكتبة بالنوع على
 * بيانات متراكمة لا تُصلَح إلا بترحيل.
 */

const RECT = viewportRect(10, 20, 300, 200)

describe('نوع اللقطة من المصدر', () => {
  it('العنصر مع مستطيل يُسجَّل element لا area', () => {
    expect(captureKindFor('element', RECT)).toBe('element')
  })

  it('المنطقة مع مستطيل تُسجَّل area', () => {
    expect(captureKindFor('area', RECT)).toBe('area')
  })

  it('المصدران يعطيان نوعين مختلفين لنفس المستطيل', () => {
    expect(captureKindFor('element', RECT)).not.toBe(captureKindFor('area', RECT))
  })

  it('لا مستطيل يعني الجزء الظاهر — أيًّا كان المصدر', () => {
    expect(captureKindFor('area', null)).toBe('viewport')
    expect(captureKindFor('element', null)).toBe('viewport')
  })

  it('كل نوع ناتج عضوٌ في CaptureKind المعرَّف في المخطّط', () => {
    // الأنواع الخمسة في `schema.ts`؛ ثلاثة منها فقط تُنتَج من هذا المسار.
    const produced = [
      captureKindFor('area', RECT),
      captureKindFor('element', RECT),
      captureKindFor('area', null),
    ]
    expect(new Set(produced)).toEqual(new Set(['area', 'element', 'viewport']))
  })
})
