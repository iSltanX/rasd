# مطابقة الوصف بالدليل — كل ميزة في قائمة المتجر يقابلها ما يُشغَّل

> معيار قبول [`STAGES/28`](../../STAGES/28.md): «كل ميزة مذكورة في الوصف يقابلها حارس أخضر أو اختبار». الصفوف بترتيب
> بنود الوصف الطويل في [`listing.md`](listing.md)، والصور بترتيب اللقطات في [`images/`](images/).
>
> **يحرسه `tests/unit/store-materials.test.ts`:** كل مسار اختبارٍ هنا موجود، وكل `pnpm verify:*` سكربتٌ في
> `package.json`. فإعادة تسمية اختبارٍ أو حذف حارس يُسقط هذا الجدول قبل أن يكذب الوصف. وخضرة الحرّاس نفسها تحكمها
> بوّابة الموجة (`pnpm verify:wave`) لا هذا الملفّ.

| بند الوصف                                                     | الحارس في كروم حقيقي                               | الاختبار                                                                                           |
| ------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| الالتقاط: الظاهر، والصفحة كاملة، وعنصر، ومنطقة                | `pnpm verify:capture` · `pnpm verify:fullpage`     | `tests/e2e/journeys/01-capture-annotate-export-library.spec.mjs`                                   |
| من النافذة وقائمة الزر الأيمن والاختصارات                     | `pnpm verify:popup` · `pnpm verify:activate`       | `tests/unit/background/context-menus.test.ts` · `tests/unit/background/commands.test.ts`           |
| القياس بين عنصرين بالبكسل                                     | `pnpm verify:measure`                              | `tests/e2e/journeys/02-inspect-measure-capture.spec.mjs`                                           |
| فحص العنصر: الصندوق والخط واللون والإتاحة                     | `pnpm verify:inspect`                              | `tests/unit/modules/computed-style/read.test.ts` · `tests/unit/modules/a11y/role.test.ts`          |
| تنزيل أنماطه CSS أو Tailwind أو JSON                          | `pnpm verify:inspect`                              | `tests/unit/modules/style-export/outputs.test.ts`                                                  |
| قطّارة الألوان ولوحة ألوان الصفحة وتدرّجاتها                  | `pnpm verify:picker` · `pnpm verify:palette`       | `tests/e2e/journeys/03-colour-palette-shades.spec.mjs` · `tests/unit/modules/colour/scale.test.ts` |
| تدقيق تباين النصوص في الصفحة كاملة مرتّبًا بالخطورة           | `pnpm verify:colour`                               | `tests/unit/content/contrast-audit.test.ts` · `tests/integration/contrast-audit-wiring.test.ts`    |
| المقارنة بالمرجع: تقسيم وتراكب وشفافية ووميض                  | `pnpm verify:compare`                              | `tests/unit/modules/compare/overlay.test.ts`                                                       |
| نسبة فرق البكسلات، واستثناء المناطق المتغيّرة                 | `pnpm verify:compare-diff`                         | `tests/unit/modules/compare/diff.test.ts` · `tests/unit/modules/compare/exclusions.test.ts`        |
| تقرير المقارنة PDF                                            | `pnpm verify:export`                               | `tests/unit/modules/export/pdf.test.ts`                                                            |
| المحرّر: أسهم وأشكال ونصوص وتعليقات وقصّ                      | `pnpm verify:editor`                               | `tests/e2e/journeys/01-capture-annotate-export-library.spec.mjs`                                   |
| الحجب بالتغطية أو البكسلة أو الضبابية مخبوزًا في البكسلات     | `pnpm verify:editor` · `pnpm verify:export`        | `tests/unit/modules/editor/redact.test.ts` · `tests/unit/modules/editor/bake-pixels.test.ts`       |
| المشكلات المربوطة بالعنصر وإعادة فحصها                        | `pnpm verify:issues`                               | `tests/unit/modules/issues/judge.test.ts` · `tests/unit/modules/issues/status.test.ts`             |
| التصدير PNG وPDF                                              | `pnpm verify:export`                               | `tests/unit/modules/export/pdf-document.test.ts`                                                   |
| دليل خطوات مرقّم: PDF وZIP وMarkdown وصفحة ويب واحدة          | `pnpm verify:export`                               | `tests/unit/modules/export/guide.test.ts`                                                          |
| حزمة تسليم للمطوّر: Markdown وJSON                            | —                                                  | `tests/unit/modules/handoff/markdown.test.ts` · `tests/unit/modules/handoff/json.test.ts`          |
| صفحة مشاركة ملفًّا واحدًا يُفتح بلا إنترنت                    | `pnpm verify:share`                                | `tests/unit/pages/share/capture-share.test.tsx`                                                    |
| المكتبة: مشاريع ووسوم ومفضّلة وبحث                            | `pnpm verify:library`                              | `tests/unit/modules/library/search.test.ts` · `tests/unit/modules/library/filters.test.ts`         |
| سلّة محذوفات 30 يومًا، وحذف دوري اختياري                      | `pnpm verify:lifecycle`                            | `tests/unit/modules/library/trash.test.ts` · `tests/unit/modules/library/retention.test.ts`        |
| نسخة احتياطية واستعادة                                        | —                                                  | `tests/unit/modules/backup/archive.test.ts` · `tests/unit/data/settings-transfer.test.ts`          |
| قفل المكتبة برمز                                              | —                                                  | `tests/unit/modules/privacy/lock.test.ts`                                                          |
| «الوضع المحلّي فقط» افتراضيًّا وصفر طلب شبكة                  | `pnpm verify:network`                              | `tests/unit/shared/egress.test.ts` · `tests/unit/egress-single-exit.test.ts`                       |
| لا صلاحية دائمة على المواقع                                   | `pnpm verify:load` · `pnpm verify:dist`            | `tests/unit/permissions.test.ts`                                                                   |
| GitHub: Issue في مستودعك بعد المراجعة                         | —                                                  | `tests/unit/pages/integrations/composer.test.tsx` · `tests/unit/modules/export/github.test.ts`     |
| «أبلغ عن مشكلة»: ما يُرسَل يُراجَع قبل الإرسال، ولا رابط صفحة | —                                                  | `tests/unit/modules/report/payload.test.ts` · `tests/unit/pages/settings/report-dialog.test.tsx`   |
| واجهة عربية من اليمين إلى اليسار بالوضعين الداكن والفاتح      | `pnpm verify:visual` · `pnpm verify:accessibility` | `tests/unit/pages/theme-wiring.test.ts` · `tests/unit/bidi.test.tsx`                               |

