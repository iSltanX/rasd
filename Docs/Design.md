# مرجع التصميم — رصد

> كُتب في [`STAGES/02`](../STAGES/02.md) بتاريخ 2026-09-29. **الإطارات هنا هي المرجع المعتمد
> للتنفيذ في [`STAGES/03`](../STAGES/03.md).** كل شاشة منفَّذة تُربط بإطارها من هذا الملفّ، وكل
> اختلاف مقصود يُكتب بسببه. النطاق في [`Scope.md`](Scope.md)، والهوية في
> [`Brand/README.md`](Brand/README.md).

## 1. الملفّ وطريقة الربط

- الملفّ: `Gr0dOsmjcVBcaX9M1slf5m`، وفيه 33 صفحة.
- رابط أي إطار: `https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=<المعرّف بشرطة بدل النقطتين>`.
- كل شاشة مرسومة مرّتين: **داكنة** باسمها، و**فاتحة** باسمها متبوعًا بـ`· light`. الفاتحة نسخة
  من الداكنة ضُبط عليها وضع `Light` في مجموعة المتغيّرات `2 · Semantic`، فلا لون حرفيًّا يفصل
  بينهما.
- رسم شاشة ميزة لم تُبنَ **ليس تنفيذًا لها**: الإطار مرجع لمرحلتها الوظيفية في
  [`Scope.md`](Scope.md).

## 2. جرد الصفحات الثلاث والثلاثين

أداة سرد الصفحات كانت تعيد صفحتين من 33. الجرد أدناه بسكربت `use_figma` يقرأ
`figma.root.children` ثم صفحةً صفحةً.

| #   | الصفحة                    | المعرّف                                                                         | المحتوى                          | ما فيها بعد المرحلة                           |
| --- | ------------------------- | ------------------------------------------------------------------------------- | -------------------------------- | --------------------------------------------- |
| 1   | `01 — Cover`              | [`0:1`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=0-1)   | الغلاف                           | 1 إطار · 100%                                 |
| 2   | `02 — Brand Strategy`     | [`2:2`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=2-2)   | استراتيجية العلامة               | 6 أقسام · 7%                                  |
| 3   | `03 — Logo`               | [`2:3`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=2-3)   | الشعار v3 ومكوّناته              | 4 مجموعات و7 أقسام                            |
| 4   | `04 — Brand Typography`   | [`2:4`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=2-4)   | خطوط العلامة                     | 6 أقسام · 0%                                  |
| 5   | `05 — Brand Colors`       | [`2:5`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=2-5)   | سلالم الألوان                    | 14 قسمًا · 0%                                 |
| 6   | `06 — Visual Language`    | [`2:6`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=2-6)   | اللغة البصرية ومكوّنات الطبقة    | 9 مكوّنات و5 أقسام                            |
| 7   | `07 — Iconography`        | [`2:7`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=2-7)   | الأيقونات                        | 78 أيقونة                                     |
| 8   | `08 — Brand Applications` | [`2:8`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=2-8)   | تطبيقات العلامة                  | 6 تطبيقات                                     |
| 9   | `09 — Foundations`        | [`2:9`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=2-9)   | الأسس                            | 6 أقسام                                       |
| 10  | `10 — Variables`          | [`2:10`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=2-10) | توثيق المتغيّرات                 | 5 أقسام                                       |
| 11  | `11 — Design Tokens`      | [`2:11`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=2-11) | توثيق التوكنز                    | 3 أقسام                                       |
| 12  | `12 — Components`         | [`2:12`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=2-12) | المكوّنات                        | 29 مجموعة و3 مكوّنات مفردة                    |
| 13  | `13 — Extension Popup`    | [`2:13`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=2-13) | النافذة                          | 12 شاشة × وضعين                               |
| 14  | `14 — Capture`            | [`2:14`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=2-14) | الالتقاط                         | 10 × 2                                        |
| 15  | `15 — Annotation Editor`  | [`2:15`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=2-15) | المحرّر                          | 10 × 2                                        |
| 16  | `16 — Measure`            | [`2:16`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=2-16) | القياس                           | 6 × 2                                         |
| 17  | `17 — Inspect`            | [`2:17`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=2-17) | الفحص وتدقيق التباين             | 15 × 2                                        |
| 18  | `18 — Colors`             | [`2:18`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=2-18) | الألوان                          | 12 × 2                                        |
| 19  | `20 — Library`            | [`2:20`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=2-20) | المكتبة والأدلّة                 | 21 × 2                                        |
| 20  | `19 — Compare`            | [`2:19`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=2-19) | المقارنة                         | 13 × 2                                        |
| 21  | `21 — Projects`           | [`2:21`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=2-21) | المشاريع                         | 8 × 2                                         |
| 22  | `22 — Export`             | [`2:22`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=2-22) | التصدير                          | 7 × 2                                         |
| 23  | `23 — Share`              | [`2:23`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=2-23) | المشاركة المحلّية                | 9 × 2                                         |
| 24  | `24 — Integrations`       | [`2:24`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=2-24) | التكاملات وGitHub                | 13 × 2                                        |
| 25  | `25 — Settings`           | [`2:25`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=2-25) | الإعدادات والبيانات والدعم       | 34 × 2                                        |
| 26  | `26 — Privacy`            | [`2:26`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=2-26) | الخصوصية وقفل المكتبة            | 16 × 2                                        |
| 27  | `27 — Onboarding`         | [`2:27`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=2-27) | التأهيل                          | 4 × 2                                         |
| 28  | `28 — Website Arabic`     | [`2:28`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=2-28) | فارغة عمدًا — الموقع خارج النطاق | 0                                             |
| 29  | `29 — Website English`    | [`2:29`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=2-29) | فارغة عمدًا — الموقع خارج النطاق | 0                                             |
| 30  | `30 — Store Assets`       | [`2:30`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=2-30) | أصول المتجر                      | 4 أيقونات وبلاطتان و5 لقطات                   |
| 31  | `31 — Prototype`          | [`2:31`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=2-31) | النموذج التفاعلي                 | 21 إطارًا و21 تفاعلًا                         |
| 32  | `32 — Developer Handoff`  | [`2:32`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=2-32) | تسليم المطوّر                    | 6 أقسام                                       |
| 33  | `99 — Archive`            | [`18:2`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=18-2) | الأرشيف                          | توثيق شعار v2 مفصول النُّسخ، والنوافذ القديمة |

الصفحة `20 — Library` تسبق `19 — Compare` في ترتيب الملفّ، وهو ترتيب الملفّ نفسه لا خطأ في
الجرد.

### قياس صفحات المنتج قبل التعديل وبعده

«الربط» نسبة التعبئات والحدود المصمتة المربوطة بمتغيّر لون، خارج نُسخ المكوّنات. و«الخام»
إطارات يدوية تحمل اسم ضابط.

