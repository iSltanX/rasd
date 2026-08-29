import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'

/**
 * بناء منفصل للطبقة داخل الصفحة.
 *
 * `chrome.scripting.executeScript({ files })` يحقن **سكربتًا كلاسيكيًا** لا
 * وحدة ES: أي `import` باقٍ في الملفّ يفشل وقت الحقن. لذلك تُبنى الطبقة
 * حزمةً واحدة مكتفية بذاتها بصيغة IIFE، خارج بناء CRXJS الذي يخرج وحدات.
 *
 * ولا مدخل لها في البيان عمدًا: لا `content_scripts` في رصد، والحقن يدوي
 * بعد إيماءة المستخدم — [ADR 0005](Docs/ADR/0005-manual-injection.md).
 */
export default defineConfig(({ mode }) => ({
  // JSX عبر Preact لا React — كما في بقيّة المشروع.
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    outDir: 'dist',
    // لا يمسح `dist`: هذا بناء ثانٍ يضيف إلى ناتج البناء الأوّل.
    emptyOutDir: false,
    target: 'chrome116',
    sourcemap: mode !== 'production',
    minify: mode === 'production',
    lib: {
      entry: fileURLToPath(new URL('./src/content/index.ts', import.meta.url)),
      formats: ['iife'],
      name: '__rasdContent',
      fileName: () => 'content.js',
    },
    rollupOptions: {
      output: {
        // ورقة الطبقة تُتبنّى في جذر الظلّ برمجيًا، فلا ملفّ CSS منفصل.
        assetFileNames: 'assets/content-[hash][extname]',
      },
    },
  },
}))
