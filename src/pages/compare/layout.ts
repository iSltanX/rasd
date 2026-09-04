/**
 * هندسة المسرح — تحويل أبعاد بكسل الجهاز إلى صناديق نسبيّة (٪) تُموضَع فوق
 * صورتين قد تختلفان مقاسًا. منطق خالص لا DOM، اختُبر بلا متصفّح.
 *
 * **الفكرة:** حاوية CSS واحدة بنسبة عرض/ارتفاع `stageSize()`، وكل صورة أو
 * مستطيل داخلها يُموضَع بنسبة مئوية من تلك الأبعاد نفسها — لا بكسل مطلق.
 * لأن كلا البُعدين (عرضًا وارتفاعًا) يُقسَم على أساس المسرح نفسه، تبقى نسبة
 * عرض:ارتفاع الأصلية لكل صورة سليمة داخل الحاوية مهما تغيّر مقاسها المعروض
 * (نافذة أُعيد تحجيمها) — لا تشويه، بلا حساب إضافي وقت العرض.
 *
 * **المحاذاة من الأعلى-اليسار** تطابق `modules/compare/diff.ts` حرفيًّا
 * («يحاذي من الأعلى-اليسار ويقارن التقاطع») — `overlap` ومناطقه تبدأ عند
 * (0,0) دومًا، فمستطيلاتها تُحوَّل بالدالّة نفسها التي تُحوِّل بها الصورتان.
 *
 * **`left`/`top`/`width`/`height` فيزيائيّان مقصودان — لا `insetInlineStart`
 * المنطقي.** عُثر على هذا كخطأ حقيقي أثناء التحقّق الحيّ: `rect.x` بكسل
 * **جهاز**، فضاء صورة لا اتجاه صفحة (نفس تعليل `AdjacentView.tsx` و
 * `PageSplitHandle.tsx` حرفيًّا). واستعمال خاصية منطقية هنا في صفحة RTL كان
 * يقلب موضع كل صندوق أفقيًّا — مربّع منطقة عند `x=150` من عرض 200 (يمين
 * الصورة فعليًّا) يُرسَم عند 75% من **بداية القراءة**، أي يسار الصفحة في
 * RTL: انعكاسٌ كامل، لا انزياحًا طفيفًا. القماش نفسه أفلت من هذا الخطأ
 * بالمصادفة وحدها (يغطّي 0–100% دومًا، فلا فرق مرئيًّا لصندوق كامل العرض)،
 * بينما صناديق المناطق الجزئية — الأصغر من المسرح — انقلبت فعليًّا. مُستثنًى
 * من حارس الخاصية الفيزيائية في `eslint.config.js` بالاسم، لا بإطفاء القاعدة.
 */

import type { ExtraStrip } from '@/modules/compare/diff'

export interface PixelSize {
  readonly width: number
  readonly height: number
}

export interface PixelRect extends PixelSize {
  readonly x: number
  readonly y: number
}

export interface PercentBox {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

/** أبعاد المسرح — أكبر عرض وأكبر ارتفاع بين الصورتين. `1×1` أدنى حدّ يمنع القسمة على صفر. */
export function stageSize(a: PixelSize, b: PixelSize): PixelSize {
  return {
    width: Math.max(a.width, b.width, 1),
    height: Math.max(a.height, b.height, 1),
  }
}

/** يحوِّل مستطيل بكسل جهاز إلى صندوق نسبي (٪) داخل مسرح بهذا المقاس. */
export function percentBox(rect: PixelRect, stage: PixelSize): PercentBox {
  if (stage.width <= 0 || stage.height <= 0) {
    return { left: 0, top: 0, width: 0, height: 0 }
  }
  return {
    left: (rect.x / stage.width) * 100,
    top: (rect.y / stage.height) * 100,
    width: (rect.width / stage.width) * 100,
    height: (rect.height / stage.height) * 100,
  }
}

/**
 * `PercentBox` إلى خصائص CSS فيزيائية جاهزة لنمط سطري — `%` لا `px`. بلا
 * `position` هنا: العناصر المستهلِكة (`.overlayBox`/`.regionBox` في
 * `DiffView.module.css`) تُعلنه `absolute` عبر الصنف بالفعل — تكراره هنا
 * يخفي أين المصدر الحقيقي بلا فائدة.
 */
export function percentBoxStyle(box: PercentBox): Record<string, string> {
  return {
    left: `${box.left}%`,
    top: `${box.top}%`,
    width: `${box.width}%`,
    height: `${box.height}%`,
  }
}

export interface ExtraStripBox {
  /** مفتاح ثابت — أي صورة (a/b) وأيّ محور (cols/rows)، لا `region.id` مرقَّم. */
  readonly key: 'a-cols' | 'a-rows' | 'b-cols' | 'b-rows'
  readonly box: PercentBox
}

/**
 * صناديق الأشرطة الفائضة من كلتا الصورتين — للتعليم الصريح فوق ما لم
 * يُقارَن، بدل تركه فراغًا صامتًا أو محتوًى يبدو مُقارَنًا وهو ليس كذلك.
 *
 * **فجوة كانت صامتة لا معلَنة** — `extraInA`/`extraInB` وصلا `DiffOutcome`
 * منذ الدفعة السابقة (`diff.ts` يحسبهما بدقّة، ثلاثة اختبارات تثبت ذلك) لكن
 * لا مكوّن كان يستهلكهما: نصّ §17 «تعليم المنطقة الزائدة صراحةً» لم يتحقّق
 * في الواجهة رغم توفّر البيانات الكاملة له. هذا الملفّ هو موضع الإصلاح —
 * الاستهلاك في `DiffView.tsx`.
 *
 * حتى أربعة صناديق (عمودان وصفّان، من كل صورة) — عادةً أقلّ إذ تساوي الأبعاد
 * هو الشائع لا الاستثناء. المصفوفة تخطّي `null` بلا صندوق فارغ.
 */
export function extraStripBoxes(
  extraInA: ExtraStrip,
  extraInB: ExtraStrip,
  stage: PixelSize,
): readonly ExtraStripBox[] {
  const boxes: ExtraStripBox[] = []
  const add = (key: ExtraStripBox['key'], rect: PixelRect | null): void => {
    if (rect) boxes.push({ key, box: percentBox(rect, stage) })
  }
  add('a-cols', extraInA.cols)
  add('a-rows', extraInA.rows)
  add('b-cols', extraInB.cols)
  add('b-rows', extraInB.rows)
  return boxes
}