| الصفحة | العقد قبل | الربط قبل | الخام قبل                                           | الإطارات بعد | نُسخ المكوّنات بعد | الخام بعد |
| ------ | --------- | --------- | --------------------------------------------------- | ------------ | ------------------ | --------- |
| 13     | 639       | 98%       | key 11 · chip 1 · btn 6                             | 24           | 238                | 0         |
| 14     | 498       | 72%       | key 8 · btn 4                                       | 20           | 304                | 0         |
| 15     | 532       | 94%       | btn 9 · toggle 5                                    | 20           | 532                | 0         |
| 16     | 222       | 95%       | —                                                   | 12           | 148                | 0         |
| 17     | 274       | 94%       | tab 5 · btn 3                                       | 30           | 496                | 0         |
| 18     | 666       | 88%       | btn 12 · toggle 2                                   | 24           | 392                | 0         |
| 19     | 626       | 94%       | btn 7 · chip 4                                      | 26           | 348                | 0         |
| 20     | 2858      | 97%       | nav-item 100 · chip 12 · btn 3                      | 42           | 2446               | 0         |
| 21     | 460       | 100%      | nav-item 20                                         | 16           | 790                | 0         |
| 22     | 734       | 100%      | nav-item 20 · toggle 4 · btn 4                      | 14           | 750                | 0         |
| 23     | 733       | 100%      | nav-item 20 · chip 5 · btn 4                        | 18           | 972                | 0         |
| 24     | 237       | 100%      | btn 6 · nav-item 10                                 | 26           | 1638               | 0         |
| 25     | 859       | 100%      | select 2 · toggle 15 · key 6 · nav-item 40 · chip 1 | 68           | 4828               | 0         |
| 26     | 219       | 100%      | toggle 8 · select 1 · btn 1 · chip 2 · nav-item 10  | 32           | 2184               | 0         |
| 27     | 180       | 99%       | —                                                   | 8            | 36                 | 0         |

الصفحة 14 تقيس 72% لأن `Mock Page` موقع طرف ثالث بألوانه عمدًا، وهو مستثنى من أي تدقيق
توكنز.

### سكربت الجرد

يُشغَّل بـ`use_figma` مرّة لكل صفحة بعد استبدال `PAGE_ID`. لا يكتب شيئًا في الملفّ.

```js
// جرد قراءة فقط — صفحة واحدة لكل نداء. يُستبدل PAGE_ID بمعرّف الصفحة.
const page = await figma.getNodeByIdAsync('PAGE_ID')
await figma.setCurrentPageAsync(page)
const RAW = /^(toggle|btn|button|select|nav-item|key|checkbox|radio|input|chip|tab)$/i
const all = page.findAll(() => true)
const types = {}
const raw = {}
const rawSamples = []
const fonts = {}
const mains = {}
let bound = 0,
  literal = 0,
  instOuter = 0,
  broken = 0,
  texts = 0,
  arLeft = 0,
  small = 0
for (const n of all) {
  const inside = n.id.startsWith('I')
  types[n.type] = (types[n.type] || 0) + 1
  if (!inside && (n.type === 'FRAME' || n.type === 'GROUP') && RAW.test(n.name)) {
    raw[n.name] = (raw[n.name] || 0) + 1
    if (rawSamples.length < 6) rawSamples.push(n.id)
  }
  if (inside) continue
  for (const key of ['fills', 'strokes']) {
    if (!(key in n)) continue
    const paints = n[key]
    if (!Array.isArray(paints)) continue
    for (const p of paints) {
      if (p.type !== 'SOLID' || p.visible === false) continue
      if (p.boundVariables && p.boundVariables.color) bound++
      else literal++
    }
  }
  if (n.type === 'INSTANCE') {
    instOuter++
    const m = await n.getMainComponentAsync()
    if (!m) broken++
    else {
      const owner = m.parent && m.parent.type === 'COMPONENT_SET' ? m.parent.name : m.name
      mains[owner] = (mains[owner] || 0) + 1
    }
  }
  if (n.type === 'TEXT') {
    texts++
    const f = n.fontName
    const fam = f === figma.mixed ? 'mixed' : f.family
    fonts[fam] = (fonts[fam] || 0) + 1
    if (/[ء-ي]/.test(n.characters) && n.textAlignHorizontal === 'LEFT') arLeft++
    if (n.fontSize !== figma.mixed && n.fontSize < 10) small++
  }
}
const top = page.children.map(
  (c) => `${c.id}|${c.type}|${c.name}|${Math.round(c.width)}x${Math.round(c.height)}`,
)
const logo = Object.fromEntries(
  Object.entries(mains).filter(([k]) => /Rasd (Symbol|Lockup|Icon Tile|Wordmark)/.test(k)),
)
const topMains = Object.entries(mains)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 25)
return {
  page: page.name,
  id: page.id,
  topCount: top.length,
  top: top.slice(0, 80),
  nodes: all.length,
  types,
  texts,
  fonts,
  paint: {
    bound,
    literal,
    pct: bound + literal ? Math.round((bound / (bound + literal)) * 100) : null,
  },
  instances: instOuter,
  broken,
  logo,
  topMains,
  raw,
  rawSamples,
  arLeft,
  small,
}
```

## 3. معايير القبول ونتيجتها

### سكربت القبول

يُشغَّل بـ`use_figma` مرّة لكل صفحة من 13 إلى 27 بعد استبدال `PAGE_ID`.

```js
// سكربت معايير القبول — صفحة واحدة لكل نداء. يُستبدل PAGE_ID بمعرّف الصفحة.
const page = await figma.getNodeByIdAsync('PAGE_ID')
await figma.setCurrentPageAsync(page)
const RAW = /^(toggle|btn|select|nav-item)$/
const raw = page
  .findAll((n) => n.type === 'FRAME' && !n.id.startsWith('I') && RAW.test(n.name))
  .map((n) => `${n.id}|${n.name}`)
let instances = 0
let broken = 0
const oldLogo = []
for (const i of page.findAllWithCriteria({ types: ['INSTANCE'] })) {
  instances++
  const m = await i.getMainComponentAsync()
  if (!m) {
    broken++
    continue
  }
  const owner = m.parent && m.parent.type === 'COMPONENT_SET' ? m.parent.name : m.name
  if (/^Rasd (Symbol|Lockup|Icon Tile)/.test(owner) && !/ · v3$/.test(owner)) {
    oldLogo.push(`${i.id}|${owner}`)
  }
}
const frames = page.children.filter((c) => c.type === 'FRAME')
const dark = frames.filter((f) => !/ · light$/.test(f.name))
const names = new Set(frames.map((f) => f.name))
const noLight = dark.filter((f) => !names.has(`${f.name} · light`)).map((f) => f.name)
return {
  page: page.name,
  frames: frames.length,
  dark: dark.length,
  noLight,
  raw,
  instances,
  broken,
  oldLogo,
}
```

### النتيجة — 2026-09-29

