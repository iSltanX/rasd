import importX, { createNodeResolver } from 'eslint-plugin-import-x'

import { architectureZones } from '../../../eslint.config.js'

/**
 * يعيد استخدام `architectureZones` من الإعداد الحقيقي — فالاختبار يفحص
 * القاعدة المطبَّقة فعلًا، لا نسخة منها.
 *
 * `basePath` يشير إلى شجرة العيّنات، لأن القاعدة تحلّ مسارات الـzones نسبةً
 * إلى `process.cwd()` افتراضيًا — وهو جذر المستودع أثناء تشغيل Vitest.
 *
 * والمحلّل محلّل Node بامتدادات TypeScript: الشجرة بلا `tsconfig`، والقاعدة
 * لا ترفع مخالفة إلا بعد أن يحلّ مسار الاستيراد فعلًا.
 */
export default [
  importX.flatConfigs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module' },
    settings: {
      'import-x/resolver-next': [createNodeResolver({ extensions: ['.ts', '.js'] })],
    },
    rules: {
      'import-x/no-restricted-paths': [
        'error',
        { basePath: import.meta.dirname, zones: architectureZones },
      ],
    },
  },
]
