/**
 * هندسة عناصر الطبقة — أصغر ما تحتاجه البدائيات لتضع نفسها.
 *
 * البدائيات **تعرض ولا تحسب**: تستقبل مستطيلًا أو نقطة في فضاء النافذة
 * (`viewport`) وتضع نفسها فيه. كل التحويل بين الفضاءات الثلاثة يحدث في
 * `content/coords.ts` قبل أن تصل القيمة إلى هنا.
 *
 * النوع بنيوي عمدًا (`{x, y, width, height}` لا نوع مُعلَّم): `ViewportRect`
 * القادم من `coords.ts` يحمل الحقول نفسها وزيادة، فيُسند إلى هنا بلا تحويل
 * ولا استيراد يربط طبقة العرض بطبقة المحتوى.
 */

export interface Point {
  readonly x: number
  readonly y: number
}

export interface Rect extends Point {
  readonly width: number
  readonly height: number
}

/**
 * يضع عنصرًا عند نقطة داخل طبقة الهندسة.
 *
 * `translate` لا `inset-inline-start`: الإزاحة تحدث على المُركِّب وحده بلا
 * إعادة تخطيط — وهو شرط «الطبقة الخاملة لا تمنع التمرير». وهي كذلك محايدة
 * تجاه الاتجاه، فلا تنقلب حين تكون الواجهة RTL بينما الإحداثيات فيزيائية.
 */
export function at({ x, y }: Point): Record<string, string> {
  return { '--rasd-ov-x': `${x}px`, '--rasd-ov-y': `${y}px` }
}

/** يضع عنصرًا ويعطيه مقاسًا — الشكل الشائع لكل بدائيّة مستطيلة. */
export function box({ x, y, width, height }: Rect): Record<string, string> {
  return {
    '--rasd-ov-x': `${x}px`,
    '--rasd-ov-y': `${y}px`,
    '--rasd-ov-w': `${width}px`,
    '--rasd-ov-h': `${height}px`,
  }
}

/**
 * أعلى شريط التلميحات عن أسفل النافذة: فوق شريط الأدوات العائم بثمانية كما في `59:2` و`59:123`
 * — الشريط 48 على بُعد 40 من الأسفل، والتلميح نحو 36.
 */
export const HINT_OFFSET_PX = 40 + 48 + 8 + 36
