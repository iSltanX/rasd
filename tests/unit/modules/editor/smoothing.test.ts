import { describe, expect, it } from 'vitest'

import { MAX_FREEHAND_POINTS } from '@/modules/editor/scene'
import {
  appendSample,
  chaikinPass,
  CHAIKIN_PASSES,
  finalizeStroke,
  MIN_SAMPLE_DIST_PX,
  pointCount,
  RDP_EPSILON_PX,
  simplify,
  smooth,
} from '@/modules/editor/smoothing'

/** يبني مسارًا مسطَّحًا من أزواج. */
const flat = (...pairs: readonly (readonly [number, number])[]): number[] => pairs.flat()

describe('ضمّ العيّنات الحيّة', () => {
  it('يرفض عيّنةً أقرب من الحدّ — **ويُعيد المصفوفة نفسها** فيميّزها المستدعي بالهوية', () => {
    const path = [10, 10]
    const same = appendSample(path, 10 + MIN_SAMPLE_DIST_PX / 2, 10)
    expect(same).toBe(path)
  })

  it('ويقبل عيّنةً أبعد', () => {
    expect(appendSample([10, 10], 20, 20)).toEqual([10, 10, 20, 20])
  })

  it('وأوّل عيّنة تُقبل دائمًا', () => {
    expect(appendSample([], 3, 4)).toEqual([3, 4])
  })
})

describe('تبسيط RDP', () => {
  it('يحذف النقاط المستقيمة كلّها ويُبقي الطرفين', () => {
    const line = flat([0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0])
    expect(simplify(line, RDP_EPSILON_PX)).toEqual([0, 0, 5, 0])
  })

  it('**ويُبقي الزاوية** — التبسيط ليس تسويةً للشكل', () => {
    const corner = flat([0, 0], [5, 0], [10, 0], [10, 5], [10, 10])
    const out = simplify(corner, RDP_EPSILON_PX)
    expect(out).toEqual([0, 0, 10, 0, 10, 10])
  })

  it('ويحذف الانحراف دون العتبة ويُبقي ما فوقها', () => {
    const tiny = flat([0, 0], [5, 0.4], [10, 0])
    const big = flat([0, 0], [5, 4], [10, 0])
    expect(pointCount(simplify(tiny, RDP_EPSILON_PX))).toBe(2)
    expect(pointCount(simplify(big, RDP_EPSILON_PX))).toBe(3)
  })

  it('ولا يمسّ مسارًا من نقطتين', () => {
    expect(simplify([0, 0, 9, 9], RDP_EPSILON_PX)).toEqual([0, 0, 9, 9])
  })

  it('ويحتمل نقاطًا متطابقة — الوتر المنعدم لا يقسم على صفر', () => {
    const dup = flat([0, 0], [0, 0], [0, 0], [10, 10])
    expect(() => simplify(dup, RDP_EPSILON_PX)).not.toThrow()
    expect(pointCount(simplify(dup, RDP_EPSILON_PX))).toBe(2)
  })

  it('**ولا يُفجّر المكدّس على ستّة آلاف عيّنة** — المكدّس صريح لا تعاودي', () => {
    // مسار رتيب: أسوأ حالة RDP، عمقٌ يساوي عدد النقاط لو كانت تعاودية.
    const monotone: number[] = []
    for (let i = 0; i < 6000; i++) monotone.push(i, Math.sqrt(i) * 10)
    expect(() => simplify(monotone, 0.01)).not.toThrow()
    expect(pointCount(simplify(monotone, 0.01))).toBeLessThan(6000)
  })
})

describe('تنعيم شايكن', () => {
  const triangle = flat([0, 0], [10, 0], [10, 10])

  it('يُثبّت طرفَي المسار المفتوح — بداية السهم لا تزحف عمّا أشار إليه', () => {
    const out = chaikinPass(triangle, false)
    expect([out[0], out[1]]).toEqual([0, 0])
    expect([out[out.length - 2], out[out.length - 1]]).toEqual([10, 10])
  })

  it('والعدد `2n−2` للمفتوح و`2n` للمغلق', () => {
    expect(pointCount(chaikinPass(triangle, false))).toBe(2 * 3 - 2)
    expect(pointCount(chaikinPass(triangle, true))).toBe(2 * 3)
  })

  it('**ويقصّ الزاوية فعلًا** — النقطة الوسطى لم تعد على المسار', () => {
    const out = chaikinPass(triangle, false)
    // لا نقطة عند رأس الزاوية (10,0) بعد القصّ.
    for (let i = 0; i < pointCount(out); i++) {
      expect([out[i * 2], out[i * 2 + 1]]).not.toEqual([10, 0])
    }
  })

  it('ولا يمسّ مسارًا من نقطتين', () => {
    expect(chaikinPass([0, 0, 9, 9], false)).toEqual([0, 0, 9, 9])
  })

  it('والجولات تتضاعف', () => {
    expect(pointCount(smooth(triangle, false, 1))).toBe(4)
    expect(pointCount(smooth(triangle, false, 2))).toBe(6)
  })
})

