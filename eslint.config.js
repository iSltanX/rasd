import js from '@eslint/js'
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript'
import importX from 'eslint-plugin-import-x'
import globals from 'globals'
import tseslint from 'typescript-eslint'

/**
 * حدود المعمار — القاعدة الوحيدة غير القابلة للتفاوض في هذا الملف.
 *
 * تُفرض آليًا لأن خرقها لا يُكتشف بالمراجعة البشرية: استيراد واحد خاطئ
 * يجرّ حزمة الواجهة كاملة إلى الـcontent script ويكسر ميزانية المرحلة 24.
 *
 * تُصدَّر لأن `tests/unit/architecture-boundaries.test.ts` يفحص القاعدة
 * المطبَّقة فعلًا لا نسخة منها.
 */
export const architectureZones = [
  {
    target: './src/modules',
    from: './src/ui',
    message: 'modules/ منطق خالص ولا يعرف الواجهة. أرجِع بيانات، ولا تستورد من ui/.',
  },
  /*
   * `modules/` منطق خالص فوق `shared/` وحدها.
   *
   * أُضيفت في المرحلة 8، وهي أوّل مرحلة تملأ `modules/`: كتابة أوّل وحدة
   * كشفت أن القاعدة السابقة تمنع `ui/` وتسمح بـ`content/` — أي تسمح لمنطق
   * خالص أن يعتمد على طبقة تشغيل. هذا ما دفع مفردات الإحداثيات من
   * `content/coords.ts` إلى `shared/geometry.ts`.
   */
  ...['content', 'background', 'offscreen', 'pages', 'tokens', 'workers'].map((layer) => ({
    target: './src/modules',
    from: `./src/${layer}`,
    message: `modules/ منطق خالص ولا يعتمد على طبقة تشغيل. انقل ما تحتاجه إلى shared/ بدل الاستيراد من ${layer}/.`,
  })),
  {
    target: './src/content',
    from: './src/pages',
    message: 'content/ يعمل داخل صفحة طرف ثالث ولا يجرّ حزمة صفحات الإضافة. استخدم shared/.',
  },
  /*
   * `ui/` بدائيّات عرض — لا تعرف طبقة تشغيل استدعتها، ومنها `content/`
   * تحديدًا. كانت فجوة حقيقية لا قاعدة مفقودة سهوًا: `ReferenceOverlay.tsx`
   * (المرحلة 16) استورد نوعًا من `content/tools/compare.ts` فمرّ اللنت بلا
   * اعتراض رغم أن تعليق `shared/geometry.ts` يُسمّي الاتجاه نفسه «عكسًا
   * لاتجاه الاعتماد الصحيح» منذ المرحلة 8 — الأنواع نُقلت إلى
   * `modules/compare/overlay.ts` والقاعدة هنا أُضيفت معًا كي لا يتكرّر
   * تمريرها آليًا ثانيةً.
   */
  {
    target: './src/ui',
    from: './src/content',
    message: 'ui/ بدائيّات عرض ولا تعرف طبقة تشغيل. انقل الأنواع المشتركة إلى modules/ أو shared/.',
  },
  /*
   * **ملكية التخزين الدائم: الخلفية وصفحات الإضافة وحدها.**
   *
   * سكربت المحتوى يعمل بأصل الصفحة المزارة، فـ`indexedDB` عنده قاعدة
   * **الموقع** لا قاعدة رصد. قِيس: `location.origin` هناك هو الموقع،
   * و`indexedDB.databases()` فارغة. فكل كتابة «تنجح» في المكان الخطأ —
   * وهو ما وقع فعلًا للمراجع (الصفّ 78 في `Rasd_Plan.md §6`).
   *
   * **وهذا حارس النيّة لا حارس الواقع**: يمسك الاستيراد المباشر وحده،
   * وكان العطل عابرًا (`content ← modules/compare/reference ← storage`)
   * فمرّ من كل حلقة مشروعة منفردةً. حارسه الحقيقي فحصُ الحزمة المبنية في
   * `scripts/verify-dist.mjs` — والاثنان معًا كما يفرض القسم 2 من الدستور.
   */
  ...['db', 'repository', 'migrations', 'quota'].map((module) => ({
    target: './src/content',
    from: `./src/shared/storage/${module}.ts`,
    message:
      'التخزين الدائم تملكه الخلفية وحدها — سكربت المحتوى يرى قاعدة الموقع المزار لا قاعدة رصد. مرّ عبر رسالة في contract.ts.',
  })),
  // shared/ طبقة قاعدية: لا تستورد من أي طبقة أعلى منها.
  ...['background', 'content', 'offscreen', 'pages', 'modules', 'ui', 'tokens', 'workers'].map(
    (layer) => ({
      target: './src/shared',
      from: `./src/${layer}`,
      message: `shared/ طبقة قاعدية ولا يستورد من ${layer}/ ولا من أي طبقة أعلى.`,
    }),
  ),
  /*
   * `workers/` طبقة تشغيل رابعة — تُفتح في المرحلة 15، لا في 14.
   *
   * ADR 0014 يفترض أن المرحلة 14 أوّل من ينشئ `src/workers/`، وترتيب
   * ADR 0013 ينقضه: الترتيب المعتمد `13 ← 15 ← 18 ← 16 ← 17 ← 14`. فالمرحلة
   * 15 هي الأولى، وترث التزاماته كاملةً — وأوّلها أن تُكتب القاعدة **قبل**
   * أوّل ملفّ يسكنها لا بعده، وأن تُختبَر بشجرة عيّنات: «قاعدة حدود مكتوبة
   * على طبقة فارغة غير مُختبَرة ادّعاء لا برهان».
   *
   * والـworker يستورد `modules/` و`shared/` وحدهما: لا واجهة ولا طبقة
   * تشغيل أخرى. وهذا ما يجعله ناقلًا لخوارزمية خالصة لا مالكًا لها.
   */
  ...['ui', 'content', 'background', 'offscreen', 'pages', 'tokens'].map((layer) => ({
    target: './src/workers',
    from: `./src/${layer}`,
    message: `workers/ يعمل في خيط بلا DOM ولا chrome.* — يستورد modules/ وshared/ وحدهما، لا ${layer}/.`,
  })),
]

