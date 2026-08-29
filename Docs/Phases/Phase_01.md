# المرحلة 1 — تهيئة المشروع وسلسلة البناء

> المواصفة التنفيذية · **المودل** `Opus 5` · **الإصدار** MVP · **الحالة** ✅ مكتملة · 2026-08-28
>
> المرجع: [`Rasd_Plan.md § المرحلة 1`](../../Rasd_Plan.md)

---

## 1. الهدف

مستودع قابل للبناء والفحص والاختبار، يُنتج مجلّد إضافة يُحمَّل في Chrome عبر «تحميل غير
مضغوطة» ويظهر بأيقونته واسمه العربي — بلا أي وظيفة منتج.

**ما ليس في النطاق:** الصلاحيات و`_locales` وسياسة الحقن (المرحلة 2) · الرسائل والتخزين
(المرحلة 3) · التوكنز (المرحلة 4) · المكوّنات (المرحلة 5).

---

## 2. البنية

### 2.1 شجرة المستودع

```
Rasd/
├── manifest.config.ts        ← البيان، TypeScript لا JSON
├── vite.config.ts            ← البناء
├── vitest.config.ts          ← الاختبارات
├── eslint.config.js          ← اللنت + حدود المعمار (يصدّر architectureZones)
├── tsconfig.json             ← src/ فقط — بلا أنواع Node
├── tsconfig.test.json        ← tests/ — يضيف أنواع Node
├── tsconfig.node.json        ← ملفات الإعداد والسكربتات
├── pnpm-workspace.yaml       ← موافقات سكربتات ما بعد التثبيت
├── ADR/                      ← 4 قرارات + مشكلات معروفة
├── public/icons/             ← 16 · 32 · 48 · 128 مصدَّرة من Figma
├── scripts/                  ← verify-dist · verify-load · zip · tokens-sync · e2e
├── src/
│   ├── background/  content/  offscreen/  pages/
│   ├── modules/     ui/       shared/     tokens/
│   └── vite-env.d.ts
├── tests/
│   ├── setup.ts              ← يركّب fakeBrowser ويزوّده ببيان
│   ├── unit/                 ← smoke · architecture-boundaries
│   ├── integration/  e2e/
│   └── fixtures/lint/        ← شجرة مخالفات متعمَّدة
└── .github/workflows/ci.yml
```

كل مجلّد في `src/` يحمل `README.md` يشرح دوره وحدوده.

### 2.2 طبقات `src/` وحدودها

| الطبقة | الدور | ممنوع أن تستورد من | المرحلة |
| --- | --- | --- | --- |
| `background/` | دورة الحياة، توجيه الرسائل، نداءات `chrome.*` المميّزة | — | 3 |
| `content/` | Shadow Root، مدير الأوضاع، الإحداثيات، أدوات الفحص | **`pages/`** | 6 |
| `offscreen/` | الحافظة، Canvas الثقيل | — | 3 |
| `pages/` | popup · editor · library · settings · onboarding | — | 5+ |
| `modules/` | الوحدات الثماني — منطق خالص | **`ui/`** | 8+ |
| `ui/` | مكوّنات Preact على التوكنز الدلالية | — | 5 |
| `shared/` | الأنواع، الرسائل، bidi، التوطين، `Result` | **كل طبقة أعلى** | 3 |
| `tokens/` | مولَّد من Figma — لا يُحرَّر | — | 4 |

### 2.3 سلسلة الأدوات المثبَّتة

| الأداة | النسخة | ملاحظة |
| --- | --- | --- |
| Node | `24.16.0` | مثبَّت في `.nvmrc` |
| pnpm | `11.11.0` | مثبَّت في `packageManager` |
| Vite | `8.2.2` | الخطة ذكرت 6؛ المستقرّ عند التنفيذ 8 — [ADR 0001](../ADR/0001-build-toolchain.md) |
| `@crxjs/vite-plugin` | `2.7.1` | يعلن دعم `vite ^8` |
| TypeScript | `6.0.3` | **لا 7.0.2** — [ADR 0003](../ADR/0003-typescript-6.md) |
| ESLint | `10.9.1` | flat config |
| `typescript-eslint` | `8.68.0` | يحدّ TS عند `<6.1.0` |
| `eslint-plugin-import-x` | `4.17.1` | حدود المعمار |
| Vitest | `4.1.11` | بيئة `happy-dom` |
| Preact | `10.29.8` | + `@preact/signals` 2.11.1 |

**اعتماديتان للإنتاج فقط** (`preact`, `@preact/signals`) و16 للتطوير.

