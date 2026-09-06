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
 * RTL: انعكاسٌ كامل، لا انزياحًا طفيفًا. القماش أفلت من هذا الخطأ في
 * لقطتَي الفحص اللتين كُشف بهما — وكانتا متساويتَي الأبعاد، فغطّى 0–100%
 * ولا فرق مرئيًّا لصندوق كامل العرض. **وهذا شرطٌ لا قاعدة**: متى اختلفت
 * الأبعاد غطّى القماش نسبةً أصغر من الزاوية العلوية-اليسرى، فكان سينقلب هو
 * الآخر. بينما صناديق المناطق الجزئية انقلبت فعليًّا في الحالتين. مُستثنًى
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

/**
 * صندوق الصورة نفسها داخل المسرح — **الإصلاح الذي كشفه القياس الحيّ.**
 *
 * كانت الصورة تُفرَش بـ`inset: 0` مع `object-fit: contain`، فتُرسَم بأكبر
 * مقياس يناسب الحاوية لا بمقياس المسرح. وحين تختلف نسبتا الصورتين ينفرط
 * العقد: قِيس أن صورة `200×150` داخل مسرح `280×220` تُرسم **مكبَّرةً
 * 1.400×**، فتقع علامةٌ تشير إلى بكسل المسرح 100 على بكسل الصورة 71.4 —
 * انحراف 29٪. والخريطة الحرارية وصناديق المناطق كانت في الفضاء الصحيح
 * طوال الوقت، فالمنحرف هو الصورة وحدها تحتها. وفي وضع «الوميض» تحديدًا
 * كان الأثر أفدح: صورتان بمقياسين مختلفين تتبادلان في نفس الموضع، وهو
 * نقض غرض الوميض من أصله لا عيبٌ في تفصيله.
 *
 * وتُموضَع الصورة هنا بـ`percentBox` **نفسها** التي تُموضِع كل مستطيل آخر،
 * لا بحساب موازٍ لها — فلا فضاءَ ثانٍ يمكن أن ينحرف عن الأوّل.
 */
export function imageBox(image: PixelSize, stage: PixelSize): PercentBox {
  return percentBox({ x: 0, y: 0, width: image.width, height: image.height }, stage)
}

/**
 * يحوّل موضع مقبض الفصل من فضاء المسرح إلى نسبةٍ من عرض **صورة** بعينها.
 *
 * `clipPath: inset(0 0 0 X%)` يقيس من عرض الصورة المقصوصة، بينما المقبض
 * يتموضّع في فضاء المسرح. فما لم يُحوَّل بينهما، ينقصّ الحدّ في موضعٍ
 * والمقبض في آخر متى ضاقت الصورة عن المسرح — وهو انحرافٌ يترتّب على إصلاح
 * `imageBox` لا يسبقه، لأن الفرش السابق كان يجعل الصورة والحاوية بمقاس واحد.
 *
 * القصّ إلى [0,100] مقصود: نقطةٌ خارج حدود الصورة الأضيق تعني «اقصص كلّها»
 * أو «لا تقصص شيئًا»، لا نسبةً سالبة يرفضها CSS صامتًا.
 */
export function splitPercentInImage(
  stagePercent: number,
  image: PixelSize,
  stage: PixelSize,
): number {
  if (image.width <= 0 || stage.width <= 0) return 0
  const stagePx = (stagePercent / 100) * stage.width
  return Math.min(100, Math.max(0, (stagePx / image.width) * 100))
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
