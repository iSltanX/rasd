/**
 * المسافة اللونية الإدراكية — ΔE في OKLab، مصدرٌ واحد لكل من يحتاجها.
 *
 * **لماذا OKLab إقليديًّا لا CIEDE2000.** CIEDE2000 وُجدت لأن CIELAB **ليست**
 * موحَّدة إدراكيًّا: المسافة الإقليدية فيها تُبالغ في الأزرق وتُقصِّر في
 * الأصفر، فبُنيت فوقها معادلة تصحيح بأوزان ودورات مثلّثية. وOKLab صُمِّمت
 * أصلًا لتُصلح ذلك في الفضاء نفسه — غايتها المعلنة أن **المسافة الإقليدية
 * فيها تقارب الفرق المُدرَك مباشرةً**. فإضافة CIEDE2000 فوقها تصحيحٌ لعلّة
 * لا توجد، وكلفةُ حساب بلا مقابل في مسار يُنفَّذ ملايين المرّات (تجميع
 * عنقودي على عيّنة بكسل).
 *
 * **ولماذا تُصدَّر أصلًا.** كانت هذه الحسبة موجودة فعلًا — `labOf`/`labOfReading`
 * /`distance` داخل [`tailwind.ts`](tailwind.ts)، خاصّةً ومحبوسة على مقارنة لون
 * بلوحة Tailwind. والمرحلة 14 تحتاجها في ثلاثة مواضع أخرى (التجميع العنقودي،
 * ومطابقة استخدام اللون ضمن عتبة، وترشيح الحياديات) — فنسخُها رابعةً هو
 * بالضبط ما يمنعه ثابت المشروع: **الدالّة نفسها لا مثيلها**. فاستُخرجت هنا،
 * و`tailwind.ts` صار مستهلِكًا لها لا مالكًا — بلا تغيّر رقم واحد في نتائجه.
 *
 * **والمدخل `rgb` المقصوص لا `oklch` الخام — عمدًا.** `ColourReading` تحمل
 * الاثنين: إحداثيات OKLCH الحقيقية (قد تخرج عن مدى sRGB) والبايتات المعروضة
 * بعد القصّ. والمسافة هنا تُحسب على **ما يُرسَم فعلًا**، لأن سؤالها دائمًا
 * إدراكي: «هل يرى المستخدم هذين اللونين واحدًا؟» — والمستخدم يرى المقصوص.
 * هذا هو السلوك القائم في `tailwind.ts` منذ المرحلة 13، وحُفظ كما هو.
 */

import { converter, modeOklab, modeRgb, useMode, type Color } from 'culori/fn'

import type { ColourReading } from './formats'

useMode(modeRgb)
useMode(modeOklab)
const toOklab = converter('oklab')

/** إحداثيات OKLab — `l` إضاءة، و`a`/`b` محورا اللون. */
export interface Oklab {
  readonly l: number
  readonly a: number
  readonly b: number
}

/** يحوّل لونًا من `culori` إلى OKLab، بأصفار بدل `undefined` للرماديات بلا زاوية. */
function labOfColor(c: Color): Oklab {
  const l = toOklab(c)
  return { l: l?.l ?? 0, a: l?.a ?? 0, b: l?.b ?? 0 }
}

/** OKLab من قراءة لون — من البايتات المعروضة (المقصوصة)، انظر ترويسة الملفّ. */
export function oklabOf(reading: ColourReading): Oklab {
  return labOfColor({
    mode: 'rgb',
    r: reading.rgb.r / 255,
    g: reading.rgb.g / 255,
    b: reading.rgb.b / 255,
  })
}

/** OKLab من بايتات خام 0..255 — مسار العيّنة البكسلية، بلا بناء `ColourReading` وسيط. */
export function oklabOfBytes(r: number, g: number, b: number): Oklab {
  return labOfColor({ mode: 'rgb', r: r / 255, g: g / 255, b: b / 255 })
}

/** المسافة الإقليدية في OKLab — صفر يعني تطابقًا رياضيًّا. */
export function deltaE(x: Oklab, y: Oklab): number {
  return Math.hypot(x.l - y.l, x.a - y.a, x.b - y.b)
}

/** المسافة بين قراءتين مباشرةً — اختصار `deltaE(oklabOf(a), oklabOf(b))`. */
export function deltaEReadings(a: ColourReading, b: ColourReading): number {
  return deltaE(oklabOf(a), oklabOf(b))
}
