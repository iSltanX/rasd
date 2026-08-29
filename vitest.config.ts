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
    include: [
      'tests/unit/**/*.test.ts',
      'tests/unit/**/*.test.tsx',
      'tests/integration/**/*.test.ts',
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