/**
 * محدِّدات `no-restricted-syntax` — **مصفوفة مُصدَّرة لا قائمة سطرية**.
 *
 * السابقة الوحيدة للاستثناء في هذا الملفّ كانت إطفاء القاعدة كاملةً على
 * ملفّ (`src/shared/messaging/*.ts`)، وهي مقبولة هناك لأن ذلك الملفّ **هو**
 * طبقة الرسائل. لكنها لا تصلح لمن يحتاج استثناء **محدِّد واحد**: إطفاء
 * القاعدة على `background/image-ops.ts` يُفقده حراسة `chrome.runtime.*`
 * والخصائص الفيزيائية و`formatHuman` معًا.
 *
 * فتُبنى القائمة من ثابتين: ما يسري على الجميع، ومحدِّد الترميز الذي
 * يُستثنى منه ملفّان بعينهما. والاستخراج يجعل الاستثناء **طرحًا معلنًا** لا
 * إطفاءً شاملًا، ويجعل `architecture-boundaries.test.ts` يفحص القاعدة
 * المطبَّقة فعلًا لا نسخة منها.
 */
export const restrictedSyntax = [
  {
    selector: "NewExpression[callee.name='Function']",
    message: 'ممنوع في MV3 — سياسة أمن المحتوى تمنع تنفيذ الشيفرة الديناميكية.',
  },
  {
    selector:
      "MemberExpression[object.object.name='chrome'][object.property.name='runtime'][property.name=/^(sendMessage|connect)$/]",
    message:
      'استخدم send() أو openChannel() من @/shared/messaging — النداء الخام بلا مهلة ويرمي عند غياب المستقبِل.',
  },
  {
    selector:
      "MemberExpression[object.object.name='chrome'][object.property.name='tabs'][property.name='sendMessage']",
    message: 'استخدم sendToTab() من @/shared/messaging.',
  },
  {
    selector:
      "MemberExpression[object.object.name='chrome'][object.property.name='runtime'][property.name=/^(onMessage|onConnect)$/]",
    message:
      'استخدم onMessage() أو serveChannel() من @/shared/messaging — التسجيل المباشر يتجاوز تغليف الأخطاء.',
  },
  {
    // خصائص CSS فيزيائية في الأنماط السطرية — واجهة RTL لا تحتملها.
    selector:
      'Property[key.name=/^(marginLeft|marginRight|paddingLeft|paddingRight|borderLeft|borderRight|left|right|borderTopLeftRadius|borderTopRightRadius|borderBottomLeftRadius|borderBottomRightRadius)$/]',
    message:
      'استخدم الخاصية المنطقية (marginInlineStart · insetInlineStart · borderStartStartRadius) — الواجهة عربية RTL.',
  },
  {
    // `formatHuman` للعدّ البشري وحده؛ القياسات تمرّ من `formatMeasure`.
    selector:
      "CallExpression[callee.name='formatHuman'] > Identifier[name=/^(width|height|size|dpr|ratio|bytes|padding|margin|gap|radius|scale|offset)$/]",
    message: 'هذا قياس لا عدّ بشري — استخدم formatMeasure().',
  },
  {
    selector:
      "CallExpression[callee.name='formatHuman'] > MemberExpression[property.name=/^(width|height|size|dpr|ratio|bytes|padding|margin|gap|radius|scale|offset)$/]",
    message: 'هذا قياس لا عدّ بشري — استخدم formatMeasure().',
  },
]