| الصفحة      | الإطارات | داكنة   | بلا نظير فاتح | إطارات خام | نُسخ مكسورة | شعار قديم | نصوص قِيس تباينها | دون الحدّ |
| ----------- | -------- | ------- | ------------- | ---------- | ----------- | --------- | ----------------- | --------- |
| 13          | 24       | 12      | 0             | 0          | 0           | 0         | 292               | 0         |
| 14          | 20       | 10      | 0             | 0          | 0           | 0         | 276               | 0         |
| 15          | 20       | 10      | 0             | 0          | 0           | 0         | 380               | 0         |
| 16          | 12       | 6       | 0             | 0          | 0           | 0         | 204               | 0         |
| 17          | 30       | 15      | 0             | 0          | 0           | 0         | 624               | 0         |
| 18          | 24       | 12      | 0             | 0          | 0           | 0         | 574               | 0         |
| 19          | 26       | 13      | 0             | 0          | 0           | 0         | 746               | 0         |
| 20          | 42       | 21      | 0             | 0          | 0           | 0         | 2272              | 0         |
| 21          | 16       | 8       | 0             | 0          | 0           | 0         | 1578              | 0         |
| 22          | 14       | 7       | 0             | 0          | 0           | 0         | 1022              | 0         |
| 23          | 18       | 9       | 0             | 0          | 0           | 0         | 1244              | 0         |
| 24          | 26       | 13      | 0             | 0          | 0           | 0         | 1464              | 0         |
| 25          | 68       | 34      | 0             | 0          | 0           | 0         | 4348              | 0         |
| 26          | 32       | 16      | 0             | 0          | 0           | 0         | 1668              | 0         |
| 27          | 8        | 4       | 0             | 0          | 0           | 0         | 58                | 0         |
| **المجموع** | **380**  | **190** | **0**         | **0**      | **0**       | **0**     | **16750**         | **0**     |

وخارج صفحات المنتج: صفر نسخة مكسورة وصفر نسخة شعار قديم في الصفحات 01 و02 و03 و06 و07
و08 و12 و30 و31 و32 و99. وتفاعلات النموذج في الصفحة 31 بقيت 21.

### كيف قِيس التباين

لكل نصّ ظاهر: لونه المحلول من متغيّره في وضع إطاره، وخلفيته أوّل تعبئة مصمتة في آبائه مع
تركيب الشفّاف منها. الحدّ 4.5 : 1، و3 : 1 للنصّ الكبير (24 بكسل، أو 18.66 عريضًا).

- **الألواح الزجاجية فوق الصفحة** (`overlay/glass`) تُقاس على أسوأ خلفية: صفحة بيضاء تحت
  الزجاج الداكن، وسوداء تحت الفاتح. فالنصّ مقروء أيًّا كان الموقع تحته.
- **المعطَّل مستثنى**: نصّ بلون `text/disabled` أو داخل مكوّن حالته `Disabled`. هذا استثناء
  WCAG 1.4.3 للعناصر غير الفعّالة، وكل عنصر معطَّل يحمل سببه مكتوبًا بلون يبلغ الحدّ.
- **محتوى `Mock Page`** ومعاينات اللقطات مستثناة: موقع طرف ثالث لا واجهة رصد.

## 4. المكوّنات المضافة

أُضيفت إلى `12 — Components`. المكوّنات العشرون القائمة لم تُحذف.

| المكوّن         | المعرّف                                                                               | الغرض                                     | الخصائص                      |
| --------------- | ------------------------------------------------------------------------------------- | ----------------------------------------- | ---------------------------- |
| `Nav Item`      | [`265:248`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=265-248) | عنصر تنقّل للشريط الجانبي ولتنقّل الأقسام | State × Count                |
| `App Sidebar`   | [`270:264`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=270-264) | الشريط الجانبي لصفحات الإضافة             | العنصر النشط يُضبط في النسخة |
| `Section Nav`   | [`280:740`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=280-740) | تنقّل أقسام الإعدادات التسعة              | القسم النشط يُضبط في النسخة  |
| `Setting Row`   | [`267:396`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=267-396) | صفّ إعداد: عنوان وتلميح وضابط             | Control × Divider            |
| `Select`        | [`266:228`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=266-228) | قائمة منسدلة مدمجة                        | State                        |
| `Storage Meter` | [`266:259`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=266-259) | مؤشّر المساحة الحقيقي                     | Level                        |
| `Footer`        | [`268:254`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=268-254) | التذييل                                   | Layout × Repo                |
| `Error Message` | [`268:279`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=268-279) | رسالة الخطأ الموحَّدة                     | Layout                       |
| `Tab`           | [`274:347`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=274-347) | تبويب مفرد يُركَّب أي عدد منه             | State                        |
| `Option Card`   | [`287:391`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=287-391) | بطاقة خيار: صيغة أو مسار مشاركة           | State                        |
| `Field`         | [`287:422`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=287-422) | حقل نموذج بعنوان وتلميح                   | Lines × State                |

وتعديلات على القائم:

| المكوّن                                     | التعديل                                                 | السبب                                                                   |
| ------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------- |
| `Chip`                                      | يحتضن نصّه، وأُضيفت الدرجات `Info` و`Compare` و`Colors` | كان بعرض ثابت 60 فيقصّ النصّ، وثلاث درجات مستعملة في الشاشات بلا متغيّر |
| `KeyCap`                                    | يحتضن نصّه، وخاصية `Key`، والنصّ الافتراضي `⇧⌘T`        | كان بعرض ثابت 40، ويعرض `⌥⌘F` الذي يرفضه Chrome                         |
| `Button`                                    | لون الأيقونة مربوط بالحالة والنوع                       | أيقونة الزرّ الأساسي كانت رمادية على لون العلامة في الوضع الفاتح        |
| `Empty State`                               | نصّ الاختصار `⇧⌘T`                                      | كان `⌥⌘F`                                                               |
| `Menu` · `Tooltip` · `Banner` · `Tool Card` | نصوص الاختصارات والمشاركة والوضع المحلّي                | تطابق المنتج المشحون                                                    |

### الشعار

مجموعات v2 الثلاث (52 متغيّرًا) حُذفت بعد أن صار عدّ نُسخها صفرًا بـ`getInstancesAsync`.
استُبدلت 59 نسخة في 13 صفحة. داخل المنتج الدرجة `Adaptive`. أقسام توثيق v2 التسعة في
`99 — Archive` مفصولة النُّسخ.

## 5. الشاشات المعتمدة

190 شاشة، لكلٍّ إطار داكن وإطار فاتح.

### النافذة — الصفحة `13 — Extension Popup`

| الإطار                   | الحالة     | الداكن                                                                                    | الفاتح                                                                                    |
| ------------------------ | ---------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `popup / default`        | أساسية     | [`50:13`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=50-13)         | [`86:1726`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=86-1726)     |
| `popup / capturing`      | تحميل      | [`52:13`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=52-13)         | [`310:170`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-170)     |
| `popup / inspect-active` | أساسية     | [`52:134`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=52-134)       | [`310:214`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-214)     |
| `popup / colors`         | أساسية     | [`53:24`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=53-24)         | [`310:264`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-264)     |
| `popup / success`        | نجاح       | [`53:174`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=53-174)       | [`310:334`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-334)     |
| `popup / first-run`      | أساسية     | [`54:42`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=54-42)         | [`310:369`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-369)     |
| `popup / permission`     | رفض صلاحية | [`54:151`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=54-151)       | [`310:398`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-398)     |
| `popup / offline`        | أساسية     | [`54:252`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=54-252)       | [`310:422`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-422)     |
| `popup / restricted`     | رفض صلاحية | [`54:353`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=54-353)       | [`310:446`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-446)     |
| `popup / error`          | خطأ        | [`304:28552`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=304-28552) | [`310:470`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-470)     |
| `popup / cancelled`      | إلغاء      | [`304:28584`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=304-28584) | [`310:494`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-494)     |
| `popup / no-recent`      | فراغ       | [`319:56341`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=319-56341) | [`319:56442`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=319-56442) |

