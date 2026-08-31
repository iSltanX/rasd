# جرد نقاط الدخول

> ملفّ مودَع يحكمه [القسم 4 من الدستور](Constitution.md#4-جرد-نقاط-الدخول--docsentrypointsmd).
> يُقارَن **آليًّا** بالقوائم المغلقة في الكود عبر `node scripts/entrypoints-lint.mjs` —
> بندٌ جديد في `RequestMap` أو `COMMAND_TOOL` أو `ITEMS` بلا صفّ هنا = فشل حتمي في البوّابة A،
> فالإغفال يصير مستحيلًا لا مُستبعَدًا.
>
> **عمود «أمر التحقّق» يقول ما يُثبِت السلسلة كاملة من الإيماءة إلى الأثر** — لا ما يختبر
> جزءًا منها. و«الاستثناءات» تُكتب **بحدّها الحقيقي لا أوسع**: درسُ `verify-popup` أنّ
> «قيد منصّة» كُتب ليغطّي ضغطة المفتاح، فغطّى معها فجوةً لم تكن المنصّة سببها (الصفّ 77).

---

## 1. أوامر `chrome.commands` — أربعة (حدّ Chrome)

المصدر المغلق: `COMMAND_TOOL` في `src/background/commands.ts`.

| الأمر               | المسار الإنتاجي                                         | الأثر النهائي                 | أمر التحقّق                                     | استثناء موثَّق                                                                                                                                               |
| ------------------- | ------------------------------------------------------- | ----------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `capture-area`      | `onCommand` ← `activateTool` ← حقن + إقلاع ← `mode/set` | وضع `area` نشط والطبقة مرسومة | `pnpm verify:activate`                          | إطلاق الضغطة نفسها غير ممكن آليًّا — لا CDP ولا Playwright يُطلق مُسرِّع `chrome.commands`. **الحدّ الحقيقي: الضغطة وحدها**؛ وما بعدها مُغطًّى من تبويب بارد |
| `capture-element`   | نفسه بوضع `element`                                     | وضع `element` نشط             | `pnpm verify:activate`                          | نفسه                                                                                                                                                         |
| `capture-viewport`  | `activateTool` ← `capture/start`                        | لقطة محفوظة                   | `pnpm verify:activate`                          | نفسه                                                                                                                                                         |
| `capture-full-page` | `activateTool` ← `startFullPage` (حلقة SW)              | لقطة كاملة محفوظة في المخزن   | `pnpm verify:activate` · `pnpm verify:fullpage` | نفسه                                                                                                                                                         |

---

## 2. بنود قائمة السياق — ثمانية

المصدر المغلق: `ITEMS` في `src/background/context-menus.ts`. كلّها تمرّ من `activateTool` نفسها.

| البند                                         | الأثر النهائي                   | أمر التحقّق                                    |
| --------------------------------------------- | ------------------------------- | ---------------------------------------------- |
| `area` · `element` · `viewport` · `full-page` | كما في الجدول أعلاه             | `pnpm verify:activate`                         |
| `inspect`                                     | وضع `inspect` نشط               | `pnpm verify:activate` · `pnpm verify:inspect` |
| `measure`                                     | وضع `measure` نشط               | `pnpm verify:activate` · `pnpm verify:measure` |
| `colour`                                      | وضع `colour` نشط                | `pnpm verify:activate` · `pnpm verify:colour`  |
| `compare`                                     | وضع `compare` نشط ولوحته مرسومة | `pnpm verify:activate` · `pnpm verify:compare` |

> البداية الباردة لهذه الثمانية يثبتها `verify-activate` بأداةٍ واحدة ممثِّلة (`measure`) —
> لأن الثمانية تشترك في `activateTool` حرفيًّا، والاختلاف بينها في وسيط الوضع لا في السلسلة.
> سكربت الأداة يثبت سلوكها بعد التفعيل.

---

## 3. نافذة الإضافة

| نقطة الدخول                        | المسار الإنتاجي                                      | الأثر النهائي                                    | أمر التحقّق                                                                                                         |
| ---------------------------------- | ---------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| أزرار الأدوات                      | `runTool` ← `tool/activate` ← `activateTool`         | الأداة نشطة، والنافذة تُغلق على نجاح مؤكَّد وحده | `pnpm verify:activate` · `pnpm verify:popup`                                                                        |
| «مقارنة» بعد النجاح                | `runTool('compare')`                                 | وضع `compare` نشط                                | `pnpm verify:activate`                                                                                              |
| إلغاء «جارٍ الالتقاط»              | `cancelJob` ← `fullpage/cancel` ← `cancelFullPage()` | المهمّة تُجهَض والصفحة تُستعاد                   | [بلا أمر: حالة `capturing` صارت قابلة للوصول للتوّ بكتابة `session.job`؛ إثباتها الحيّ دَيْنٌ معلَن على المرحلة 17] |
| فتح صفحة (مكتبة · محرّر · إعدادات) | `page/open` ← `chrome.tabs.create`                   | التبويب مفتوح على الصفحة                         | `pnpm verify:popup`                                                                                                 |

---

## 4. رسائل العقد — `RequestMap`

المصدر المغلق: `RequestMap` في `src/shared/messaging/contract.ts`.

**الرسائل ليست كلّها نقاط دخول مستخدم**؛ منها ما هو داخليّ بين أجزاء الإضافة. الجرد يفرزها
صراحةً كي لا يُقرأ غيابُ أمرِ تحقّقٍ لرسالةٍ داخلية إغفالًا:

| المجموعة          | الرسائل                                                                                                 | التصنيف                 | أمر التحقّق                      |
| ----------------- | ------------------------------------------------------------------------------------------------------- | ----------------------- | -------------------------------- |
| التفعيل           | `tool/activate` · `mode/set` · `mode/report`                                                            | نقطة دخول               | `pnpm verify:activate`           |
| الالتقاط          | `capture/run` · `capture/start` · `capture/blob` · `capture/hide-overlay` · `capture/show-overlay`      | داخلية (يقودها التفعيل) | `pnpm verify:capture`            |
| الالتقاط الكامل   | `fullpage/prepare` · `fullpage/step` · `fullpage/finish` · `fullpage/cancel`                            | داخلية                  | `pnpm verify:fullpage`           |
| اللون             | `colour/frame` · `colour/save`                                                                          | داخلية                  | `pnpm verify:colour`             |
| الفحص             | `inspect/report` · `inspect/get`                                                                        | داخلية                  | `pnpm verify:inspect`            |
| الصفحات           | `page/open`                                                                                             | نقطة دخول               | `pnpm verify:popup`              |
| الحالة والإعدادات | `session/get` · `session/patch` · `settings/get` · `settings/patch` · `settings/reset`                  | داخلية                  | `pnpm test` (وحدات)              |
| التشخيص والبنية   | `diagnostics/ping` · `diagnostics/storage` · `tab/can-operate` · `offscreen/ensure` · `offscreen/close` | داخلية                  | `pnpm verify:load` · `pnpm test` |

---

## 5. اختصارات داخل الصفحة

المصدر: `BINDINGS` في `src/content/shortcuts.ts`. تُركَّب **مع الجلسة** — فلا تعمل قبل تفعيل
ناجح، وهذا قيدٌ حقيقي لا عطل.

| الاختصار        | الأثر                   | أمر التحقّق                                                                                                                                   |
| --------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `⌥⇧I/M/C/D`     | تبديل الوضع داخل الصفحة | [بلا أمر: تركيب المستمعات يثبته `pnpm verify:activate` ضمنًا بنجاح الجلسة؛ وإطلاق التركيبة نفسها آليًّا غير ممكن — نفس حدّ `chrome.commands`] |
| `Esc`           | العودة إلى `idle`       | `pnpm verify:overlay`                                                                                                                         |
| `⌘K` / `Ctrl+K` | **لا شيء — ولا يُبتلع** | `grep -n "action: { kind: 'palette' }" -A0 src/content/shortcuts.ts` (يجب أن يكون `swallow: false` حتى تُبنى اللوحة)                          |
