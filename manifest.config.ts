import { defineManifest } from '@crxjs/vite-plugin'

import pkg from './package.json' with { type: 'json' }
import { CHROMIUM_MIN_VERSION, FIREFOX_SETTINGS } from './scripts/target-manifest.ts'
import { PAGE_PATHS } from './src/shared/page-paths.ts'
import {
  extensionPagesCsp,
  OPTIONAL_HOST_PERMISSIONS,
  OPTIONAL_PERMISSIONS,
  REQUIRED_PERMISSIONS,
} from './src/shared/permission-policy.ts'

import type { BuildTarget } from './scripts/build-target.ts'

/**
 * بيان الإضافة — مصدر واحد مكتوب بـTypeScript، لا JSON يدوي.
 *
 * قرارات هذا الملف موثّقة في:
 *   Docs/ADR/permissions.md              — سبب كل صلاحية
 *   Docs/ADR/0005-manual-injection.md    — لماذا لا يوجد `content_scripts`
 *   Docs/ADR/0046-named-network-services.md — الاتّصال الخارجي الوحيد ولماذا
 *
 * القوائم تأتي من `src/shared/permission-policy.ts`، و`verify:dist` يقارن
 * البيان المبنيّ بها — فلا تتسلّل صلاحية بصمت.
 *
 * **بيانان من دالّة واحدة** (`Docs/Browsers/Architecture.md` §4.4): `buildManifest(target)`. خمسة مفاتيح
 * تفترق بين `chromium` و`firefox` — `background` و`minimum_chrome_version` و`browser_specific_settings` و`incognito`
 * و`use_dynamic_url` — وما سواها واحد. والتصدير الافتراضي بيان `chromium` كما كان حرفًا،
 * فبصمة حزمته لا تتغيّر (`tests/unit/build/manifest-targets.test.ts` يحرسه). بيانٌ واحد للاثنين مرفوض: مدقّق AMO
 * يحذّر من `service_worker`، وكل متجر يُقدَّم له بصفر تحذير.
 */

const ICONS = {
  16: 'icons/icon-16.png',
  32: 'icons/icon-32.png',
  48: 'icons/icon-48.png',
  128: 'icons/icon-128.png',
} as const

