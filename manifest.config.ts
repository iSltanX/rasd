import { defineManifest } from '@crxjs/vite-plugin'

import pkg from './package.json' with { type: 'json' }
import { PAGE_PATHS } from './src/shared/page-paths.ts'
import {
  OPTIONAL_HOST_PERMISSIONS,
  OPTIONAL_PERMISSIONS,
  REQUIRED_PERMISSIONS,
} from './src/shared/permission-policy.ts'

/**
 * بيان الإضافة — مصدر واحد مكتوب بـTypeScript، لا JSON يدوي.
 *
 * قرارات هذا الملف موثّقة في:
 *   Docs/ADR/permissions.md              — سبب كل صلاحية
 *   Docs/ADR/0005-manual-injection.md    — لماذا لا يوجد `content_scripts`
 *
 * القوائم تأتي من `src/shared/permission-policy.ts`، و`verify:dist` يقارن
 * البيان المبنيّ بها — فلا تتسلّل صلاحية بصمت.
 */

const ICONS = {
  16: 'icons/icon-16.png',
  32: 'icons/icon-32.png',
  48: 'icons/icon-48.png',
  128: 'icons/icon-128.png',
} as const

export default defineManifest({
  manifest_version: 3,

  // الاسم والوصف عبر `chrome.i18n`؛ العربية هي لغة الأساس لا ترجمة.
  default_locale: 'ar',
  name: '__MSG_extName__',
  short_name: '__MSG_extShortName__',
  description: '__MSG_extDescription__',

  version: pkg.version,
  minimum_chrome_version: '116',

  icons: ICONS,

  action: {
    default_title: '__MSG_actionTitle__',
    default_icon: ICONS,
    default_popup: PAGE_PATHS.popup,
  },

  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },

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
  //   3. **قيد صامت لا يظهر في التوثيق ولا يرفضه مدقّق البيان**: بعض
  //      تركيبات ⇧⌘ محجوزة داخليًا فيتجاهلها Chrome بصمت — لا خطأ بناء،
  //      والاختصار يُسجَّل فارغًا وقت التشغيل فقط. اكتُشف هذا تجريبيًا في
  //      المرحلة 7 (`scripts/verify-popup.mjs`) حين ظهر ⇧⌘F لـ«منطقة»
  //      فارغًا رغم قبول Chrome للبيان: A/C/D/F/G/R كلها محجوزة (تُصادف
  //      اختصارات Chrome الفعلية: بحث التبويبات، إشارة الكل، إعادة تحميل
  //      متجاهلة الذاكرة المخبّأة، فحص العنصر، البحث السابق)، وT/W/Q/Y/U/O/Z
  //      حرّة. اعتُمد ⇧⌘T — بلا صلة إيحائية بالإنجليزية كسابقاتها؛ الحرف
  //      المتاح حسمه لا اختيار تصميمي.
  commands: {
    'capture-area': {
      suggested_key: { default: 'Ctrl+Shift+T', mac: 'Command+Shift+T' },
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
      use_dynamic_url: true,
    },
  ],

  // ── سياسة أمن المحتوى ───────────────────────────────────────────
  // بلا `unsafe-eval` وبلا مصادر خارجية. الصفحة المضيفة تُعامَل كمصدر
  // غير موثوق، وصفحاتنا لا تحمّل شيئًا من الشبكة.
  content_security_policy: {
    extension_pages: "script-src 'self'; object-src 'self'; connect-src 'self'",
  },

  // نسخة منفصلة تمامًا في التصفّح الخاص — لا تسرّب بين السياقين.
  incognito: 'split',
})