### الالتقاط — الصفحة `14 — Capture`

| الإطار                       | الحالة     | الداكن                                                                                | الفاتح                                                                                    |
| ---------------------------- | ---------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `capture / area-select`      | أساسية     | [`59:2`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=59-2)       | [`310:26505`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-26505) |
| `capture / element-hover`    | أساسية     | [`59:123`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=59-123)   | [`310:26530`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-26530) |
| `capture / full-page`        | تحميل      | [`61:184`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=61-184)   | [`310:26558`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-26558) |
| `capture / error`            | خطأ        | [`96:305`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=96-305)   | [`310:26646`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-26646) |
| `capture / permission`       | رفض صلاحية | [`96:377`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=96-377)   | [`310:26668`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-26668) |
| `capture / success`          | نجاح       | [`302:332`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=302-332) | [`310:26691`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-26691) |
| `capture / cancelled`        | إلغاء      | [`302:371`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=302-371) | [`310:26717`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-26717) |
| `capture / element-success`  | نجاح       | [`302:408`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=302-408) | [`310:26743`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-26743) |
| `capture / restricted`       | رفض صلاحية | [`302:448`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=302-448) | [`310:26772`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-26772) |
| `capture / clipboard-denied` | رفض صلاحية | [`302:584`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=302-584) | [`310:26807`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-26807) |

### المحرّر — الصفحة `15 — Annotation Editor`

| الإطار                   | الحالة | الداكن                                                                                    | الفاتح                                                                                    |
| ------------------------ | ------ | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `editor / annotating`    | أساسية | [`70:2`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=70-2)           | [`310:27639`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-27639) |
| `editor / exporting`     | تحميل  | [`99:415`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=99-415)       | [`310:27728`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-27728) |
| `editor / redact`        | أساسية | [`128:133`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=128-133)     | [`310:27830`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-27830) |
| `editor / crop`          | أساسية | [`303:22926`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=303-22926) | [`310:27906`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-27906) |
| `editor / text`          | أساسية | [`303:23126`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=303-23126) | [`310:27976`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-27976) |
| `editor / empty`         | فراغ   | [`303:23312`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=303-23312) | [`310:28031`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-28031) |
| `editor / not-found`     | خطأ    | [`303:23473`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=303-23473) | [`310:28082`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-28082) |
| `editor / saved`         | نجاح   | [`303:23596`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=303-23596) | [`310:28098`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-28098) |
| `editor / save-error`    | خطأ    | [`303:23699`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=303-23699) | [`310:28188`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-28188) |
| `editor / leave-unsaved` | إلغاء  | [`303:23804`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=303-23804) | [`310:28278`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-28278) |

### القياس — الصفحة `16 — Measure`

| الإطار                   | الحالة     | الداكن                                                                                | الفاتح                                                                                    |
| ------------------------ | ---------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `measure / two-elements` | أساسية     | [`64:2`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=64-2)       | [`310:29105`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-29105) |
| `measure / idle`         | فراغ       | [`98:251`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=98-251)   | [`310:29166`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-29166) |
| `measure / copied`       | نجاح       | [`303:149`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=303-149) | [`310:29197`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-29197) |
| `measure / cancelled`    | إلغاء      | [`303:222`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=303-222) | [`310:29259`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-29259) |
| `measure / error`        | خطأ        | [`303:265`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=303-265) | [`310:29291`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-29291) |
| `measure / restricted`   | رفض صلاحية | [`303:310`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=303-310) | [`310:29323`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-29323) |

### الفحص وتدقيق التباين — الصفحة `17 — Inspect`

| الإطار                        | الحالة     | الداكن                                                                                    | الفاتح                                                                                    |
| ----------------------------- | ---------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `inspect / element-selected`  | أساسية     | [`62:2`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=62-2)           | [`310:29794`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-29794) |
| `inspect / idle`              | فراغ       | [`98:90`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=98-90)         | [`310:29886`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-29886) |
| `inspect / copied`            | نجاح       | [`303:20677`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=303-20677) | [`310:29917`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-29917) |
| `inspect / cancelled`         | إلغاء      | [`303:20779`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=303-20779) | [`310:30010`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-30010) |
| `inspect / error`             | خطأ        | [`303:20820`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=303-20820) | [`310:30042`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-30042) |
| `contrast-audit / idle`       | فراغ       | [`303:20863`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=303-20863) | [`310:30074`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-30074) |
| `contrast-audit / scanning`   | تحميل      | [`303:20920`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=303-20920) | [`310:30123`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-30123) |
| `contrast-audit / results`    | أساسية     | [`303:20977`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=303-20977) | [`310:30171`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-30171) |
| `contrast-audit / all-pass`   | نجاح       | [`303:21094`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=303-21094) | [`310:30227`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-30227) |
| `contrast-audit / empty`      | فراغ       | [`303:21147`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=303-21147) | [`310:30272`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-30272) |
| `contrast-audit / timeout`    | خطأ        | [`303:21200`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=303-21200) | [`310:30317`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-30317) |
| `contrast-audit / cancelled`  | إلغاء      | [`303:21263`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=303-21263) | [`310:30369`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-30369) |
| `contrast-audit / error`      | خطأ        | [`303:21315`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=303-21315) | [`310:30414`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-30414) |
| `inspect / restricted`        | رفض صلاحية | [`319:53552`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=319-53552) | [`319:53790`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=319-53790) |
| `contrast-audit / restricted` | رفض صلاحية | [`319:53671`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=319-53671) | [`319:53835`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=319-53835) |

### الألوان — الصفحة `18 — Colors`

| الإطار                        | الحالة     | الداكن                                                                                    | الفاتح                                                                                    |
| ----------------------------- | ---------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `colors / sampling`           | أساسية     | [`65:2`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=65-2)           | [`310:31472`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-31472) |
| `colors / idle`               | فراغ       | [`98:424`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=98-424)       | [`310:31548`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-31548) |
| `colors / palette-extract`    | أساسية     | [`122:157`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=122-157)     | [`310:31578`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-31578) |
| `colors / replace`            | أساسية     | [`125:227`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=125-227)     | [`310:31685`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-31685) |
| `colors / scale`              | أساسية     | [`125:355`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=125-355)     | [`310:31738`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-31738) |
| `colors / copied`             | نجاح       | [`303:22111`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=303-22111) | [`310:31831`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-31831) |
| `colors / palette-saved`      | نجاح       | [`303:22197`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=303-22197) | [`310:31908`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-31908) |
| `colors / cancelled`          | إلغاء      | [`303:22316`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=303-22316) | [`310:32016`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-32016) |
| `colors / error`              | خطأ        | [`303:22356`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=303-22356) | [`310:32047`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-32047) |
| `colors / palette-extracting` | تحميل      | [`303:22398`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=303-22398) | [`310:32078`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-32078) |
| `colors / palette-empty`      | فراغ       | [`303:22513`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=303-22513) | [`310:32121`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-32121) |
| `colors / restricted`         | رفض صلاحية | [`319:54026`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=319-54026) | [`319:54144`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=319-54144) |

