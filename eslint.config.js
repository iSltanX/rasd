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
  {
    target: './src/content',
    from: './src/pages',
    message: 'content/ يعمل داخل صفحة طرف ثالث ولا يجرّ حزمة صفحات الإضافة. استخدم shared/.',
  },
  // shared/ طبقة قاعدية: لا تستورد من أي طبقة أعلى منها.
  ...['background', 'content', 'offscreen', 'pages', 'modules', 'ui', 'tokens'].map((layer) => ({
    target: './src/shared',
    from: `./src/${layer}`,
    message: `shared/ طبقة قاعدية ولا يستورد من ${layer}/ ولا من أي طبقة أعلى.`,
  })),
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
      'no-restricted-syntax': [
        'error',
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
      ],
    },
  },

  // ── طبقة الرسائل هي الموضع الوحيد المسموح فيه بالنداءات الخام ─
  {
    files: ['src/shared/messaging/*.ts'],
    rules: { 'no-restricted-syntax': 'off' },
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
