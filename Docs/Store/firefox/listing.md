# قائمة Firefox Add-ons (AMO)

> ما يُلصق في لوحة addons.mozilla.org عند التقديم ([SS10](../../SS/stages/SS10.md)). **لا نسخة ثانية من الوصف:** الوصف
> الطويل بلغتيه هو نفسه في [`../listing.md`](../listing.md) (يُلصق من هناك كما هو)، فلا ينحرف نصّان عن بعضهما. وهنا
> ما يخصّ AMO وحده: الملخّص 250، والفئتان، والرخصة، وإفصاح البيانات، وملاحظات المراجع. المتطلّبات مقروءة من مصادرها
> يوم 2026-10-02 في [`../checklist.md`](../checklist.md) (قسم AMO)، وحدودها يحرسها
> `tests/unit/store-materials.test.ts`. **التقديم نفسه بأمر المالك وحده** (SS10).

## الهوية

| الحقل             | القيمة                                                                                                           |
| ----------------- | ---------------------------------------------------------------------------------------------------------------- |
| الاسم             | `رصد` بالعربية · `Rasd` بالإنجليزية — من `public/_locales/*/messages.json` (`extName`)                           |
| معرّف الإضافة     | `rasd@bysltan.com` — **دائم** (قرار المالك 2026-10-02)، يحرسه `tests/unit/build/manifest-targets.test.ts`        |
| الحدّ الأدنى      | Firefox 140 (ESR 140) — لأن الموافقة المضمَّنة على جمع البيانات تُعرض منه                                        |
| الحزمة            | `rasd-<النسخة>-firefox.zip` + `rasd-<النسخة>-source.zip` (من مسوَّدة الإصدار بعد مطابقة البصمتين)                |
| اللغة الأساسية    | العربية (`default_locale: "ar"`)، ومعها الإنجليزية                                                               |
| الموقع (Homepage) | `https://www.bysltan.com` — يعيد 200؛ ويُستبدل بصفحة رصد حين تُنشر ([`../owner-pages.md`](../owner-pages.md))    |
| الدعم (Website)   | `https://www.bysltan.com/rasd/support` — **⏳ المالك** (يعيد 404 اليوم)                                          |
| الدعم (Email)     | `isultanby@gmail.com` — البريد الرسمي لرصد (قرار المالك 2026-10-02)؛ AMO يعرضه علنًا في القائمة                  |
| سياسة الخصوصية    | `https://www.bysltan.com/rasd/privacy` — **⏳ المالك**، ونصّها في [`../privacy-policy.md`](../privacy-policy.md) |
| الاسم المستعار    | رابط الإضافة (slug): `rasd`                                                                                      |
| تجريبية؟          | لا                                                                                                               |
| مدفوعة/خدمات؟     | لا — مجّانية بلا شراء داخلها ولا اشتراك                                                                          |

## الملخّص — Summary (250 حرفًا على الأكثر)

```text summary-en
Rasd is a visual inspection tool for people who build and review web interfaces: measure, inspect, compare with a reference and capture the active page, then keep your work in a library on your device. No account, no server. Arabic-first.
```

```text summary-ar
رصد أداة فحص بصري لمن يبني واجهات الويب ويراجعها: قِس وافحص وقارن بمرجع والتقط الصفحة التي تعمل عليها، واحفظ عملك في مكتبة على جهازك. بلا حساب ولا خادم. واجهة عربية من اليمين إلى اليسار.
```

## الوصف — Description

يُلصق **الوصف الطويل من [`../listing.md`](../listing.md)** (قسما «الوصف الطويل — العربية» و«Long description — English») كما هو،
ثمّ تُلحَق به فقرة Firefox أدناه في آخره. الوصف لا يسمّي متصفّحًا آخر، فيصلح هنا بلا تعديل.

```text firefox-note-en
Firefox: Rasd does not run in private windows. Optional connections (GitHub, "Report a problem") ask Firefox's built-in data-collection permission the first time you send something, and you can withdraw it at any time from the add-on's Permissions page.
```

