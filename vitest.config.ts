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
      /*
       * عتبات مُلزِمة — `pnpm test:coverage` يخرج بغير صفر إن هبطت أي نسبة دونها،
       * وهو ما يجري في `pnpm check` (فبوّابة `gate:a`) وفي وظيفة الفحوص الساكنة في
       * CI. ولا تُخفَّض عتبة لتظهر نتيجةٌ ناجحة: نقصٌ يُسدّ باختبار (`AGENTS.md` §4).
       *
       * **طبقتان:**
       *
       * 1. **أرضية «لا انخفاض» عامّة** بالقياس الأخير مقرَّبًا إلى الأسفل بخانة
       *    عشرية — هي التي تمنع شحن ملفّ جديد بلا اختبار: ملفّ بمئات الفروع بلا
       *    اختبار يُنزل النسبة العامّة دون الأرضية. وتُرفَع بعد كل رفعٍ للتغطية
       *    بالاختبار لا قبله.
       * 2. **أهداف الفروع لكل طبقة** — `modules/` ≥ 85% و`shared/` ≥ 90% و`ui/` ≥ 70%.
       *    الفروع لا الأسطر: السطر يُعدّ مغطًّى ولو لم يُنفَّذ نصفُ شرطه. وهي حدٌّ
       *    أدنى مكتوب لا وصفٌ للواقع (القياس اليوم أعلى منها بفارق).
       *
       * الطبقات التي لا هدف لها (`background/` · `content/` · `pages/`) تحكمها
       * الأرضية العامّة وحدها.
       */
      thresholds: {
        statements: 73.0,
        branches: 68.2,
        functions: 68.2,
        lines: 74.6,
        'src/modules/**': { branches: 85 },
        'src/shared/**': { branches: 90 },
        'src/ui/**': { branches: 70 },
      },
    },
  },
})
