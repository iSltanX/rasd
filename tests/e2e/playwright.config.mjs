/**
 * إعداد Playwright لمسارات المنتج الأربعة (`STAGES/18`، ADR 0045).
 *
 * **مشروعان بالكثافتين لا مشروع بمتغيّر.** كل مشروع يمرّر `rasdDpr` إلى تجهيزة الإقلاع، فتُقلع كروم
 * بـ`--force-device-scale-factor` فتكون الكثافة كثافة الشاشة نفسها لا محاكاةً على صفحةٍ واحدة:
 * `captureVisibleTab` يلتقط ما يرسمه المتصفّح فعلًا، ومحاكاةٌ تُطبَّق على التبويب وحده كانت ستُنتج لقطةً
 * بكثافة والمحرّر بأخرى — وهو بالضبط الخطأ الذي تُبنى المصفوفة لكشفه.
 *
 * **عاملٌ واحد وصفرُ إعادة.** المنافذ والعيّنات والملفّ الشخصي مشتركة، فلا توازي. والإعادة تُخفي التقطّع
 * الذي يقيسه معيار «صفر تقطّع في عشر تشغيلات» — فمسارٌ ينجح في المحاولة الثانية يُعدّ ساقطًا.
 */
import { defineConfig } from '@playwright/test'

const DENSITIES = [1, 2]

export default defineConfig({
  testDir: './journeys',
  outputDir: '../../artifacts/e2e/results',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  // مسارٌ كامل بأربع خطوات في كروم حقيقي على عدّاء بنواتين: أبطأ من أي حارس منفرد.
  timeout: 120_000,
  expect: { timeout: 10_000 },
  reporter: [
    ['list'],
    ['json', { outputFile: process.env.RASD_E2E_JSON ?? '../../artifacts/e2e/report.json' }],
  ],
  use: {
    // الأثر يُحفظ عند السقوط وحده — يُرفع في CI ولا يُقارَن آليًّا.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: DENSITIES.map((rasdDpr) => ({
    name: `dpr-${String(rasdDpr)}`,
    use: { rasdDpr },
  })),
})