```text firefox-note-ar
في Firefox: لا تعمل رصد في النوافذ الخاصّة. والاتّصالان الاختياريان (GitHub و«أبلغ عن مشكلة») يطلبان إذن جمع البيانات المضمَّن في Firefox عند أوّل إرسال، ويمكنك سحبه في أي وقت من صفحة أذونات الإضافة.
```

## الفئات

| المنصّة              | الفئتان (حتى اثنتين)                         | المصدر                                                              |
| -------------------- | -------------------------------------------- | ------------------------------------------------------------------- |
| Firefox (سطح المكتب) | `Web Development` · `Photos, Music & Videos` | `https://addons.mozilla.org/api/v5/addons/categories/` (2026-10-02) |
| Firefox for Android  | الفئتان نفسهما إن طلبتهما اللوحة             | البيان يعلن `gecko_android` بحدّ أدنى 142 فتسأل عنها اللوحة         |

الأولى لأن الإضافة أداة فحص لمن يبني الواجهات؛ والثانية لأن الالتقاط والتعليق على الصور من وظائفها الرئيسية. **أندرويد لم يُجرَّب ولا
يُدَّعى** (`Docs/Launch/browsers.json` لا يسجّله): إعلانه في البيان لمنع تحذير المدقّق، وقرار بقائه أو إزالته في SS9.

## الرخصة وEULA

- **الرخصة (قائمة اللوحة): All Rights Reserved** — تطابق `"license": "UNLICENSED"` في `package.json` وREADME («جميع الحقوق محفوظة»)،
  ولا ملفّ رخصة في المستودع. ومصدر الحزمة المرفوع للمراجعين لا يُنشر ([`../source-README.md`](../source-README.md)).
- **EULA:** AMO يدعم نصّ اتفاقية مستخدم مخصّصًا (حقل `has_eula` في واجهته البرمجية). **قرار المالك 2026-10-02: تُكتب EULA خاصّة برصد** —
  النصّ الإنجليزي `eula-en` في [`../eula.md`](../eula.md) يُلصق في حقل EULA في لوحة الإضافة عند التقديم (SS10)،
  والعربي مرجعيّ للمالك. وهي مبنيّة على الرخصة نفسها فلا تناقضها.
- **لا يُرسَل شيء إلى AMO الآن.** مراجعة النصّ قانونيًّا بيد المالك قبل SS10.

## إفصاح البيانات — `data_collection_permissions`

يُقرأ من البيان نفسه (`manifest.config.ts` ← `FIREFOX_SETTINGS`) ويحرس التطابقَ الاختبارُ. لا يُشحن في بيان Chromium.

| الحقل      | القيمة                    | ما يقابله                                                                                                 |
| ---------- | ------------------------- | --------------------------------------------------------------------------------------------------------- |
| `required` | `none`                    | لا يُجمع شيء ليعمل رصد: «الوضع المحلّي فقط» افتراضي ولا يخرج منه طلب شبكة واحد                            |
| `optional` | `technicalAndInteraction` | معلومات تشخيص «أبلغ عن مشكلة»: إصدار رصد والنظام والمتصفّح ومحرّكه وهدف البناء ومصدر التثبيت ولغة الواجهة |
| `optional` | `websiteContent`          | صورة يرفقها المستخدم ببلاغ (بعد حجب ما يريد)، وما يرسله هو إلى GitHub من محتوى صفحة                       |

الإذن يُطلب بـ`permissions.request({ data_collection })` عند أوّل إرسال وبعد أن يرى المستخدم «ما سيُرسَل بالضبط»
(`src/modules/report`، SS6). والمطابقة مع [`Docs/Privacy.md`](../../Privacy.md) ومع [`../listing.md`](../listing.md) «ممارسات البيانات».

## ملاحظات المراجع — Notes to Reviewer