---

## 3. المكوّنات

| المكوّن | الملف | المسؤولية |
| --- | --- | --- |
| البيان | `manifest.config.ts` | مصدر واحد للبيان، يقرأ النسخة من `package.json` |
| Service Worker | `src/background/index.ts` | يسجّل `onInstalled` و`onStartup`؛ لا شيء غيرهما |
| ثوابت البيئة | `src/shared/env.ts` | `IS_DEV` · `VERSION` · `PRODUCT_NAME` · `NAMESPACE` |
| حدود المعمار | `eslint.config.js` → `architectureZones` | 9 zones، مُصدَّرة ليفحصها الاختبار |
| فحص الحزمة | `scripts/verify-dist.mjs` | 17 تأكيدًا على `dist/` |
| فحص التحميل | `scripts/verify-load.mjs` | يشغّل Chrome ويسأل CDP عن هدف الـservice worker |
| التحزيم | `scripts/zip.mjs` | `dist-zip/rasd-<version>.zip` |

### 3.1 `verify-dist` — ما يتحقّق منه

`manifest.json` صالح JSON · `manifest_version = 3` · الحقول الخمسة الإلزامية · **الاسم عربي**
(محرف في `U+0600–U+06FF`) · النسخة تطابق `package.json` · كل ملف يشير إليه البيان موجود ·
كل أيقونة PNG بتوقيعها وأبعادها الصحيحة مقروءة من ترويسة `IHDR` · `background.type = module` ·
لا ملفات `.ts` تسرّبت · حجم الحزمة.

### 3.2 `verify-load` — كيف يثبت التحميل

يشغّل Chrome بملف تعريف مؤقّت و`--load-extension`، ثم يفتح WebSocket على نقطة CDP للمتصفح
ويستدعي `Target.getTargets`. الإضافة المحمَّلة تسجّل هدفًا `type: "service_worker"` على أصل
`chrome-extension://`.

> `/json/list` **لا يُدرج** الـservice workers — لذلك يجب المرور عبر CDP على مستوى المتصفح.
> والـservice worker في MV3 كسول، فالسكربت يسأل حتى 20 مرة بفاصل 300ms قبل أن يحكم بالفشل.

---

## 4. الوظائف — واجهة السكربتات

| الأمر | يفعل | الحالة |
| --- | --- | --- |
| `pnpm dev` | Vite + CRXJS، إعادة بناء وHMR | ✅ |
| `pnpm build` | `typecheck` → `vite build` → `verify:dist` | ✅ |
| `pnpm typecheck` | ثلاثة مشاريع TS | ✅ |
| `pnpm lint` | ESLint، `--max-warnings=0` | ✅ |
| `pnpm format` / `format:check` | Prettier | ✅ |
| `pnpm test` / `test:watch` / `test:coverage` | Vitest | ✅ |
| `pnpm check` | typecheck + lint + format + test — نفس ما يشغّله CI | ✅ |
| `pnpm verify:dist` | فحص الحزمة | ✅ |
| `pnpm verify:load` | تحميل حقيقي في Chrome | ✅ |
| `pnpm zip` | حزمة للرفع | ✅ |
| `pnpm tokens:sync` | يخرج برسالة «المرحلة 4» | ⏳ 4 |
| `pnpm test:e2e` | يخرج برسالة «المرحلة 23» | ⏳ 23 |

السكربتان المؤجَّلان يخرجان بـ`exit 1` ورسالة صريحة — لا يدّعيان النجاح ولا يُدرجان في CI.

---

## 5. الحالات

سلسلة البناء لها حالات صريحة، وكل حالة فشل تُعطي رسالة تُميّزها:

| الحالة | المُشغِّل | المخرَج |
| --- | --- | --- |
| **تطوير** | `pnpm dev` | خادم على `5273`، websocket على `5274`، `dist/` يشير إلى الخادم |
| **بناء ناجح** | `pnpm build` | `dist/` بـ7 ملفات، 4.6KB، فحص الحزمة أخضر |
| **فشل الأنواع** | خطأ TypeScript | البناء يتوقّف قبل Vite |
| **فشل الحدود** | استيراد ممنوع | `import-x/no-restricted-paths` برسالة عربية تشرح السبب |
| **حزمة تالفة** | ملف مفقود أو أيقونة خاطئة | `verify:dist` يعدّد المشكلات ويخرج بـ1 |
| **رفض Chrome** | بيان غير صالح | `verify:load` يلتقط `Failed to load extension` |
| **service worker لم يعمل** | خطأ تشغيل في SW | `verify:load` لا يجد الهدف ويعدّد الأهداف الموجودة |

