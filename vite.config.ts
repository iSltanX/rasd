import { fileURLToPath, URL } from 'node:url'

import { crx } from '@crxjs/vite-plugin'
import { defineConfig } from 'vite'

import manifest from './manifest.config.ts'
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

  plugins: [crx({ manifest })],

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome116',
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
        ...(mode === 'production'
          ? {}
          : {
              gallery: 'src/pages/gallery/index.html',
              'popup-preview': 'src/pages/popup-preview/index.html',
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