### المقارنة وتقريرها — الصفحة `19 — Compare`

| الإطار                      | الحالة     | الداكن                                                                                    | الفاتح                                                                                    |
| --------------------------- | ---------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `compare / split-reference` | أساسية     | [`69:2`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=69-2)           | [`310:32950`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-32950) |
| `compare / no-reference`    | فراغ       | [`96:560`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=96-560)       | [`310:33023`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-33023) |
| `compare / two-captures`    | أساسية     | [`127:196`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=127-196)     | [`310:33040`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-33040) |
| `compare / viewports`       | أساسية     | [`127:315`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=127-315)     | [`310:33110`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-33110) |
| `compare / report`          | أساسية     | [`291:12538`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=291-12538) | [`310:33162`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-33162) |
| `compare / report-done`     | نجاح       | [`291:12691`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=291-12691) | [`310:33283`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-33283) |
| `compare / diff-saved`      | نجاح       | [`291:12790`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=291-12790) | [`310:33371`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-33371) |
| `compare / loading`         | تحميل      | [`291:12887`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=291-12887) | [`310:33457`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-33457) |
| `compare / identical`       | نجاح       | [`291:12984`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=291-12984) | [`310:33545`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-33545) |
| `compare / size-mismatch`   | خطأ        | [`291:13076`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=291-13076) | [`310:33630`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-33630) |
| `compare / error`           | خطأ        | [`291:13178`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=291-13178) | [`310:33722`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-33722) |
| `compare / cancelled`       | إلغاء      | [`291:13276`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=291-13276) | [`310:33803`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-33803) |
| `compare / restricted`      | رفض صلاحية | [`319:54261`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=319-54261) | [`319:54366`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=319-54366) |

### المكتبة والأدلّة — الصفحة `20 — Library`

| الإطار                      | الحالة     | الداكن                                                                                    | الفاتح                                                                                    |
| --------------------------- | ---------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `library / grid`            | أساسية     | [`66:20`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=66-20)         | [`86:1825`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=86-1825)     |
| `library / empty`           | فراغ       | [`94:55`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=94-55)         | [`310:34782`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-34782) |
| `library / loading`         | تحميل      | [`94:374`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=94-374)       | [`310:34800`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-34800) |
| `library / selection`       | أساسية     | [`94:738`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=94-738)       | [`310:34834`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-34834) |
| `library / palettes`        | أساسية     | [`126:222`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=126-222)     | [`310:35063`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-35063) |
| `library / references`      | أساسية     | [`126:660`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=126-660)     | [`310:35197`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-35197) |
| `library / tags`            | أساسية     | [`126:1078`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=126-1078)   | [`310:35317`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-35317) |
| `library / guide`           | أساسية     | [`128:697`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=128-697)     | [`310:35436`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-35436) |
| `guide / editor`            | أساسية     | [`304:1506`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=304-1506)   | [`310:35507`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-35507) |
| `guide / export`            | أساسية     | [`304:1647`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=304-1647)   | [`310:35587`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-35587) |
| `guide / template-save`     | أساسية     | [`304:1922`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=304-1922)   | [`310:35691`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-35691) |
| `guide / export-loading`    | تحميل      | [`304:2130`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=304-2130)   | [`310:35786`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-35786) |
| `guide / export-done`       | نجاح       | [`304:2328`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=304-2328)   | [`310:35875`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-35875) |
| `guide / export-error`      | خطأ        | [`304:2528`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=304-2528)   | [`310:35964`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-35964) |
| `library / delete-confirm`  | أساسية     | [`304:2735`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=304-2735)   | [`310:36046`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-36046) |
| `library / locked`          | رفض صلاحية | [`304:3091`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=304-3091)   | [`310:36289`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-36289) |
| `library / deleted`         | نجاح       | [`304:3257`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=304-3257)   | [`310:36340`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-36340) |
| `library / storage-warning` | أساسية     | [`304:3499`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=304-3499)   | [`310:36570`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-36570) |
| `library / error`           | خطأ        | [`304:3833`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=304-3833)   | [`310:36764`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-36764) |
| `guide / export-cancelled`  | إلغاء      | [`319:54483`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=319-54483) | [`319:54835`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=319-54835) |
| `guide / empty`             | فراغ       | [`319:54680`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=319-54680) | [`319:54922`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=319-54922) |

### المشاريع — الصفحة `21 — Projects`

| الإطار                      | الحالة | الداكن                                                                                    | الفاتح                                                                                    |
| --------------------------- | ------ | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `projects / overview`       | أساسية | [`72:2`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=72-2)           | [`310:40776`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-40776) |
| `projects / empty`          | فراغ   | [`99:33`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=99-33)         | [`310:40969`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-40969) |
| `projects / new`            | أساسية | [`304:26502`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=304-26502) | [`310:40987`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-40987) |
| `projects / new-error`      | خطأ    | [`304:26843`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=304-26843) | [`310:41197`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-41197) |
| `projects / loading`        | تحميل  | [`304:27167`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=304-27167) | [`310:41402`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-41402) |
| `projects / error`          | خطأ    | [`304:27482`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=304-27482) | [`310:41606`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-41606) |
| `projects / delete-confirm` | أساسية | [`304:27809`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=304-27809) | [`310:41810`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-41810) |
| `projects / created`        | نجاح   | [`304:28147`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=304-28147) | [`310:42029`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-42029) |

### التصدير — الصفحة `22 — Export`

| الإطار                       | الحالة     | الداكن                                                                                  | الفاتح                                                                                    |
| ---------------------------- | ---------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `export / modal`             | أساسية     | [`73:2`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=73-2)         | [`310:43256`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-43256) |
| `export / done`              | نجاح       | [`129:1249`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=129-1249) | [`310:43481`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-43481) |
| `export / pdf`               | أساسية     | [`290:480`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=290-480)   | [`310:43706`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-43706) |
| `export / loading`           | تحميل      | [`290:901`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=290-901)   | [`310:43931`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-43931) |
| `export / error`             | خطأ        | [`290:1261`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=290-1261) | [`310:44142`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-44142) |
| `export / permission-denied` | رفض صلاحية | [`290:1630`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=290-1630) | [`310:44346`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-44346) |
| `export / cancelled`         | إلغاء      | [`290:1997`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=290-1997) | [`310:44561`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-44561) |

### المشاركة المحلّية — الصفحة `23 — Share`

