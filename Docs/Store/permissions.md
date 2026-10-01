# مبرّرات الصلاحيات — لحقول «Permission justification» في المتجرين

> صفٌّ لكل صلاحية في البيان، مأخوذةً من [`src/shared/permission-policy.ts`](../../src/shared/permission-policy.ts) بعد
> [`STAGES/23`](../../STAGES/23.md) ([ADR 0055](../ADR/0055-permission-consumers.md)). العمود الإنجليزي يُلصق في لوحة
> المتجر كما هو، والعربي هو النصّ الذي يراه المستخدم في شاشة الصلاحيات (`REQUIRED_PERMISSION_RATIONALE` و
> `OPTIONAL_PERMISSION_RATIONALE` و`HOST_PERMISSION_RATIONALE` و`NETWORK_SERVICES[].purpose`). والمستهلك يطبعه
> `pnpm verify:dist` باسم ملفّه، فصلاحيةٌ بلا مستهلك تُسقط البناء قبل أن تصل هنا.
>
> **يحرسه `tests/unit/store-materials.test.ts`:** صلاحيةٌ في السياسة بلا صفٍّ هنا، أو صفٌّ لصلاحيةٍ لم تعد في
> السياسة، يُسقطه. والمرجع المعماري الكامل لكلٍّ وسببه وتحذير تثبيته في [`Docs/ADR/permissions.md`](../ADR/permissions.md).

**تحذير التثبيت: لا شيء.** قِيس في Edge 154 على الحزمة المفكوكة نفسها: «لا يتطلب هذا الملحق أي أذونات خاصة»
([`evidence/edge-load.png`](evidence/edge-load.png))، و`pnpm verify:load` يقرأ من Chrome صفر صلاحية مضيف ممنوحة.

## الدائمة

| الصلاحية           | Justification (EN — يُلصق في اللوحة)                                                                                                                                                                                                             | ما يراه المستخدم                                                                                                                   | المستهلك في الحزمة                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `activeTab`        | Rasd works only on the tab where the user clicks the toolbar icon, a context-menu item or a keyboard shortcut. activeTab grants that one tab for that gesture, so the extension needs no host permission on any site.                            | للعمل على التبويب النشط بعد إيماءة صريحة منك — بديل صلاحية الوصول الدائم لكل المواقع.                                              | `chrome.tabs.captureVisibleTab` في `capture-service.ts` |
| `scripting`        | Injects Rasd's inspection overlay (measure, inspect, colour, compare tools) into the active tab after the user's gesture, or re-injects the reference overlay after a reload on a site the user granted. There are no automatic content scripts. | لحقن أدوات الفحص عند طلبك، أو في موقعٍ أذنتَ له.                                                                                   | `chrome.scripting.executeScript` في `commands.ts`       |
| `storage`          | Stores the user's settings, the library-lock state and, only if the user connects GitHub, an AES-GCM-encrypted token — all on the device. Nothing is written to sync storage.                                                                    | لحفظ إعداداتك وحالة قفل المكتبة ورمز GitHub مشفَّرًا، على جهازك.                                                                   | `chrome.storage.local` و`session` في `shared/settings/` |
| `unlimitedStorage` | The capture library (screenshots, projects, palettes, references) lives in IndexedDB on the device. Without this permission the browser may evict it under quota pressure and delete the user's work.                                            | لحفظ مكتبة لقطاتك على جهازك بلا سقف حصّة يفرضه المتصفّح عليها.                                                                     | `indexedDB.open` في `shared/storage/db.ts`              |
| `contextMenus`     | Offers Rasd's capture and inspection tools from the right-click menu, as an alternative to the toolbar popup.                                                                                                                                    | لإتاحة أدوات رصد من قائمة الزر الأيمن.                                                                                             | `chrome.contextMenus.create` في `context-menus.ts`      |
| `alarms`           | A watchdog ends long capture jobs that stall when the service worker is suspended, and an optional cleanup removes old captures after the period the user chose (7, 30 or 90 days). Timers do not survive service-worker suspension; alarms do.  | حارسٌ ينهي المهام الطويلة المعلَّقة، وكنّاسٌ ينفّذ «حذف السجلّ تلقائيًا» — كلاهما بديل مؤقّتات لا تنجو من إيقاف الـservice worker. | `chrome.alarms.create` في `lifecycle.ts`                |

## الاختيارية — تُطلب من إيماءة المستخدم، وتُسحب من صفحة الإضافات

| الصلاحية                                      | Justification (EN — يُلصق في اللوحة)                                                                                                                                                                                      | ما يراه المستخدم                                                                                               | المستهلك في الحزمة                                 |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `downloads`                                   | Requested the first time the user saves an export (PNG, PDF, guide, handoff package) to a folder they choose. If declined, the file still downloads to the default folder.                                                | لحفظ اللقطات والتقارير في مجلّد التنزيلات باسم تختاره.                                                         | `chrome.downloads.download` في `capture-mirror.ts` |
| `<all_urls>`                                  | Optional host access requested for one site at a time, only when the user wants a comparison reference to stay on the page after it reloads. Declining keeps the reference for the current session only.                  | لإبقاء مرجع المقارنة فوق الصفحة بعد إعادة تحميلها — تُطلب لموقع واحد عند الحاجة، لا لكل المواقع.               | `background/resume.ts`                             |
| `https://api.github.com/*`                    | Requested only when the user turns off local-only mode, connects their own GitHub token and confirms opening an issue in a repository they choose. The user reviews the exact content before it is sent.                  | لفتح Issue في مستودعك على GitHub حين تؤكّد ذلك — بعد أن تتّصل بنفسك وتوقف «الوضع المحلّي فقط».                 | `modules/export/integrations/github.ts`            |
| `https://app-reports.isultantf.workers.dev/*` | Requested only when the user turns off local-only mode and presses "Send report" in "Report a problem", after reviewing exactly what will be sent. It is the developer's support endpoint; nothing is sent automatically. | لإرسال بلاغ مشكلة إلى جهة الدعم حين تراجعه وتؤكّده — بعد أن توقف «الوضع المحلّي فقط». لا يُرسَل شيء تلقائيًّا. | `modules/report/client.ts`                         |

## ما لا تطلبه رصد

لا `tabs` ولا `history` ولا `cookies` ولا `webRequest` ولا `debugger` ولا `content_scripts` تلقائية — والمحظورة كلّها
في `FORBIDDEN_PERMISSIONS` يُسقط `pnpm verify:dist` بناءً يحملها.

## Remote code

**No, I am not using remote code.** سياسة أمن المحتوى في البيان `script-src 'self'; object-src 'self'` بلا
`unsafe-eval`، ولا سكربت خارجي في أيّ صفحة، و`connect-src` على الإضافة والخدمتين المسمّاتين وحدهما — يطابقه
`pnpm verify:dist` حرفًا. والاتّصالان المسمّيان يرسلان بيانات ولا يجلبان شيفرة.
