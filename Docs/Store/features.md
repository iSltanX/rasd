# مطابقة الوصف بالدليل — كل ميزة في قائمة المتجر يقابلها ما يُشغَّل

> معيار قبول `STAGES/28`: «كل ميزة مذكورة في الوصف يقابلها حارس أخضر أو اختبار». الصفوف بترتيب
> بنود الوصف الطويل في [`listing.md`](listing.md)، والصور بترتيب اللقطات في [`Docs/Launch/screens/`](../Launch/screens/).
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

اللقطات في [`Docs/Launch/screens/`](../Launch/screens/) بترتيب الرفع، ونصوصها في
[`Docs/Launch/content.json`](../Launch/content.json). وفهرس المواد كلّها ومكان كلٍّ منها في
[`Docs/Launch/README.md`](../Launch/README.md).

| اللقطة (`ar-` و`en-`) | لقطتها الحيّة (`pnpm design:shots`) | ما تُظهره                                | دليلها في الجدول أعلاه         |
| --------------------- | ----------------------------------- | ---------------------------------------- | ------------------------------ |
| `01-inspect`          | `inspect_element-selected--light`   | فحص العنصر وتنزيل أنماطه                 | فحص العنصر · تنزيل أنماطه      |
| `02-measure`          | `measure_two-elements--dark`        | القياس بين عنصرين                        | القياس                         |
| `03-compare`          | `compare_split-reference--dark`     | المقارنة بالمرجع بأوضاعها الأربعة        | المقارنة بالمرجع               |
| `04-editor`           | `editor_redact--dark`               | المحرّر والحجب                           | المحرّر · الحجب                |
| `05-library`          | `library_grid--dark`                | المكتبة على الجهاز                       | المكتبة                        |
| `06-local-only`       | `privacy_controls--dark`            | «الوضع المحلّي فقط» مفعّلًا في الإعدادات | «الوضع المحلّي فقط» افتراضيًّا |
| `07-colours`          | `colors_sampling--light`            | القطّارة بصيغها ومتغيّرها وتباينها       | قطّارة الألوان                 |
| `08-capture`          | `capture_area-select--dark`         | تحديد منطقةٍ للالتقاط بأبعادها           | الالتقاط                       |

وتُعاد كلّها بأمرين: `pnpm design:shots` ثمّ `pnpm launch:images`.
