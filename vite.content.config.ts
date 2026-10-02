import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'

import { resolveBuildTarget } from './scripts/build-target.ts'
import { thirdPartyLicenses } from './scripts/third-party-licenses.ts'

/**
 * بناء منفصل للطبقة داخل الصفحة.
 *
 * `chrome.scripting.executeScript({ files })` يحقن **سكربتًا كلاسيكيًا** لا
 * وحدة ES: أي `import` باقٍ في الملفّ يفشل وقت الحقن. لذلك تُبنى الطبقة
 * حزمةً واحدة مكتفية بذاتها بصيغة IIFE، خارج بناء CRXJS الذي يخرج وحدات.
 *
 * ولا مدخل لها في البيان عمدًا: لا `content_scripts` في رصد، والحقن يدوي
 * بعد إيماءة المستخدم — [ADR 0005](Docs/ADR/0005-manual-injection.md).
 *
 * **والحزمة الأحادية قرارٌ لا اضطرار** — [ADR 0027](Docs/ADR/0027-content-bundle-shape.md):
 * الأدوات كلّها في هذا الملفّ، و`import()` في مصدرها يُضمَّن فيه صامتًا ولا يقسم.
 * وحجمه مضغوطًا ≤ 120,000 بايت يفرضه `verify:dist`. ومن أراد التقسيم فطريقه ADR
 * يستبدل ذاك، لا تعديل هذا الملفّ وحده.
 *
 * **بايتاتٌ واحدة في الهدفين:** مجلّد الخرج وحده يتبع `RASD_TARGET`. لا `define` للهدف هنا ولا `target` يتغيّر، فـ`content.js`
 * في `dist-firefox/` مطابقٌ بايتًا لـ`dist/content.js` — يثبته `cmp` في معايير SS1، وهو شرط «شيفرةٌ واحدة».
 */
export default defineConfig(({ mode }) => ({
  // JSX عبر Preact لا React — كما في بقيّة المشروع.
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // يدمج ما دخل `content.js` في ملفّ التراخيص الذي كتبه البناء الأوّل (`STAGES/27`).
  plugins: [
    thirdPartyLicenses({ root: fileURLToPath(new URL('.', import.meta.url)), mode: 'merge' }),
  ],
  build: {
    outDir: resolveBuildTarget().outDir,
    // لا يمسح مجلّد الخرج: هذا بناء ثانٍ يضيف إلى ناتج البناء الأوّل.
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