/**
 * الترميز إلى بايتات — بوّابة خروج واحدة لا خمس.
 *
 * `toBlob`/`convertToBlob`/`toDataURL` هي المواضع الوحيدة التي تخرج فيها
 * بكسلات من المنتج إلى ملفّ أو حافظة. وحدّ المرحلة 15 الأمني — «الحجب لا
 * يمكن عكسه في الملفّ المصدَّر» — لا يكون قابلًا للفرض إلّا إذا مرّ كل خروج
 * من دالّة واحدة تخبز الحجب قبل الترميز. ودرس قضية Manafort أن الطبقة
 * المرسومة فوق المحتوى ليست حجبًا ما لم تُدمَّر البكسلات تحتها.
 *
 * فالقاعدة تحظر الترميز في كل مكان، وتُستثنى أربعة ملفّات بالاسم:
 * `modules/editor/bake.ts` (بوّابة المحرر)، و`background/image-ops.ts`
 * و`background/stitch.ts` (مسارا الالتقاط والتجميع — كلاهما **قبل** المحرر
 * في الزمن، ينتجان الصورة المصدر ولا يمرّان بمشهد أصلًا)، و
 * `pages/library/thumbnail-encoder.ts` (المرحلة 18 — **بعد** المحرر زمنيًّا
 * لا قبله: يُرمِّز نسخة مصغَّرة من بايتات `blobs` **المخزَّنة أصلًا**، وهي
 * دومًا آخر ما خرج من `bake.ts` لو مرّت لقطة بالمحرر — فلا مشهد حيّ ولا
 * طبقة حجب غير مخبوزة يمكن أن تفلت هنا، تمامًا كحجّة مساري الالتقاط
 * والتجميع نفسها معكوسةً في الزمن).
 *
 * والثالث كشفته القاعدة نفسها أوّل تشغيل: وثيقة التصميم عدّت اثنين،
 * و`stitch.ts:162` ثالث. وهذا بالضبط ما تُشترى به قاعدة اللنت — إحصاء
 * مسارات الخروج بالعدّ الآلي لا بالذاكرة.
 */
const ENCODE_MESSAGE =
  'الترميز إلى بايتات يقع في modules/editor/bake.ts وحدها — هي التي تخبز الحجب قبل الترميز (ADR 0015).'