describe('**الإنهاء — السقف يُقاس على الناتج لا المدخل**', () => {
  /**
   * ضربةُ يد واحدة: **شكلٌ ثابت** بكثافة تعيين متغيّرة، مع رعشة صغيرة.
   *
   * زيادة `n` هنا تزيد **العيّنات** لا الهندسة — وهذا بالضبط ما يفعله معدّل
   * تحديث أعلى. ومسارٌ يزيد هندسته مع عيّناته يقيس شيئًا آخر.
   */
  const stroke = (n: number): number[] => {
    const out: number[] = []
    for (let i = 0; i < n; i++) {
      const t = (i / (n - 1)) * Math.PI * 1.5
      const jitter = Math.sin(i * 2.3) * 0.4
      out.push(Math.cos(t) * 300 + jitter, Math.sin(t) * 200 - jitter)
    }
    return out
  }

  it('مسارٌ قصير يمرّ كما هو', () => {
    const r = finalizeStroke([0, 0, 5, 5], false)
    expect(r.points).toEqual([0, 0, 5, 5])
    expect(r.truncated).toBe(false)
  })

  it('**والضربة المعيَّنة بكثافة تخرج تحت السقف — بعد التنعيم**', () => {
    const r = finalizeStroke(stroke(4000), false)
    expect(pointCount(stroke(4000))).toBe(4000)
    expect(pointCount(r.points)).toBeLessThanOrEqual(MAX_FREEHAND_POINTS)
    expect(r.truncated).toBe(false)
  })

  it('ولا تتصاعد العتبة على مسار يفي بالسقف من أوّل مرّة', () => {
    const r = finalizeStroke(stroke(60), false)
    expect(r.epsilon).toBe(RDP_EPSILON_PX)
  })

  it('**والناتج أقلّ نقاطًا وأنعم من المدخل**', () => {
    const raw = stroke(1200)
    const r = finalizeStroke(raw, false)
    const jitter = (p: readonly number[]): number => {
      let sum = 0
      for (let i = 1; i < pointCount(p) - 1; i++) {
        const ax = p[(i - 1) * 2]!,
          ay = p[(i - 1) * 2 + 1]!
        const bx = p[i * 2]!,
          by = p[i * 2 + 1]!
        const cx = p[(i + 1) * 2]!,
          cy = p[(i + 1) * 2 + 1]!
        sum += Math.abs(Math.atan2(cy - by, cx - bx) - Math.atan2(by - ay, bx - ax))
      }
      return sum / Math.max(1, pointCount(p) - 2)
    }
    expect(pointCount(r.points)).toBeLessThan(pointCount(raw))
    // الرعشة المضافة تُبتلع: متوسّط الانعطاف عند كل نقطة يقلّ رغم قلّة النقاط.
    expect(jitter(r.points)).toBeLessThan(jitter(raw))
  })

  it('والطرفان يبقيان على موضعيهما بعد الإنهاء — لا يزحف رأس الضربة', () => {
    const raw = stroke(1200)
    const r = finalizeStroke(raw, false)
    const n = pointCount(r.points)
    expect([r.points[0], r.points[1]]).toEqual([raw[0], raw[1]])
    expect([r.points[(n - 1) * 2], r.points[(n - 1) * 2 + 1]]).toEqual([
      raw[raw.length - 2],
      raw[raw.length - 1],
    ])
  })

  it('**والمسار المغلق يُقصّ عند مَخيطه أيضًا** — فلا يبدأ بنقطة خام', () => {
    const raw = stroke(60)
    const closed = finalizeStroke(raw, true)
    const open = finalizeStroke(raw, false)
    expect([open.points[0], open.points[1]]).toEqual([raw[0], raw[1]])
    expect([closed.points[0], closed.points[1]]).not.toEqual([raw[0], raw[1]])
  })

  it('**والمسار المرضيّ يُقتطع ويُعلَن** — لا يُخفى تجاوزه', () => {
    // ثلاثون لفّة حلزونية: هندسة لا تُبسَّط، لا كثافة تعيين.
    const pathological: number[] = []
    for (let i = 0; i < 6000; i++) {
      const t = i * 0.05
      pathological.push(Math.cos(t) * (50 + t * 8), Math.sin(t) * (50 + t * 8))
    }
    const r = finalizeStroke(pathological, false)
    expect(r.truncated).toBe(true)
    expect(pointCount(r.points)).toBe(MAX_FREEHAND_POINTS)
    // والعتبة بلغت أقصاها قبل الاستسلام — التصعيد جُرِّب لا تُخُطّي.
    expect(r.epsilon).toBeGreaterThan(RDP_EPSILON_PX)
  })

  it('وعدد الجولات ثابتٌ معلن', () => {
    expect(CHAIKIN_PASSES).toBe(2)
  })
})