| الإطار                      | الحالة     | الداكن                                                                                    | الفاتح                                                                                    |
| --------------------------- | ---------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `share / modal`             | أساسية     | [`73:361`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=73-361)       | [`310:45733`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-45733) |
| `share / done`              | نجاح       | [`129:843`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=129-843)     | [`310:45954`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-45954) |
| `share / clipboard`         | نجاح       | [`291:447`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=291-447)     | [`310:46176`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-46176) |
| `share / file`              | أساسية     | [`291:829`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=291-829)     | [`310:46391`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-46391) |
| `share / guide`             | أساسية     | [`291:1262`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=291-1262)   | [`310:46613`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-46613) |
| `share / loading`           | تحميل      | [`291:1658`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=291-1658)   | [`310:46838`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-46838) |
| `share / error`             | خطأ        | [`291:2012`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=291-2012)   | [`310:47044`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-47044) |
| `share / permission-denied` | رفض صلاحية | [`291:2381`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=291-2381)   | [`310:47248`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-47248) |
| `share / cancelled`         | إلغاء      | [`319:55644`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=319-55644) | [`319:55991`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=319-55991) |

### التكاملات وGitHub — الصفحة `24 — Integrations`

| الإطار                              | الحالة     | الداكن                                                                                    | الفاتح                                                                                    |
| ----------------------------------- | ---------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `integrations / connections`        | أساسية     | [`72:488`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=72-488)       | [`310:48570`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-48570) |
| `integrations / connected`          | نجاح       | [`285:9323`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=285-9323)   | [`310:48590`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-48590) |
| `integrations / auth-error`         | خطأ        | [`285:9606`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=285-9606)   | [`310:48606`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-48606) |
| `integrations / missing-permission` | رفض صلاحية | [`285:9884`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=285-9884)   | [`310:48624`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-48624) |
| `integrations / local-only`         | رفض صلاحية | [`285:10162`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=285-10162) | [`310:48642`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-48642) |
| `github / connect`                  | أساسية     | [`293:18976`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=293-18976) | [`310:48659`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-48659) |
| `github / connecting`               | تحميل      | [`293:19134`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=293-19134) | [`310:48702`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-48702) |
| `github / issue-compose`            | أساسية     | [`293:19271`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=293-19271) | [`310:48731`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-48731) |
| `github / issue-preview`            | أساسية     | [`293:19455`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=293-19455) | [`310:48770`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-48770) |
| `github / issue-sending`            | تحميل      | [`293:19642`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=293-19642) | [`310:48807`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-48807) |
| `github / issue-sent`               | نجاح       | [`293:19779`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=293-19779) | [`310:48836`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-48836) |
| `github / issue-error`              | خطأ        | [`293:19924`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=293-19924) | [`310:48869`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-48869) |
| `github / issue-cancelled`          | إلغاء      | [`293:20070`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=293-20070) | [`310:48896`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-48896) |

### الإعدادات والبيانات والدعم — الصفحة `25 — Settings`

| الإطار                        | الحالة     | الداكن                                                                                    | الفاتح                                                                                    |
| ----------------------------- | ---------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `settings / capture`          | أساسية     | [`68:2`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=68-2)           | [`310:51416`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-51416) |
| `settings / annotation`       | أساسية     | [`129:35`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=129-35)       | [`310:51437`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-51437) |
| `settings / colors`           | أساسية     | [`129:313`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=129-313)     | [`310:51456`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-51456) |
| `settings / appearance`       | أساسية     | [`129:579`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=129-579)     | [`310:51474`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-51474) |
| `settings / shortcuts`        | أساسية     | [`281:862`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=281-862)     | [`310:51492`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-51492) |
| `settings / data`             | أساسية     | [`282:1318`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=282-1318)   | [`310:51522`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-51522) |
| `settings / about`            | أساسية     | [`282:1656`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=282-1656)   | [`310:51551`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-51551) |
| `shortcuts / sheet`           | أساسية     | [`292:1691`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=292-1691)   | [`310:51577`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-51577) |
| `data / backup-progress`      | تحميل      | [`292:1916`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=292-1916)   | [`310:51633`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-51633) |
| `data / backup-done`          | نجاح       | [`292:2072`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=292-2072)   | [`310:51680`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-51680) |
| `data / restore-preview`      | أساسية     | [`292:2245`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=292-2245)   | [`310:51741`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-51741) |
| `data / restore-error`        | خطأ        | [`292:2416`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=292-2416)   | [`310:51801`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-51801) |
| `data / import-settings`      | أساسية     | [`292:2584`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=292-2584)   | [`310:51842`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-51842) |
| `data / reset-confirm`        | أساسية     | [`292:2765`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=292-2765)   | [`310:51896`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-51896) |
| `data / delete-confirm`       | أساسية     | [`292:2926`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=292-2926)   | [`310:51944`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-51944) |
| `data / delete-confirm-final` | أساسية     | [`292:3109`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=292-3109)   | [`310:52006`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-52006) |
| `data / delete-done`          | نجاح       | [`292:3268`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=292-3268)   | [`310:52050`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-52050) |
| `data / delete-error`         | خطأ        | [`292:3419`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=292-3419)   | [`310:52094`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-52094) |
| `support / form`              | أساسية     | [`293:4050`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=293-4050)   | [`310:52134`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-52134) |
| `support / form-error`        | خطأ        | [`293:4220`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=293-4220)   | [`310:52178`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-52178) |
| `support / image`             | أساسية     | [`293:4381`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=293-4381)   | [`310:52220`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-52220) |
| `support / image-empty`       | فراغ       | [`293:4598`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=293-4598)   | [`310:52270`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-52270) |
| `support / review`            | أساسية     | [`293:4760`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=293-4760)   | [`310:52315`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-52315) |
| `support / sending`           | تحميل      | [`293:4949`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=293-4949)   | [`310:52394`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-52394) |
| `support / sent`              | نجاح       | [`293:5096`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=293-5096)   | [`310:52433`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-52433) |
| `support / failed`            | خطأ        | [`293:5250`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=293-5250)   | [`310:52476`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-52476) |
| `support / local-only`        | رفض صلاحية | [`293:5414`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=293-5414)   | [`310:52528`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-52528) |
| `support / cancelled`         | إلغاء      | [`293:5570`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=293-5570)   | [`310:52573`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-52573) |
| `whats-new / card`            | أساسية     | [`293:5723`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=293-5723)   | [`310:52615`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-52615) |
| `settings / save-error`       | خطأ        | [`319:12777`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=319-12777) | [`319:13305`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=319-13305) |
| `settings / saved`            | نجاح       | [`319:12812`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=319-12812) | [`319:13327`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=319-13327) |
| `data / backup-cancelled`     | إلغاء      | [`319:12845`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=319-12845) | [`319:13349`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=319-13349) |
| `data / backup-empty`         | فراغ       | [`319:13000`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=319-13000) | [`319:13394`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=319-13394) |
| `data / permission-denied`    | رفض صلاحية | [`319:13151`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=319-13151) | [`319:13438`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=319-13438) |

### الخصوصية وقفل المكتبة — الصفحة `26 — Privacy`