/**
 * **ثلاثة محدِّدات لا واحد** — والثاني والثالث كشفهما فحصٌ لا قراءة.
 *
 * `callee.property.name` يطابق النداء **بالنقطة** وحده. وقِيس: كتابة
 * `c['convertToBlob'](…)` أو `const m = 'convertToBlob'; c[m](…)` في ملفّ
 * داخل `pages/` تمرّ من اللنت **خضراء** — أي أن أي ملفّ في المحرر كان
 * يستطيع ترميز القماش إلى بايتات بلا المرور بالخبز، وبلا أن تفتح البوّابة
 * فمها. وهذا عين الفشل الذي وُجدت لمنعه.
 *
 * فالمحدِّد الثاني يمسك الوصول المحسوب بسلسلة حرفية، والثالث يمسك السلسلة
 * نفسها أينما كُتبت — فيسدّ طريق المتغيّر الوسيط. وهو **أوسع مما يلزم
 * حرفيًّا**: سلسلة `'toBlob'` في تعليق نصّي تُرفض أيضًا. والسعة مقصودة —
 * هذه أسماء لا تُكتب لغير غرضها، والاستثناء ملفّاته معدودة.
 */
export const encodeSelector = {
  selector: 'CallExpression[callee.property.name=/^(toBlob|convertToBlob|toDataURL)$/]',
  message: ENCODE_MESSAGE,
}

export const encodeComputedSelector = {
  selector: 'MemberExpression[computed=true][property.value=/^(toBlob|convertToBlob|toDataURL)$/]',
  message: ENCODE_MESSAGE,
}

export const encodeLiteralSelector = {
  selector: 'Literal[value=/^(toBlob|convertToBlob|toDataURL)$/]',
  message: ENCODE_MESSAGE,
}

/** المحدِّدات الثلاثة معًا — لا يُستعمل أحدها وحده. */
export const encodeSelectors = [encodeSelector, encodeComputedSelector, encodeLiteralSelector]

/** الملفّان المستثنيان من `encodeSelector` وحده، لا من بقيّة المحدِّدات. */
export const ENCODE_ALLOWED = [
  'src/modules/editor/bake.ts',
  'src/background/image-ops.ts',
  'src/background/stitch.ts',
  'src/pages/library/thumbnail-encoder.ts',
]

