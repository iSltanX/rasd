import fc, { configureGlobal } from 'fast-check'

/**
 * `fast-check` مضبوطًا لرصد — **ببذرة ثابتة افتراضًا** ([ADR 0033](../../../Docs/ADR/0033-property-tests-and-boundary-cycles.md)).
 *
 * البوّابة A حتمية بالكامل، وبذرةٌ عشوائية في كل تشغيل تجعل سقوطها مرهونًا بالحظّ: خاصّيةٌ
 * تسقط في التشغيل السابع من عشرة تُقرأ تقطّعًا وهي عطل حقيقي. فالبذرة ثابتة، وكل ملفّ خصائص
 * يستورد `fc` من هنا لا من الحزمة مباشرةً.
 *
 * **والاستكشاف لا يُحرَم**: `RASD_FC_SEED=<عدد>` يبدّل البذرة لتشغيلٍ يدوي يبحث عن أمثلة جديدة،
 * و`fast-check` يطبع البذرة والمسار عند أي سقوط فيُعاد إنتاجه بهما حرفيًّا. ومثالٌ مضادّ يُكتشف
 * هكذا يُثبَّت في `examples` الخاصّية نفسها فيُجرَّب أوّلًا في كل تشغيل، لا يُترك للبذرة.
 */

const fromEnv = Number.parseInt(process.env['RASD_FC_SEED'] ?? '', 10)

/** البذرة الافتراضية: رقمٌ لا معنى له سوى الثبات. */
export const DEFAULT_SEED = 1_600_016

export const SEED = Number.isSafeInteger(fromEnv) ? fromEnv : DEFAULT_SEED

configureGlobal({ seed: SEED })

export { fc }