| الإطار                                    | الحالة     | الداكن                                                                                    | الفاتح                                                                                    |
| ----------------------------------------- | ---------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `privacy / controls`                      | أساسية     | [`68:416`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=68-416)       | [`310:58971`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-58971) |
| `privacy / excluded-sites`                | أساسية     | [`285:444`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=285-444)     | [`310:58999`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-58999) |
| `privacy / excluded-sites · empty`        | فراغ       | [`285:803`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=285-803)     | [`310:59023`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-59023) |
| `privacy / permissions`                   | رفض صلاحية | [`285:1073`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=285-1073)   | [`310:59040`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-59040) |
| `privacy / incognito`                     | أساسية     | [`285:1379`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=285-1379)   | [`310:59060`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-59060) |
| `lock / setup`                            | أساسية     | [`293:16890`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=293-16890) | [`310:59085`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-59085) |
| `lock / setup-mismatch`                   | خطأ        | [`293:17065`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=293-17065) | [`310:59133`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-59133) |
| `lock / unlock`                           | رفض صلاحية | [`293:17224`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=293-17224) | [`310:59174`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-59174) |
| `lock / unlock-wrong`                     | خطأ        | [`293:17383`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=293-17383) | [`310:59219`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-59219) |
| `lock / unlocking`                        | تحميل      | [`293:17542`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=293-17542) | [`310:59264`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-59264) |
| `lock / forgot`                           | أساسية     | [`293:17686`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=293-17686) | [`310:59303`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-59303) |
| `lock / disable`                          | أساسية     | [`293:17856`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=293-17856) | [`310:59358`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-59358) |
| `lock / enabled`                          | نجاح       | [`293:18010`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=293-18010) | [`310:59399`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-59399) |
| `privacy / excluded-sites · invalid`      | خطأ        | [`319:52076`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=319-52076) | [`319:52178`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=319-52178) |
| `privacy / excluded-sites · import-error` | خطأ        | [`319:52110`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=319-52110) | [`319:52203`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=319-52203) |
| `privacy / excluded-sites · saved`        | نجاح       | [`319:52144`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=319-52144) | [`319:52228`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=319-52228) |

### التأهيل — الصفحة `27 — Onboarding`

| الإطار                | الحالة | الداكن                                                                              | الفاتح                                                                                |
| --------------------- | ------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `onboarding / step-1` | أساسية | [`74:2`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=74-2)     | [`308:40`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=308-40)   |
| `onboarding / step-2` | أساسية | [`74:46`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=74-46)   | [`308:76`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=308-76)   |
| `onboarding / step-3` | أساسية | [`74:100`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=74-100) | [`308:111`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=308-111) |
| `onboarding / step-4` | أساسية | [`74:142`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=74-142) | [`308:149`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=308-149) |

## 6. تغطية الحالات

| السطح            | أساسية | تحميل | فراغ | نجاح | خطأ | رفض صلاحية | إلغاء |
| ---------------- | ------ | ----- | ---- | ---- | --- | ---------- | ----- |
| `popup`          | ✓      | ✓     | ✓    | ✓    | ✓   | ✓          | ✓     |
| `capture`        | ✓      | ✓     | —    | ✓    | ✓   | ✓          | ✓     |
| `editor`         | ✓      | ✓     | ✓    | ✓    | ✓   | —          | ✓     |
| `measure`        | ✓      | —     | ✓    | ✓    | ✓   | ✓          | ✓     |
| `inspect`        | ✓      | —     | ✓    | ✓    | ✓   | ✓          | ✓     |
| `contrast-audit` | ✓      | ✓     | ✓    | ✓    | ✓   | ✓          | ✓     |
| `colors`         | ✓      | ✓     | ✓    | ✓    | ✓   | ✓          | ✓     |
| `compare`        | ✓      | ✓     | ✓    | ✓    | ✓   | ✓          | ✓     |
| `library`        | ✓      | ✓     | ✓    | ✓    | ✓   | ✓          | —     |
| `guide`          | ✓      | ✓     | ✓    | ✓    | ✓   | —          | ✓     |
| `projects`       | ✓      | ✓     | ✓    | ✓    | ✓   | —          | —     |
| `export`         | ✓      | ✓     | —    | ✓    | ✓   | ✓          | ✓     |
| `share`          | ✓      | ✓     | —    | ✓    | ✓   | ✓          | ✓     |
| `integrations`   | ✓      | —     | —    | ✓    | ✓   | ✓          | —     |
| `github`         | ✓      | ✓     | —    | ✓    | ✓   | —          | ✓     |
| `settings`       | ✓      | —     | —    | ✓    | ✓   | —          | —     |
| `shortcuts`      | ✓      | —     | —    | —    | —   | —          | —     |
| `data`           | ✓      | ✓     | ✓    | ✓    | ✓   | ✓          | ✓     |
| `support`        | ✓      | ✓     | ✓    | ✓    | ✓   | ✓          | ✓     |
| `whats-new`      | ✓      | —     | —    | —    | —   | —          | —     |
| `privacy`        | ✓      | —     | ✓    | ✓    | ✓   | ✓          | —     |
| `lock`           | ✓      | ✓     | —    | ✓    | ✓   | ✓          | —     |
| `onboarding`     | ✓      | —     | —    | —    | —   | —          | —     |

ما عُلّم «—» لا ينطبق، وسببه:

| السطح                                                        | الحالة                            | السبب                                                                           |
| ------------------------------------------------------------ | --------------------------------- | ------------------------------------------------------------------------------- |
| `capture` · `export` · `share` · `github` · `lock`           | فراغ                              | السطح يُفتح على لقطة أو إجراء قائم، فلا حالة بلا محتوى                          |
| `measure` · `inspect`                                        | تحميل                             | القراءة فورية من الصفحة، ولا انتظار يُعرض                                       |
| `editor` · `guide` · `projects` · `github`                   | رفض صلاحية                        | لا تطلب صلاحية متصفّح. خطأ GitHub في `integrations`                             |
| `library` · `projects` · `lock` · `privacy` · `integrations` | إلغاء                             | لا عملية طويلة تُلغى. الحذف يُلغى من نافذة تأكيده                               |
| `integrations`                                               | تحميل · فراغ                      | التحميل في `github / connecting`، والفراغ هو `integrations / connections` نفسها |
| `settings`                                                   | تحميل · فراغ · رفض صلاحية · إلغاء | الإعداد يُحفظ فورًا، فحالتاه نجاح وخطأ                                          |
| `privacy`                                                    | تحميل                             | القائمة محلّية وتُقرأ فورًا                                                     |
| `shortcuts` · `whats-new` · `onboarding`                     | كل الحالات                        | محتوى ثابت بلا عملية. التخطّي زرّ في الإطار نفسه                                |

## 7. القرارات وأسبابها