const importOrder = [
  'error',
  {
    groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index', 'type'],
    'newlines-between': 'always',
    alphabetize: { order: 'asc', caseInsensitive: true },
  },
]

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'dist-zip/**',
      'coverage/**',
      'node_modules/**',
      'src/tokens/**', // مولَّد — لا يُراجَع
      'tests/fixtures/lint/**', // مخالفات متعمَّدة، تُفحص برمجيًا في اختبار الحدود
      // نُسخ عمل معزولة (worktrees) لجلسات خلفية موازية — أشجار مستودع كاملة
      // تحت هذا المجلّد، وليست جزءًا من الشجرة قيد المراجعة. غيابه يعني أن
      // `eslint .` من الجذر يفحص أي جلسة موازية نشطة فيرفع مئات المخالفات
      // من كود لا علاقة له بالتغيير الجاري — لُوحظ فعليًا لا افتراضًا.
      '.claude/worktrees/**',
    ],
  },

  js.configs.recommended,

  // ── TypeScript: لنت واعٍ بالأنواع ─────────────────────────────
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      ...tseslint.configs.recommendedTypeChecked,
      importX.flatConfigs.recommended,
      importX.flatConfigs.typescript,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json', './tsconfig.test.json', './tsconfig.node.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.browser, ...globals.webextensions },
    },
    settings: {
      'import-x/resolver-next': [
        createTypeScriptImportResolver({
          project: ['./tsconfig.json', './tsconfig.test.json', './tsconfig.node.json'],
          noWarnOnMultipleProjects: true,
        }),
      ],
    },
    rules: {
      // `basePath` صريح: القاعدة تحلّ مسارات الـzones نسبةً إلى `process.cwd()`
      // افتراضيًا، فتتوقّف بصمت عن الفرض إذا شُغّل ESLint من مجلّد فرعي.
      'import-x/no-restricted-paths': [
        'error',
        { basePath: import.meta.dirname, zones: architectureZones },
      ],
      'import-x/no-cycle': ['error', { maxDepth: 8 }],
      'import-x/order': importOrder,
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      'no-console': ['warn', { allow: ['warn', 'error', 'debug'] }],
      eqeqeq: ['error', 'always'],
      // الرسائل الخام تمرّ من طبقة الرسائل وحدها — انظر ADR 0006.
      // تُكتب كمحدِّدات AST لا كـ`no-restricted-properties`: تلك القاعدة تطابق
      // المُعرِّف المباشر فقط، و`chrome.runtime.sendMessage` أعمق بمستوى.
      'no-restricted-syntax': ['error', ...restrictedSyntax, ...encodeSelectors],
    },
  },

  /*
   * ── طبقة الرسائل هي الموضع الوحيد المسموح فيه بالنداءات الخام ─
   *
   * **وتُستثنى من محدِّدات الرسائل وحدها، لا من بوّابة الترميز.** الإطفاء
   * الكامل كان يُسقط `encodeSelectors` معها: قِيس أن `convertToBlob` داخل
   * `src/shared/messaging/` تمرّ **بلا مخالفة واحدة**. وطبقةُ رسائل تُرمّز
   * صورًا ليست فرضًا بعيدًا — هي المكان الطبيعي لمساعد «أرسل لقطة».
   */
  {
    files: ['src/shared/messaging/*.ts'],
    rules: { 'no-restricted-syntax': ['error', ...encodeSelectors] },
  },

  /*
   * بوّابتا الترميز — تُستثنيان من `encodeSelector` وحده.
   *
   * القاعدة تُعاد كاملةً ناقصةً محدِّدًا واحدًا، ولا تُطفأ: `image-ops.ts`
   * يبقى محروسًا من النداءات الخام والخصائص الفيزيائية و`formatHuman`.
   */
  {
    files: ENCODE_ALLOWED,
    rules: { 'no-restricted-syntax': ['error', ...restrictedSyntax] },
  },

  /*
   * واختبار الحدود يذكر أسماء الترميز **نصًّا** ليتحقّق من القاعدة نفسها.
   *
   * فيُستثنى من محدِّد السلسلة وحده — لا من محدِّدَي النداء. ذكرُ الاسم
   * مسموح فيه، والنداء ليس. والاستثناء بملفّ واحد بالاسم لا بشجرة
   * `tests/**` كلّها: توسيعه كان سيُطفئ الحارس عن كل اختبار.
   */
  {
    files: ['tests/unit/architecture-boundaries.test.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...restrictedSyntax,
        encodeSelector,
        encodeComputedSelector,
      ],
    },
  },

  /*
   * ── طبقة الـworkers: خيط بلا مستند ────────────────────────────
   *
   * الكتلة العامّة تعطي `globals.browser` لكل `**` `/*.{ts,tsx}`، و`tsconfig`
   * يحمل `DOM` في `lib`. فـ`document.createElement('canvas')` داخل worker
   * **يمرّ من `tsc` ومن `eslint` معًا وينفجر وقت التشغيل** — وهو أسوأ صنف
   * فشل، وصنف البندين 18 و31 في §6 نفسه. الحاجز الرابع يمنعه لنتًا.
   */
  {
    files: ['src/workers/**/*.ts'],
    languageOptions: { globals: { ...globals.worker } },
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'document', message: 'لا مستند في خيط الـworker — مرِّر البيانات في الرسالة.' },
        { name: 'window', message: 'لا نافذة في خيط الـworker — استعمل self.' },
      ],
    },
  },

  // ── سكربتات Node: JavaScript خالص، بلا لنت واعٍ بالأنواع ──────
  {
    files: ['**/*.mjs'],
    extends: [importX.flatConfigs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'import-x/order': importOrder,
      'no-console': 'off',
    },
  },

  // ── ملفات الإعداد تعمل في Node ────────────────────────────────
  {
    files: ['*.config.ts'],
    languageOptions: { globals: { ...globals.node } },
    rules: { 'no-console': 'off' },
  },

  // ── الاختبارات ────────────────────────────────────────────────
  {
    files: ['tests/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
    },
  },
)