تُلصق في حقل «Notes for Reviewers» كما هي:

```text reviewer-notes
SOURCE AND BUILD
The package is minified by Vite (Rolldown), not obfuscated. The full source of the tagged commit is attached as rasd-<version>-source.zip, with pnpm-lock.yaml. Its root SOURCE-README.md lists the environment (Ubuntu 24.04 or macOS, Node from .nvmrc = 24.x, pnpm via corepack) and the commands:
  corepack enable && pnpm install --frozen-lockfile && pnpm build:all && pnpm zip && pnpm zip:firefox
The build is deterministic: it produces rasd-<version>-firefox.zip byte for byte (same SHA-256 as the uploaded package; the .sha256 file is in the release). The network is needed only for pnpm install.

WEB-EXT LINT
web-ext lint reports no errors and exactly two UNSAFE_VAR_ASSIGNMENT warnings (innerHTML), in content.js and in the assets/RasdMark-*.js chunk. Both come from a single file, src/ui/icons/Icon.tsx: it assigns the markup of a built-in icon from icon-data.ts, a static SVG table generated at build time from the design file (pnpm icons:sync). No page text, user text or network data reaches it. A test (tests/unit/html-sinks.test.ts) fails the build if any other innerHTML/eval-like sink appears in src/.

NO REMOTE CODE
CSP is script-src 'self'; object-src 'self'. No external script, no eval, no new Function. connect-src is the extension itself plus two optional service origins (api.github.com and the developer's report endpoint).

TESTING
No account is needed. Open any https page, click the Rasd toolbar button and choose a tool (Measure, Inspect, Colour, Compare, Capture). Captures open in the editor and appear in the Library (popup > Library). The interface is Arabic (right to left).

DATA
"Local only" is on by default and the extension then makes no network request. Two optional features need it turned off (Settings > Privacy): "Report a problem" (Settings > About) sends a reviewed report to the developer's support endpoint https://app-reports.isultantf.workers.dev, which is live — reports from reviewers are welcome and are not published; and the GitHub integration (Settings > Integrations) needs the reviewer's own personal access token and only opens an issue in a repository the user chooses. data_collection_permissions: required none; optional technicalAndInteraction and websiteContent, requested with permissions.request when something is first sent.

PERMISSIONS
Permanent: activeTab, scripting, storage, unlimitedStorage, contextMenus, alarms — justified one by one in the listing. Optional (requested from a user gesture): downloads, <all_urls> per site, and the two service origins. No permanent host permission and no content_scripts: injection happens only after a user gesture through activeTab.

PRIVATE WINDOWS
incognito is "not_allowed" for Firefox (the manifest key is "not_allowed" on this target), so Rasd does not run in private windows.
```

مبرّرات كل صلاحية بحقولها الإنجليزية في [`../permissions.md`](../permissions.md) — AMO لا يسأل عنها حقلًا حقلًا، لكن المراجع يقرؤها.

## الصور

| المادة   | الملفّ                                                                    | المقاس                | المصدر والملاحظة                                                                                                    |
| -------- | ------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------- |
| الأيقونة | [`Docs/Launch/icons/amo-icon-64.png`](../../Launch/icons/amo-icon-64.png) | 64×64                 | من المتّجه `Docs/Brand/svg/rasd-icon-idle.svg` بحجمها؛ يملأ مربّعها كأيقونة الشريط. والمصدر المتّجه نفسه صالح للرفع |
| اللقطات  | [`Docs/Launch/screens/`](../../Launch/screens/) — `ar-01…` و`en-01…`      | 1280×800 (النسبة 1.6) | نفسها لـChrome وEdge؛ لا حدّ لعددها عند AMO، ويُرفع منها 01–05 كقائمة Chrome                                        |

## ما لا يُنفَّذ هنا

التقديم والتوقيع وحساب Mozilla ومفتاحا API: SS10 وبأمر المالك وحده.
