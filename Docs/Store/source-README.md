# رصد — إعادة بناء الإضافة من المصدر

هذا الأرشيف هو الشيفرة المصدرية الكاملة لإضافة **رصد** كما هي في الالتزام الموسوم، مع ملفّ القفل `pnpm-lock.yaml`. الحزمة
المرفوعة إلى المتجر مصغَّرة (Vite/Rolldown)، وما يلي يعيد بناءها **بايتًا ببايت**: البناء حتميّ، وبصمة SHA-256 للحزمة دالّة
المحتوى وحده.

Rasd is a browser extension (Chrome, Edge, Firefox, Opera). This archive is the complete source of the tagged commit. The
shipped bundle is minified (no obfuscation); the steps below rebuild it byte-for-byte.

## البيئة

| البند        | القيمة                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------- |
| نظام التشغيل | Ubuntu 24.04 أو macOS؛ لا أداة نظام تدخل في المخرَج                                               |
| Node         | الإصدار المكتوب في `.nvmrc` (24.x) — `nvm install && nvm use`                                     |
| مدير الحزم   | pnpm بالنسخة المثبَّتة في حقل `packageManager` في `package.json` — `corepack enable` يختارها وحده |
| الشبكة       | لـ`pnpm install` وحده؛ البناء نفسه بلا شبكة                                                       |

## الأوامر

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm build:all            # dist/ لـChromium (Chrome وEdge وOpera) و dist-firefox/ لـFirefox، وكلٌّ بفحص verify:dist
pnpm zip                  # dist-zip/rasd-<النسخة>.zip              + .sha256
pnpm zip:firefox          # dist-zip/rasd-<النسخة>-firefox.zip      + .sha256  (بعد web-ext lint)
shasum -a 256 -c dist-zip/*.sha256   # أو sha256sum -c على لينكس
```

البصمتان الناتجتان تطابقان بصمتَي الحزمتين المرفوعتين (`rasd-<النسخة>.zip` و`rasd-<النسخة>-firefox.zip`) ببايتاتهما.
البناء لا يقرأ تاريخ Git ولا الساعة ولا مسار المجلّد ولا اسم الجهاز، فلا حاجة إلى `.git` لإعادة البناء.

## ما بُني وكيف

- **الشيفرة** في `src/`: TypeScript وPreact. نقطة الدخول بيان الإضافة `manifest.config.ts` (يولّده `@crxjs/vite-plugin`)،
  والهدف يُختار بالمتغيّر `RASD_TARGET` (`chromium` الافتراضي، أو `firefox`) — `pnpm build:firefox` يضبطه.
- **المخرَج** `dist/` و`dist-firefox/`. البيانان يختلفان بخمسة مفاتيح لا غير (الخلفية، `browser_specific_settings`،
  `incognito`…)، و`content.js` بايتاتٌ واحدة فيهما.
- **التصغير** بالأداة نفسها في الهدفين (`vite build`)؛ لا تمويه ولا تحويل نصّي لاحق.
- **الاعتماديات** كلّها مثبَّتة النسخة في `package.json` و`pnpm-lock.yaml`؛ وتراخيصها في `THIRD_PARTY_LICENSES.txt` داخل الحزمة.
- **الأيقونات والخطوط** في `public/` و`licenses/` مضمَّنة في هذا الأرشيف.

## مدقّق الإضافات (`web-ext lint`)

```bash
pnpm exec web-ext lint --source-dir dist-firefox
```

صفر خطأ. وتحذيران مقبولان من النوع `UNSAFE_VAR_ASSIGNMENT` (إسناد إلى `innerHTML`): كلاهما لأيقونات **SVG ثابتة** مكتوبة في
المصدر (علامة رصد وأيقونات الواجهة)، لا يصل إليها نصٌّ من الصفحة ولا من المستخدم. موضعاهما: `content.js` وقطعة
`assets/RasdMark-*.js`. وتحذيرٌ ثالث أو من نوعٍ آخر يُسقط `pnpm zip:firefox`.

## ملاحظات

- لا شبكة وقت التشغيل إلا بتأكيد المستخدم (إرسال البلاغ وإنشاء المشكلة على GitHub).
- هذا README مرافق للحزمة فقط، ولا يدخل الحزمة الناتجة.

## بيئة المراجع

بيئة مراجعي AMO الافتراضية: Ubuntu 24.04 (ARM64) وNode 24.14.0 وnpm 11.9.0. وبيئتنا Node من `.nvmrc` (24.16.0) وpnpm بالنسخة
المثبَّتة في `package.json` — **تختلف في رقم التحديث الأخير**، وهذا تنبيه المراجعين كما تطلب إرشادات AMO. المقيس (2026-10-02، macOS
arm64):

- بـNode 24.16.0 (`.nvmrc`): `pnpm zip` و`pnpm zip:firefox` يعطيان البصمتين المرفوعتين.
- بـNode 24.14.0: البناء نفسه يعطي مجلّدَي `dist/` و`dist-firefox/` **متطابقين بالبايت** مع بناء 24.16.0، وبصمة `pnpm zip` هي نفسها؛ لكنّ
  `web-ext lint` — خطوة `pnpm zip:firefox` — **ينهار بإشارة SIGBUS** على هذا العتاد (Apple M4) فلا تكتمل الحزمة. فإن لم يعمل لديك
  فاستعمل Node من `.nvmrc` (`nvm install && nvm use`) لهذه الخطوة؛ ولا يتأثّر المخرَج بالإصدار.
