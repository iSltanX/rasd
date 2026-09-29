# شجرة الإتاحة — نافذة الإضافة، RTL

المصدر: `src/pages/popup-preview/` (أداة معاينة داخلية، انظر تعليقها) عبر
متصفح Claude، الحالات التسع القابلة للوصول ساكنًا (`success` فوق `default`
كما تُعرض فعليًا في `Popup.tsx`؛ `default · light` تحتاج تحميلًا منفصلًا
بـ`?theme=light` لأن توكنز السمة مُنطاقة إلى `:root` وحده — انظر `main.tsx`).

مُلتقَطة عبر `read_page(filter: interactive)` — 44 عنصرًا تفاعليًا، بترتيب DOM
نفسه (لا CSS، لا `tabIndex` يدوي)، وهو ترتيب Tab الفعلي. كل عنصر زرّ HTML
أصيل (`<button type="button">`)؛ الأزرار ذات الأيقونة فقط (بطاقات الالتقاط،
أدوات الفحص، أزرار إجراءات النجاح) تحسب اسمها الإتاحي من نصّها الداخلي
المرئي (الأيقونات مُعلَّمة `aria-hidden="true"` — مؤكَّد بفحص `outerHTML` مباشرة)
لا من `aria-label` صريح؛ أداة `read_page` لا تعرض نصًّا مُقتبَسًا لهذه الأزرار
تحديدًا (على الأرجح لأن نصّها المرئي متعدّد العُقد لا عقدة نصّية واحدة)، وهذا
سلوك عرض الأداة لا غياب اسم إتاحي فعلي.

```
button "الإعدادات" [ref_1] type="button"        ← popup/default: زرّ الإعدادات
button [ref_2] type="button"                     ← بطاقة «عنصر» (E)
button [ref_3] type="button"                     ← بطاقة «منطقة» (T)
button [ref_4] type="button"                     ← بطاقة «صفحة كاملة» (S)
button [ref_5] type="button"                     ← بطاقة «الظاهر» (V)
button [ref_6] type="button"                     ← أداة «مقارنة»
button [ref_7] type="button"                     ← أداة «ألوان»
button [ref_8] type="button"                     ← أداة «قياس»
button [ref_9] type="button"                     ← أداة «فحص»
button "عرض الكل" [ref_10] type="button"          ← رابط فتح المكتبة (مجموعة الأخيرة)
button [ref_11] type="button"                     ← بطاقة اللقطة الأخيرة الأولى
button [ref_12] type="button"                     ← بطاقة اللقطة الأخيرة الثانية
button [ref_13] type="button"                     ← رابط المكتبة (تذييل popup/default)
button "الإعدادات" [ref_14] type="button"         ← popup/capturing: زرّ الإعدادات
button [ref_15] type="button"                     ← زرّ إلغاء الالتقاط
button [ref_16] type="button"                     ← رابط المكتبة (تذييل)
button "الإعدادات" [ref_17] type="button"         ← popup/inspect-active
button [ref_18] type="button"                     ← زرّ إنهاء الفحص
button [ref_19] type="button"                     ← رابط المكتبة
button "الإعدادات" [ref_20] type="button"         ← popup/colors
button [ref_21] type="button"                     ← زرّ إنهاء الاختيار
button [ref_22] type="button"                     ← رابط المكتبة
button "الإعدادات" [ref_23] type="button"         ← popup/success (فوق default)
button [ref_24] type="button"                     ← إجراء «مقارنة»
button [ref_25] type="button"                     ← إجراء «تعليق»
button [ref_26] type="button"                     ← إجراء «رابط مشاركة»
button [ref_27] type="button"                     ← إجراء «نسخ»
button [ref_28] type="button"                     ← «افتح في المكتبة»
button [ref_29] type="button"                     ← رابط المكتبة (تذييل)
button "الإعدادات" [ref_30] type="button"         ← popup/first-run
button [ref_31] type="button"                     ← «جولة سريعة»
button [ref_32] type="button"                     ← «تخطَّ — أعرف طريقي»
button "الإعدادات" [ref_33] type="button"         ← popup/permission
button [ref_34] type="button"                     ← «اسمح في figma.com»
button "اسمح مرة واحدة" [ref_35] type="button"     ← إجراء ثانوي
button [ref_36] type="button"                     ← رابط المكتبة
button "الإعدادات" [ref_37] type="button"         ← popup/offline
button [ref_38] type="button"                     ← «تابع دون اتصال»
button "أعد المحاولة" [ref_39] type="button"       ← إجراء ثانوي
button [ref_40] type="button"                     ← رابط المكتبة
button "الإعدادات" [ref_41] type="button"         ← popup/restricted
button [ref_42] type="button"                     ← «إدارة المواقع المستثناة»
button "لماذا؟" [ref_43] type="button"             ← إجراء ثانوي
button [ref_44] type="button"                     ← رابط المكتبة
```

**ما يُثبته هذا الالتقاط:**

- ترتيب DOM هو ترتيب Tab الفعلي، بلا أي `tabIndex` مُدار يدويًا — كل عنصر
  تفاعلي زرّ HTML أصيل يكتسب قابلية التركيز والتفعيل بـEnter/Space من سلوك
  المتصفح القياسي.
- كل إطار (حالة) يبدأ بزرّ الإعدادات في الترويسة وينتهي برابط المكتبة في
  التذييل — ثابت عبر الحالات التسع كلّها، مطابقًا لبنية `Header`/`Footer`
  المشتركة.
- شبكة الالتقاط: E · T · S · V (لا E · F · S · V — انظر تناقض `Docs/Engineering.md §6`
  رقم 15). صفّ الفحص: مقارنة · ألوان · قياس · فحص (ترتيب DOM الفعلي في
  Figma، انظر تناقض رقم 14).

اختبار Tab/Enter/Space الآلي المقابل: [`tests/unit/pages/popup/default-keyboard-nav.test.tsx`](../../unit/pages/popup/default-keyboard-nav.test.tsx).