| #   | القرار                                                                                               | السبب                                                                                                                 |
| --- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1   | **الشريط الجانبي بلا حساب ولا «مساحة عمل»**، ومكان العدّاد «1.8 / 5 GB» مؤشّر مساحة بلا سقف مفترض    | لا حساب ولا مزامنة في المنتج. والمؤشّر يعرض ما استُهلك فعلًا من `navigator.storage.estimate`                          |
| 2   | **المشاركة محلّية**: صفحة ويب مستقلّة، والحافظة، وملفّ. والرابط السحابي بطاقة معطَّلة «قريبًا»       | الروابط السحابية تحتاج خادمًا وهي خارج 1.0. وتبقى ظاهرة معلَّمة لا مخفية                                              |
| 3   | **التكاملات: GitHub وحده.** حُذفت Linear وJira وSlack وFigma من الشاشة ومن المحرّر ومن الدليل        | خارج النطاق. زرّ بلا محرّك لا يُعرض                                                                                   |
| 4   | **SVG حُذفت من نافذة التصدير**، والصيغ ثلاث                                                          | مستبعدة بقرار (الصفّ 107). والتقسيم على ثلاث بطاقات لا أربع                                                           |
| 5   | **ضابط «خلفية شفافة» حُذف**، و«دمج التعليقات» صار سطر معلومة                                         | الأوّل بلا محرّك ولا قيمة، والثاني دائم بحكم ADR 0015 فليس خيارًا                                                     |
| 6   | **رقاقة «أصغر» تحت WebP صارت «حجمه يتبع الجودة»**                                                    | القياس نقضها: WebP بلا فقد أكبر من PNG في 14 حالة من 16 (الصفّ 104)                                                   |
| 7   | **الاختصارات `⇧⌘T/E/V/S` للالتقاط و`⌥⇧I/M/C/D` للأدوات** في كل موضع                                  | Chrome يرفض `⌥⌘`. والحروف من `manifest.config.ts` و`shared/modes.ts`                                                  |
| 8   | **«الوضع المحلّي فقط» نصّه: لا يرسل رصد شيئًا خارج هذا الجهاز**                                      | النصّ السابق وعد بإنفاذ يحظره ADR 0020 (الصفّ 126). والإنفاذ في المرحلة 11                                            |
| 9   | **كتلة «كشف تلقائي» حُذفت من لوحة الحجب**                                                            | لا محرّك لها ولا مرحلة تملكها (الصفّ 65)                                                                              |
| 10  | **إطار `library / offline` حُذف**                                                                    | المكتبة محلّية وتعمل بلا اتّصال دائمًا، ولا طابور رفع في المنتج. حالة عدم الاتّصال باقية في النافذة لأن شيفرتها قائمة |
| 11  | **التأهيل أربع خطوات: القيمة، الصلاحيات، الاختصارات، أوّل التقاط**                                   | ترتيب المرحلة 09. والخطوة السابقة «مفتاح واحد يفتح كل شيء» وصفت اختصارًا غير موجود                                    |
| 12  | **`text/tertiary` صار `ink/700` في الفاتح و`ink/400` في الداكن، و`text/secondary` الفاتح `ink/800`** | الفاتح كان يقيس 3.72 إلى 4.36 (الصفّ 10). والثانوي انتقل درجة ليبقى الفرق بين المستويين                               |
| 13  | **ألوان `*/solid` و`tool/diff/*` في الفاتح صارت الدرجة 700**                                         | النصّ فوقها كان يقيس 2.77 إلى 4.15                                                                                    |
| 14  | **`overlay/glass` صار 0.86 في الداكن و0.90 في الفاتح**                                               | النصّ الثالثي فوق الزجاج على صفحة بيضاء كان يقيس 4.09                                                                 |
| 15  | **تبويبات الإعدادات تسعة أقسام في تنقّل جانبي**، و`Tab` مفرد لما عداها                               | مكوّن `Tabs` محدود بأربعة (الصفّ 111). والتنقّل الجانبي يسع الأقسام كلّها                                             |
| 16  | **الأعداد البشرية بالأرقام الهندية** في الشريط الجانبي والمشاريع والوسوم والملاحظات                  | سياسة الأرقام. وخطّ `Geist Mono` بلا أرقام هندية فانتقلت إلى نمط عربي                                                 |
| 17  | **المقاطع التقنية معزولة** بمحرفَي العزل داخل النصّ العربي                                           | بلا عزل ينقلب `1440 × 900` إلى `900 × 1440`                                                                           |
| 18  | **التذييل بنسختين**: برابط المستودع وبدونه، وبتخطيطين: سطر وعمود                                     | رابط المستودع مخفيّ ما دام المستودع خاصًّا                                                                            |
| 19  | **لقطات المتجر نُسخ من إطارات المنتج** بعنوان عربي فوقها                                             | كانت نماذج مستقلّة بنصّ إنجليزي لا تطابق المنتج                                                                       |
| 20  | **نافذة المتصفّح `360 × 520`** في صفحة الأسس وفي النموذج التفاعلي                                    | الصفّ 1: الإطارات 520 والتوثيق كان يقول 493                                                                           |

## 8. ما يلزم المرحلة 03 من هذه المرحلة

- **لقطة توكنز جديدة**: تغيّرت قيم `text/secondary` و`text/tertiary` و`overlay/glass` و`*/solid`
  و`tool/diff/added` و`tool/diff/removed`.
- **مكوّنات تُبنى**: الأحد عشر في القسم 4.
- **حذف من الواجهة**: SVG، و«خلفية شفافة»، ومفتاح «دمج التعليقات».
- **نصوص تتغيّر**: «الوضع المحلّي فقط»، ورقاقة WebP، والاختصارات في كل موضع.
- **الشعار** في الشيفرة ما زال v2 حتى تنقله المرحلة 03.

## 9. ما بقي مفتوحًا

| البند                                                             | الحالة                                               | تملكه                                |
| ----------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------ |
| صفحات التوثيق 02 و04 إلى 11 و32 بالإنجليزية أوّلًا                | لم تُمسّ: توثيق داخلي للمصمّم والمطوّر لا واجهة منتج | قرار مالك إن أراد تعريبها            |
| شريط الأدوات في `editor / crop` و`editor / text` يُبرز أداة السهم | الأداة النشطة لم تُبدَّل في الإطارين                 | [03](../STAGES/03.md) عند ربط الإطار |
| بلاطتا الترويج في الصفحة 30 بعنوان إنجليزي وعربي                  | قائمة المتجر بلغتين بقرار النطاق                     | [28](../STAGES/28.md)                |
| ألوان شريط Chrome الحقيقية                                        | لم تُقَس                                             | [04](../STAGES/04.md)                |

## 10. عُدّة البناء

الشاشات بُنيت بدوالّ محفوظة في بيانات الملفّ المشتركة، فلا تظهر على اللوحة:
`figma.root.getSharedPluginData('rasd_build', <المفتاح>)`.

| المفتاح           | ما يفعله                                                  |
| ----------------- | --------------------------------------------------------- |
| `kit`             | دوالّ البناء: صفّ إعداد، مجموعة، نافذة، لوح، شاشة إعدادات |
| `fix`             | استبدال النصوص المخالفة للمنتج والأرقام                   |
| `raw2` · `polish` | استبدال الإطارات الخام بنُسخ المكوّنات                    |
| `bidi`            | عزل المقاطع التقنية                                       |
| `state`           | حالة فوق شاشة بإشعار عائم                                 |
| `light` · `twin`  | توليد النظير الفاتح                                       |
| `audit`           | قياس التباين                                              |

تُحمَّل في أي سكربت هكذا:

```js
const AF = Object.getPrototypeOf(async function () {}).constructor
const src = figma.root.getSharedPluginData('rasd_build', 'kit')
const K = await new AF('figma', 'return await (' + src + ')(figma)')(figma)
```