export function buildManifest(target: BuildTarget) {
  // قيمةٌ ليست هدفًا (من JS أو تحويل نوع) تُرفض لا تُحمَل على `chromium` صامتةً: بيانٌ خاطئ الهدف لا يُكتَشف إلا عند الرفع.
  if (target !== 'chromium' && target !== 'firefox') {
    throw new Error(`buildManifest: «${String(target)}» ليس هدف بناء — المسموح: chromium · firefox`)
  }
  const firefox = target === 'firefox'

  return defineManifest({
    manifest_version: 3,

    // الاسم والوصف عبر `chrome.i18n`؛ العربية هي لغة الأساس لا ترجمة.
    default_locale: 'ar',
    name: '__MSG_extName__',
    short_name: '__MSG_extShortName__',
    description: '__MSG_extDescription__',

    version: pkg.version,
    // `strict_min_version` في `gecko` أدناه مكافئه لـFirefox؛ و`minimum_chrome_version` لا معنى له فيه.
    ...(firefox ? {} : { minimum_chrome_version: CHROMIUM_MIN_VERSION }),

    icons: ICONS,

    action: {
      default_title: '__MSG_actionTitle__',
      default_icon: ICONS,
      default_popup: PAGE_PATHS.popup,
    },

    // Firefox لا يشغّل عمّال الخدمة في الإضافات ويطلب `scripts` (صفحة أحداث) — «background.service_worker is
    // currently disabled». CRXJS يقرأ `scripts[0]` في وضع `firefox` ويكتب المحمِّل و`type: "module"` بنفسه.
    background: firefox
      ? { scripts: ['src/background/index.ts'] }
      : { service_worker: 'src/background/index.ts', type: 'module' },

    // ── هوية Firefox ────────────────────────────────────────────────
    // `gecko.id` إلزامي للتوقيع في MV3، **ودائم**: لا يُغيَّر بعد أوّل توقيع (قرار المالك 2026-10-02، ويحرسه
    // `manifest-targets.test.ts`). `strict_min_version` 140 لأن موافقة جمع البيانات المضمَّنة تُعرض منه (وهي ESR 140).
    // `data_collection_permissions` إلزامي للإضافات الجديدة منذ 2025-11-03: لا شيء مطلوب، والاختياريان يقابلان
    // خدمتَي الإرسال بتأكيد المستخدم (ADR 0046). ولا يُشحن في بيان Chromium ما لا يقرؤه.
    ...(firefox ? { browser_specific_settings: FIREFOX_SETTINGS } : {}),

    // ── الصلاحيات ───────────────────────────────────────────────────
    // لا صلاحية مضيف دائمة: `activeTab` يكفي، ويُمنح بإيماءة المستخدم.
    // النتيجة أن التثبيت لا يعرض «قراءة وتغيير جميع بياناتك على المواقع».
    permissions: [...REQUIRED_PERMISSIONS],
    optional_permissions: [...OPTIONAL_PERMISSIONS],
    optional_host_permissions: [...OPTIONAL_HOST_PERMISSIONS],

    // ── لا `content_scripts` ────────────────────────────────────────
    // الحقن يدوي عبر `chrome.scripting` بعد `isInjectable()`. غياب هذا
    // المفتاح مقصود وهو أهم قرار خصوصية في المشروع — انظر ADR 0005.

    // ── الاختصارات ──────────────────────────────────────────────────
    // ثلاثة قيود من Chrome، لا قيدان:
    //   1. أربعة اختصارات مقترحة فقط. الأربعة هنا للالتقاط، وبقية الخريطة
    //      (⌥⇧I/M/C/D · ⌘K · ↑↓ · Esc) تُلتقط داخل الصفحة — المرحلة 6.
    //   2. مُعدِّل أساسي واحد فقط (Ctrl أو Alt أو Command أو MacCtrl) مع Shift
    //      اختياريًا. لذلك **‏⌥⌘F المصمَّمة في Figma مرفوضة** — Chrome يردّ
    //      «Invalid value for commands[..].mac». اعتُمد ⇧⌘ على macOS و
    //      Ctrl+Shift على غيرها: يحفظ تمييز التصميم بين اختصارات عامة
    //      بمُعدِّل النظام الأساسي، وأوضاع داخل الصفحة بـ⌥⇧.
    //   3. **قيد صامت لا يظهر في التوثيق ولا يرفضه مدقّق البيان، ومجموعته
    //      تختلف بين ماك وغيرها — لا قيدٌ واحد بل قيدان منفصلان.** بعض
    //      تركيبات ⇧⌘ محجوزة داخليًا فيتجاهلها Chrome بصمت — لا خطأ بناء،
    //      والاختصار يُسجَّل فارغًا وقت التشغيل فقط.
    //        • **ماك** (المرحلة 7، `scripts/verify-popup.mjs`): ⇧⌘F لـ«منطقة»
    //          سُجِّلت فارغة رغم قبول Chrome للبيان: A/C/D/F/G/R محجوزة (بحث
    //          التبويبات، إشارة الكلّ، إعادة تحميل متجاهلة الذاكرة المخبّأة،
    //          فحص العنصر، البحث السابق)، وT/W/Q/Y/U/O/Z حرّة. اعتُمد ⇧⌘T.
    //        • **لينكس/ويندوز** (الوحدة 20.2، عدّاء Linux حقيقي في CI — run
    //          34715964698): Ctrl+Shift+T نفسها محجوزة هناك لأمرٍ مختلف تمامًا
    //          («إعادة فتح التبويب المغلق») — Chrome يبني اختصاراته من جدول
    //          Views المشترَك بين لينكس وويندوز (`accelerator_table.cc`)، لا
    //          من جدول ماك المنفصل (`global_keyboard_shortcuts_mac.mm`)، فقائمة
    //          المحجوز تفترق أصلًا لا مصادفةً. وT محجوزة هناك بينما W محجوزة
    //          كذلك (اختُبرت معًا في الجولة نفسها) — Q وY وU سُجِّلت جميعًا
    //          باختصار فعلي. اعتُمد Ctrl+Shift+**Q** — أوّل حرف حرّ مقيسًا، بلا
    //          صلة إيحائية، تمامًا كما حُسم T على ماك. **غير مقيس على ويندوز
    //          فعليًّا** — لا عدّاء Windows في `ci.yml` اليوم؛ الاستدلال أعلاه
    //          (جدول Views المشترك) سببٌ معلَّل لا قياسٌ مباشر، وهذا الفرق
    //          مُعلَنٌ لا مُخفى (`Docs/Engineering.md §6` صفّ 99).
    commands: {
      'capture-area': {
        suggested_key: { default: 'Ctrl+Shift+Q', mac: 'Command+Shift+T' },
        description: '__MSG_cmdCaptureArea__',
      },
      'capture-element': {
        suggested_key: { default: 'Ctrl+Shift+E', mac: 'Command+Shift+E' },
        description: '__MSG_cmdCaptureElement__',
      },
      'capture-viewport': {
        suggested_key: { default: 'Ctrl+Shift+V', mac: 'Command+Shift+V' },
        description: '__MSG_cmdCaptureViewport__',
      },
      'capture-full-page': {
        suggested_key: { default: 'Ctrl+Shift+S', mac: 'Command+Shift+S' },
        description: '__MSG_cmdCaptureFullPage__',
      },
    },

    // ── الموارد المتاحة للصفحة المضيفة ──────────────────────────────
    // الطبقة داخل الصفحة تحتاج خطوطها وأيقوناتها وورقة التوكنز من أصل
    // الإضافة. `use_dynamic_url` يمنع المواقع من التبصيم بمعرّف ثابت.
    // أنماط لا أسماء صريحة: CRXJS يشترط وجود الملف المسمّى وقت البناء،
    // وورقة التوكنز والخطوط تصل في المرحلتين 4 و6. النمط يستقبلها بلا
    // تعديل البيان لاحقًا.
    web_accessible_resources: [
      {
        resources: ['assets/fonts/*', 'assets/overlay/*', 'assets/*.css'],
        matches: ['<all_urls>'],
        // Firefox: بلا معنى — مضيف `moz-extension://<UUID>` عشوائي لكل تثبيت أصلًا، وCRXJS يحذفه.
        ...(firefox ? {} : { use_dynamic_url: true }),
      },
    ],

    // ── سياسة أمن المحتوى ───────────────────────────────────────────
    // بلا `unsafe-eval` وبلا سكربت خارجي. `connect-src` على الإضافة وعلى
    // الخدمات المسمّاة في `NETWORK_SERVICES` وحدها (ADR 0046) — والسياسة
    // مبنيّة من تلك القائمة لا مكتوبة هنا، فلا يفترق البيان عن مخرج الشبكة.
    content_security_policy: {
      extension_pages: extensionPagesCsp(),
    },

    // نسخة منفصلة تمامًا في التصفّح الخاص — لا تسرّب بين السياقين.
    // Firefox لا يعرف `split` ويثبّته `not_allowed` ويحذّر المدقّق؛ فيُكتب `not_allowed` صريحًا لا ضمنًا (الافتراضي
    // `spanning`). نموذج التصفّح الخاص فيه مرحلةٌ لاحقة (SS4)، ولا يُشحَن ما لم يُقَس.
    incognito: firefox ? 'not_allowed' : 'split',
  })
}

/** بيان `chromium` — الهدف الافتراضي، وما يقرؤه من لا يعرف الأهداف (الاختبارات). */
export default buildManifest('chromium')