---

## 6. التدفقات

### 6.1 تطوير

```
pnpm install → pnpm dev → تحميل dist/ في chrome://extensions مرة واحدة
   → تعديل مصدر → Vite يعيد التحويل → CRXJS يعيد تحميل الإضافة
```
**مُثبَت:** تعديل `src/shared/env.ts` غيّر بصمة الوحدة المخدَّمة من `1df436b5…` إلى `acb4fb79…`.

### 6.2 تحقّق قبل الدفع

```
pnpm check → typecheck (3 مشاريع) → lint → format:check → test (8 اختبارات)
```

### 6.3 إصدار محلي

```
pnpm build → verify:dist → verify:load → pnpm zip → dist-zip/rasd-0.1.0.zip
```

### 6.4 CI

`ci.yml` على كل دفعة وPR: `checkout → pnpm → node (من .nvmrc) → install --frozen-lockfile
→ typecheck → lint → format:check → test → build → رفع dist/ كأثر`.

`verify:load` **خارج CI** — المرحلة 23 تملك تشغيل المتصفح، وCI يبقى محكمًا.

---

## 7. البيانات

لا بيانات تشغيل في هذه المرحلة (IndexedDB و`chrome.storage` في المرحلة 3). سطح البيانات
الوحيد هو الإعداد:

| المصدر | يقرأه | يحمل |
| --- | --- | --- |
| `package.json` → `version` | `manifest.config.ts` | `manifest.version` — مصدر واحد |
| `manifest.json` (وقت التشغيل) | `src/shared/env.ts` | `VERSION` — لا يمكن أن يفترق عن الحزمة |
| `import.meta.env.DEV` | `src/shared/env.ts` | `IS_DEV` |
| `.nvmrc` | CI و`engines` | نسخة Node |

**قرار:** النسخة تُقرأ من `chrome.runtime.getManifest()` لا تُحقن بـ`define` وقت البناء —
فلا مجال لافتراق النسخة المعروضة عن نسخة البيان.

---

## 8. الاختبارات

### 8.1 آلية (8 اختبارات · ملفّان)

| الملف | يثبت |
| --- | --- |
| `tests/unit/smoke.test.ts` | مسار `@/` يُحلّ · النسخة تُقرأ من البيان · `IS_DEV` معرَّف · `chrome.*` مزيَّف يعمل |
| `tests/unit/architecture-boundaries.test.ts` | `modules/ ✗→ ui/` · `content/ ✗→ pages/` · `shared/ ✗→ modules/` · `modules/ ✓→ shared/` |

اختبار الحدود يستورد `architectureZones` من `eslint.config.js` نفسه، ويشغّل ESLint فعليًا
على شجرة العيّنات — فيفحص القاعدة المطبَّقة لا نسخة منها. يعمل في بيئة `node` لأنه يقرأ القرص.

### 8.2 تحقّق يدوي مُنفَّذ

| الفحص | النتيجة |
| --- | --- |
| مخالفة حقيقية في `src/` تُسقط `pnpm lint` | ✅ رُصدت عبر الاسم المستعار `@/ui/…` أيضًا |
| `pnpm build` ينتج حزمة صالحة | ✅ 7 ملفات · 4.6KB · 17 تأكيدًا خضراء |
| الإضافة تُحمَّل في Chrome | ⚠️ **مُصحَّح في المرحلة 2** — انظر القسم 13 |
| `pnpm dev` يعيد البناء | ✅ بصمة الوحدة تغيّرت بعد التعديل |
| شجرة المجلّدات تطابق المواصفة | ✅ 12/12 |
| `ci.yml` صالح | ✅ 10 خطوات محلَّلة |

### 8.3 ما لم يُثبَت

**CI أخضر على GitHub** — لم يُدفَع المستودع بعد. كل أمر يشغّله `ci.yml` يمرّ محليًا
بنفس نسخة Node، لكن الخضرة الفعلية تتأكّد عند أول دفعة.

---

## 9. معيار الاكتمال

