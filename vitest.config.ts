import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  // JSX عبر Preact لا React. لا يكفي تركه لـtsconfig: مُحوِّل oxc في Vite 8
  // لا يقرأه لملفات خارج مشروع الجذر (الاختبارات مثلًا) فيسقط إلى React.
  oxc: {
    jsx: { runtime: 'automatic', importSource: 'preact' },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'happy-dom',
    globals: false,
    /*
     * أربعة أنماط لا ثلاثة.
     *
     * `tests/integration/**\/*.test.tsx` كان غائبًا حتى المرحلة 15: اختبار
     * تكامل يركّب مكوّنًا **لا يُشغَّل ولا يُبلَّغ عنه** — يُكتَب ويُحفَظ
     * ويمرّ البناء أخضر وهو لم يُنفَّذ قطّ. وهو صنف الفشل الذي يجعل تغطيةً
     * مُدَّعاة أسوأ من تغطية غائبة.
     */
    include: [
      'tests/unit/**/*.test.ts',
      'tests/unit/**/*.test.tsx',
      'tests/integration/**/*.test.ts',
      'tests/integration/**/*.test.tsx',
    ],
    setupFiles: ['tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/tokens/**', 'src/**/*.d.ts'],
    },
  },
})