## الصور

| الصورة                                        | لقطتها الحيّة (`pnpm design:shots`) | ما تُظهره                               |
| --------------------------------------------- | ----------------------------------- | --------------------------------------- |
| `screenshot-ar-1.png` · `screenshot-en-1.png` | `measure_two-elements--dark`        | القياس بين عنصرين                       |
| `screenshot-ar-2.png` · `screenshot-en-2.png` | `inspect_element-selected--light`   | فحص العنصر وتنزيل أنماطه                |
| `screenshot-ar-3.png` · `screenshot-en-3.png` | `compare_split-reference--dark`     | المقارنة بالمرجع بأوضاعها الأربعة       |
| `screenshot-ar-4.png` · `screenshot-en-4.png` | `editor_redact--dark`               | المحرّر والحجب                          |
| `screenshot-ar-5.png` · `screenshot-en-5.png` | `library_grid--dark`                | المكتبة على الجهاز                      |
| `promo-small-440x280.png`                     | —                                   | الهوية: الشعار الأفقي وعبارة واحدة      |
| `promo-marquee-1400x560.png`                  | `measure_two-elements--dark`        | الهوية ولقطة القياس                     |
| `icon-128.png`                                | —                                   | الأيقونة 96 في وسط 128 بحاشية شفّافة 16 |

وتُعاد كلّها بأمرين: `pnpm design:shots --only=overlay,library,editor` ثمّ `pnpm store:images`.