| # | المعيار | الحالة | الدليل |
| --- | --- | --- | --- |
| 1 | الإضافة تُحمَّل في Chrome بأيقونتها واسمها العربي | ✅ | تحقّق فعليًا في المرحلة 2 بعد تصحيح الفحص — انظر القسم 13 |
| 2 | `pnpm dev` يعيد البناء تلقائيًا | ✅ | تغيّر بصمة الوحدة المخدَّمة |
| 3 | شجرة المجلّدات مطابقة للمواصفة | ✅ | 12/12 مجلّدًا |
| 4 | `pnpm typecheck` و`pnpm lint` بلا أخطاء | ✅ | 3 مشاريع TS · `--max-warnings=0` |
| 5 | اختبار وحدة صوري يمرّ | ✅ | 4 اختبارات في `smoke.test.ts` |
| 6 | استيراد ممنوع متعمَّد يُسقط `lint` | ✅ | 4 اختبارات + تحقّق يدوي في `src/` الحقيقي |
| 7 | CI أخضر | ⚠️ | الملف صالح وكل أوامره تمرّ محليًا؛ يتأكّد عند أول دفعة |

---

## 10. الناتج

هيكل إضافة فارغ لكنه حيّ: **يُبنى، يُحمَّل في Chrome، يُفحص، ويُختبر** — وحدوده المعمارية
مفروضة آليًا من اليوم الأول.

## 11. ما تغيّر عن الخطة الأصلية

| البند | الخطة | المُنفَّذ | السبب |
| --- | --- | --- | --- |
| Vite | 6 | **8.2.2** | المستقرّ عند التنفيذ؛ CRXJS يدعمه |
| TypeScript | «أحدث» | **6.0.3** | `typescript-eslint` يحدّ عند `<6.1.0` — [ADR 0003](../ADR/0003-typescript-6.md) |
| `eslint-plugin-import` | مذكور | **`eslint-plugin-import-x`** | الأنشط والأصلح لـflat config |
| مشاريع TS | واحد | **ثلاثة** | إبقاء أنواع Node خارج `src/` — الشيفرة تعمل في المتصفح |
| `tokens:sync` `test:e2e` | سكربتان | **موجودان ويخرجان بخطأ صريح** | واجهة كاملة بلا ادّعاء نجاح |
| فحص التحميل | يدوي في المعيار | **آلي — `verify:load`** | تحويل معيار يدوي إلى فحص قابل للتكرار |

**اكتشاف يستحقّ التسجيل:** قاعدة `import-x/no-restricted-paths` تحلّ مسارات الـzones نسبةً
إلى `process.cwd()` افتراضيًا، فتتوقّف **بصمت** عن الفرض إذا شُغّل ESLint من مجلّد فرعي.
ثُبِّت `basePath: import.meta.dirname` صراحةً في الإعداد الحقيقي.

## 13. تصحيح — أُضيف أثناء المرحلة 2

**ما ادّعيته:** «الإضافة تُحمَّل في Chrome — المعرّف `fignfifoniblkonapihmkfakmlgkbkcf`».

**الحقيقة:** ذلك المعرّف يخصّ إضافة Chrome مكوّنة اسمها `Google Network Speech`.
إضافتنا **لم تكن محمَّلة أصلًا**: Chrome 137+ يتجاهل `--load-extension` صمتًا، وفحصي
كان يقبل «أي هدف `service_worker` على أصل `chrome-extension://`» فالتقط إضافة
داخلية وظنّها إضافتنا.

**السبب الجذري في الفحص لا في الحزمة:** استهداف فضفاض + مفتاح سطر أوامر معطَّل
بلا رسالة خطأ.

**التصحيح:** أُعيدت كتابة `verify:load` ليستخدم `Extensions.loadUnpacked` عبر
بروتوكول DevTools، ويستهدف معرّف إضافتنا المحسوب من مسارها، ويتأكّد أن الاسم عربي.
النتيجة بعد التصحيح: الحزمة تُحمَّل فعلًا بالمعرّف `akipffjdelligongljagcilckeejmame`،
والـservice worker الخاص بنا يعمل.

**ما كشفه التصحيح إضافةً:** Chrome كان **يرفض** بياننا بسبب الاختصارات
(`Alt+Command+F` غير صالح) — وهو عطل حقيقي بقي مخفيًا طوال المرحلة 1 لأن الفحص
لم يكن يحمّل الحزمة أصلًا. أُصلح في المرحلة 2.

**الدرس المطبَّق:** كل فحص يجب أن يكون قادرًا على الفشل. فحص لا يستطيع أن يفشل
ليس فحصًا. أُضيف الآن تحقّق مزدوج: المعرّف يطابق المحسوب، والاسم عربي.

## 12. التالي

**المرحلة 2 — Manifest V3 وهيكل الإضافة والصلاحيات** (`Opus 5`): سياسة الصلاحيات الدنيا،
`_locales` والاسم عبر `chrome.i18n`، الحقن اليدوي، كاشف الصفحات المقيّدة، `incognito: split`،
وCSP و`web_accessible_resources`.
