import { fileURLToPath, URL } from 'node:url'

import { crx } from '@crxjs/vite-plugin'
import { defineConfig } from 'vite'

import manifest from './manifest.config.ts'
import { modulePreloadLinks } from './scripts/module-preload.ts'
import { PAGE_PATHS } from './src/shared/page-paths.ts'

export default defineConfig(({ mode }) => ({
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

  // `modulePreloadLinks` يعيد روابط التحميل المسبق إلى HTML وحده — انظر تعليق `modulePreload` أدناه.
  plugins: [crx({ manifest }), modulePreloadLinks()],

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome116',
    /*
     * لا مساعِد تحميل مسبق للوحدات.
     *
     * Vite يحقن `__vitePreload` مع كل استيراد ديناميكي، وهو يستدعي
     * `window.dispatchEvent` عند فشل التحميل. و**الـservice worker بلا
     * `window`** — فأوّل استيراد ديناميكي داخله يرمي `ReferenceError:
     * window is not defined` بدل أن يعمل.
     *
     * العطل كامن منذ المرحلة 3 (طبقة التخزين تُستورَد ديناميكيًا) ولم يظهر
     * قبل المرحلة 8: هي أوّل من يكتب في IndexedDB من الـservice worker في
     * متصفّح حقيقي. اكتشفه `pnpm verify:capture`.
     *
     * **والإيقاف لم يكن بلا كلفة** كما قيل هنا («الإضافة تُحمَّل من القرص فالتحميل المسبق لا يوفّر
     * شيئًا»): بلا روابطه تُجلب قطع الصفحة على جولات متتابعة، وقِيس ثمنها في زمن فتح النافذة على
     * عدّاء CI (`STAGES/04`). فالروابط تعود إلى HTML عبر `modulePreloadLinks` بلا المساعد.
     */
    modulePreload: false,
    // خرائط المصدر للتطوير فقط — المرحلة 27 تحسم سياسة الإنتاج.
    sourcemap: mode !== 'production',
    minify: mode === 'production',
    rollupOptions: {
      // الصفحات غير المشار إليها من البيان تحتاج مدخلًا صريحًا حتى تُبنى.
      // (`popup` يصل عبر `action.default_popup` فيتكفّل به CRXJS.)
      //
      // `gallery/` أداة تطوير داخلية — مستبعَدة عمدًا من بناء الإنتاج
      // (`pnpm build`) ومُدرجة في التطوير والمعاينة، حتى تبقى قابلة للتصفّح
      // محليًا وعبر Playwright MCP بلا أن تدخل حزمة المتجر.
      input: {
        editor: PAGE_PATHS.editor,
        library: PAGE_PATHS.library,
        settings: PAGE_PATHS.settings,
        onboarding: PAGE_PATHS.onboarding,
        offscreen: PAGE_PATHS.offscreen,
        compare: PAGE_PATHS.compare,
        ...(mode === 'production'
          ? {}
          : {
              gallery: 'src/pages/gallery/index.html',
              'popup-preview': 'src/pages/popup-preview/index.html',
              'capture-preview': 'src/pages/capture-preview/index.html',
            }),
      },
      output: {
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },

  server: {
    port: 5273,
    strictPort: true,
    // CRXJS يحتاج منفذ websocket ثابتًا حتى يصل إليه الـservice worker.
    // (Vite 8 نقل الإعداد من `server.hmr.*` إلى `server.ws.*`.)
    ws: { port: 5274 },
  },
}))
