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

| المكوّن                                     | التعديل                                                           | السبب                                                                                  |
| ------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `Chip`                                      | يحتضن نصّه، وأُضيفت الدرجات `Info` و`Compare` و`Colors`           | كان بعرض ثابت 60 فيقصّ النصّ، وثلاث درجات مستعملة في الشاشات بلا متغيّر                |
| `KeyCap`                                    | يحتضن نصّه، وخاصية `Key`، والنصّ الافتراضي `⇧⌘T`                  | كان بعرض ثابت 40، ويعرض `⌥⌘F` الذي يرفضه Chrome                                        |
| `Button`                                    | لون الأيقونة مربوط بالحالة والنوع                                 | أيقونة الزرّ الأساسي كانت رمادية على لون العلامة في الوضع الفاتح                       |
| `Empty State`                               | نصّ الاختصار `⇧⌘T`                                                | كان `⌥⌘F`                                                                              |
| `Menu` · `Tooltip` · `Banner` · `Tool Card` | نصوص الاختصارات والمشاركة والوضع المحلّي                          | تطابق المنتج المشحون                                                                   |
| `App Sidebar`                               | بند «المشكلات» آخر «المجموعات» بعدّاده — في [31](../STAGES/31.md) | مدخل مكتبة المشكلات. يسري في كل نسخه، وبُني في الشريط الجانبي مع [32](../STAGES/32.md) |

### الشعار

مجموعات v2 الثلاث (52 متغيّرًا) حُذفت بعد أن صار عدّ نُسخها صفرًا بـ`getInstancesAsync`.
استُبدلت 59 نسخة في 13 صفحة. داخل المنتج الدرجة `Adaptive`. أقسام توثيق v2 التسعة في
`99 — Archive` مفصولة النُّسخ.

## 5. الشاشات المعتمدة

216 شاشة، لكلٍّ إطار داكن وإطار فاتح — 190 من [02](../STAGES/02.md) و26 للإضافات الثلاث من [31](../STAGES/31.md). عمود «مطابق» نتيجة مقارنة كل شاشة منفَّذة بإطارها — معناه وطريقته في
§11.

### النافذة — الصفحة `13 — Extension Popup`

| الإطار                   | الحالة     | الداكن                                                                                    | الفاتح                                                                                    | منفَّذ                                                          | مطابق   |
| ------------------------ | ---------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------- |
| `popup / default`        | أساسية     | [`50:13`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=50-13)         | [`86:1726`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=86-1726)     | [`Default.tsx`](../src/pages/popup/views/Default.tsx)           | ✓ · §11 |
| `popup / capturing`      | تحميل      | [`52:13`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=52-13)         | [`310:170`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-170)     | [`Capturing.tsx`](../src/pages/popup/views/Capturing.tsx)       | ✓ · §11 |
| `popup / inspect-active` | أساسية     | [`52:134`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=52-134)       | [`310:214`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-214)     | [`LiveMode.tsx`](../src/pages/popup/views/LiveMode.tsx)         | ✓ · §11 |
| `popup / colors`         | أساسية     | [`53:24`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=53-24)         | [`310:264`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-264)     | [`LiveMode.tsx`](../src/pages/popup/views/LiveMode.tsx)         | ✓ · §11 |
| `popup / success`        | نجاح       | [`53:174`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=53-174)       | [`310:334`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-334)     | [`Success.tsx`](../src/pages/popup/views/Success.tsx)           | ✓ · §11 |
| `popup / first-run`      | أساسية     | [`54:42`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=54-42)         | [`310:369`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-369)     | [`FirstRun.tsx`](../src/pages/popup/views/FirstRun.tsx)         | ✓ · §11 |
| `popup / permission`     | رفض صلاحية | [`54:151`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=54-151)       | [`310:398`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-398)     | [`Permission.tsx`](../src/pages/popup/views/Permission.tsx)     | ✓       |
| `popup / offline`        | أساسية     | [`54:252`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=54-252)       | [`310:422`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-422)     | [`Offline.tsx`](../src/pages/popup/views/Offline.tsx)           | ✓ · §11 |
| `popup / restricted`     | رفض صلاحية | [`54:353`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=54-353)       | [`310:446`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-446)     | [`Restricted.tsx`](../src/pages/popup/views/Restricted.tsx)     | ✓ · §11 |
| `popup / error`          | خطأ        | [`304:28552`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=304-28552) | [`310:470`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-470)     | [`CaptureError.tsx`](../src/pages/popup/views/CaptureError.tsx) | ✓ · §11 |
| `popup / cancelled`      | إلغاء      | [`304:28584`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=304-28584) | [`310:494`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-494)     | [`Cancelled.tsx`](../src/pages/popup/views/Cancelled.tsx)       | ✓       |
| `popup / no-recent`      | فراغ       | [`319:56341`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=319-56341) | [`319:56442`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=319-56442) | [`Default.tsx`](../src/pages/popup/views/Default.tsx)           | ✓       |

### الالتقاط — الصفحة `14 — Capture`

| الإطار                       | الحالة     | الداكن                                                                                | الفاتح                                                                                    | منفَّذ                                                                                           | مطابق                            |
| ---------------------------- | ---------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------- |
| `capture / area-select`      | أساسية     | [`59:2`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=59-2)       | [`310:26505`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-26505) | [`AreaSelect.tsx`](../src/ui/overlay/AreaSelect.tsx)                                             | ✓                                |
| `capture / element-hover`    | أساسية     | [`59:123`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=59-123)   | [`310:26530`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-26530) | [`ElementHover.tsx`](../src/ui/overlay/ElementHover.tsx)                                         | ✓                                |
| `capture / full-page`        | تحميل      | [`61:184`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=61-184)   | [`310:26558`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-26558) | [`FullPageStatus.tsx`](../src/ui/overlay/FullPageStatus.tsx)                                     | ✓ · §11                          |
| `capture / error`            | خطأ        | [`96:305`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=96-305)   | [`310:26646`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-26646) | [`CaptureError.tsx`](../src/pages/popup/views/CaptureError.tsx) — في النافذة                     | في النافذة: `popup / error`      |
| `capture / permission`       | رفض صلاحية | [`96:377`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=96-377)   | [`310:26668`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-26668) | [`Permission.tsx`](../src/pages/popup/views/Permission.tsx) — في النافذة                         | في النافذة: `popup / permission` |
| `capture / success`          | نجاح       | [`302:332`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=302-332) | [`310:26691`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-26691) | [`notices.ts`](../src/content/notices.ts)                                                        | ✓ · §11                          |
| `capture / cancelled`        | إلغاء      | [`302:371`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=302-371) | [`310:26717`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-26717) | [`notices.ts`](../src/content/notices.ts)                                                        | ✓ · §11                          |
| `capture / element-success`  | نجاح       | [`302:408`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=302-408) | [`310:26743`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-26743) | [`notices.ts`](../src/content/notices.ts)                                                        | ✓                                |
| `capture / restricted`       | رفض صلاحية | [`302:448`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=302-448) | [`310:26772`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-26772) | [`Restricted.tsx`](../src/pages/popup/views/Restricted.tsx) — في النافذة: لا طبقة في صفحة مقيّدة | في النافذة: `popup / restricted` |
| `capture / clipboard-denied` | رفض صلاحية | [`302:584`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=302-584) | [`310:26807`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-26807) | [`notices.ts`](../src/content/notices.ts)                                                        | ✓ · §11                          |

### المحرّر — الصفحة `15 — Annotation Editor`

| الإطار                   | الحالة | الداكن                                                                                    | الفاتح                                                                                    | منفَّذ                                                               | مطابق   |
| ------------------------ | ------ | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------- |
| `editor / annotating`    | أساسية | [`70:2`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=70-2)           | [`310:27639`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-27639) | [`Annotating.tsx`](../src/pages/editor/views/Annotating.tsx)         | ✓ · §11 |
| `editor / exporting`     | تحميل  | [`99:415`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=99-415)       | [`310:27728`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-27728) | [`ExportProgress.tsx`](../src/pages/editor/parts/ExportProgress.tsx) | ✓       |
| `editor / redact`        | أساسية | [`128:133`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=128-133)     | [`310:27830`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-27830) | [`Redact.tsx`](../src/pages/editor/views/Redact.tsx)                 | ✓       |
| `editor / crop`          | أساسية | [`303:22926`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=303-22926) | [`310:27906`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-27906) | [`CropBar.tsx`](../src/pages/editor/parts/CropBar.tsx)               | ✓       |
| `editor / text`          | أساسية | [`303:23126`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=303-23126) | [`310:27976`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-27976) | [`StyleBar.tsx`](../src/pages/editor/parts/StyleBar.tsx)             | ✓ · §11 |
| `editor / empty`         | فراغ   | [`303:23312`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=303-23312) | [`310:28031`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-28031) | [`NoteList.tsx`](../src/pages/editor/parts/NoteList.tsx)             | ✓       |
| `editor / not-found`     | خطأ    | [`303:23473`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=303-23473) | [`310:28082`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-28082) | [`NotFound.tsx`](../src/pages/editor/views/NotFound.tsx)             | ✓       |
| `editor / saved`         | نجاح   | [`303:23596`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=303-23596) | [`310:28098`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-28098) | [`SaveStatus.tsx`](../src/pages/editor/parts/SaveStatus.tsx)         | ✓ · §11 |
| `editor / save-error`    | خطأ    | [`303:23699`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=303-23699) | [`310:28188`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-28188) | [`SaveStatus.tsx`](../src/pages/editor/parts/SaveStatus.tsx)         | ✓       |
| `editor / leave-unsaved` | إلغاء  | [`303:23804`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=303-23804) | [`310:28278`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-28278) | [`LeaveDialog.tsx`](../src/pages/editor/parts/LeaveDialog.tsx)       | ✓       |

### القياس — الصفحة `16 — Measure`

| الإطار                   | الحالة     | الداكن                                                                                | الفاتح                                                                                    | منفَّذ                                                                                           | مطابق                                                                      |
| ------------------------ | ---------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `measure / two-elements` | أساسية     | [`64:2`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=64-2)       | [`310:29105`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-29105) | [`overlay-app.tsx`](../src/content/overlay-app.tsx) — `MeasureLayer`                             | ✓ · §11 · لوحة «سجّل مشكلة» [32](../STAGES/32.md) صفّ الفجوة وحده (§6 188) |
| `measure / idle`         | فراغ       | [`98:251`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=98-251)   | [`310:29166`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-29166) | [`MeasureIdle.tsx`](../src/ui/overlay/MeasureIdle.tsx)                                           | ✓ · §11                                                                    |
| `measure / copied`       | نجاح       | [`303:149`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=303-149) | [`310:29197`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-29197) | — لا محرّك: القياس لا يُنسخ                                                                      | —                                                                          |
| `measure / cancelled`    | إلغاء      | [`303:222`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=303-222) | [`310:29259`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-29259) | [`notices.ts`](../src/content/notices.ts)                                                        | ✓ · §11                                                                    |
| `measure / error`        | خطأ        | [`303:265`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=303-265) | [`310:29291`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-29291) | — لا محرّك: لا كشف لعنصر مخفيّ                                                                   | —                                                                          |
| `measure / restricted`   | رفض صلاحية | [`303:310`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=303-310) | [`310:29323`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-29323) | [`Restricted.tsx`](../src/pages/popup/views/Restricted.tsx) — في النافذة: لا طبقة في صفحة مقيّدة | في النافذة: `popup / restricted`                                           |

### الفحص وتدقيق التباين — الصفحة `17 — Inspect`

| الإطار                        | الحالة     | الداكن                                                                                    | الفاتح                                                                                    | منفَّذ                                                                                           | مطابق                                                                |
| ----------------------------- | ---------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| `inspect / element-selected`  | أساسية     | [`62:2`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=62-2)           | [`310:29794`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-29794) | [`InspectPanel.tsx`](../src/ui/overlay/inspect/InspectPanel.tsx)                                 | ✓ · «سجّل مشكلة» [32](../STAGES/32.md) ✓                             |
| `inspect / idle`              | فراغ       | [`98:90`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=98-90)         | [`310:29886`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-29886) | [`InspectPanel.tsx`](../src/ui/overlay/inspect/InspectPanel.tsx) — `InspectIdle`                 | ✓ · §11 · مدخل تدقيق التباين [14](../STAGES/14.md) — فروق §6 230 (و) |
| `inspect / copied`            | نجاح       | [`303:20677`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=303-20677) | [`310:29917`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-29917) | [`notices.ts`](../src/content/notices.ts)                                                        | ✓ · §11                                                              |
| `inspect / cancelled`         | إلغاء      | [`303:20779`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=303-20779) | [`310:30010`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-30010) | [`notices.ts`](../src/content/notices.ts)                                                        | ✓                                                                    |
| `inspect / error`             | خطأ        | [`303:20820`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=303-20820) | [`310:30042`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-30042) | [`FrameBlocked.tsx`](../src/ui/overlay/FrameBlocked.tsx)                                         | بلا مشغِّل · §11                                                     |
| `contrast-audit / idle`       | فراغ       | [`303:20863`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=303-20863) | [`310:30074`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-30074) | [`AuditPanel.tsx`](../src/ui/overlay/colour/AuditPanel.tsx)                                      | فروق §6 230 (و)                                                      |
| `contrast-audit / scanning`   | تحميل      | [`303:20920`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=303-20920) | [`310:30123`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-30123) | [`AuditPanel.tsx`](../src/ui/overlay/colour/AuditPanel.tsx)                                      | فروق §6 230 (د)                                                      |
| `contrast-audit / results`    | أساسية     | [`303:20977`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=303-20977) | [`310:30171`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-30171) | [`AuditPanel.tsx`](../src/ui/overlay/colour/AuditPanel.tsx)                                      | فروق §6 230 (أ · ج · ح)                                              |
| `contrast-audit / all-pass`   | نجاح       | [`303:21094`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=303-21094) | [`310:30227`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-30227) | [`AuditPanel.tsx`](../src/ui/overlay/colour/AuditPanel.tsx)                                      | ✓                                                                    |
| `contrast-audit / empty`      | فراغ       | [`303:21147`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=303-21147) | [`310:30272`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-30272) | [`AuditPanel.tsx`](../src/ui/overlay/colour/AuditPanel.tsx)                                      | فروق §6 230 (ب)                                                      |
| `contrast-audit / timeout`    | خطأ        | [`303:21200`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=303-21200) | [`310:30317`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-30317) | [`AuditPanel.tsx`](../src/ui/overlay/colour/AuditPanel.tsx)                                      | ✓ · بلا مشهد في `design:shots`: صفحةٌ يتجاوز مسحها خمس ثوانٍ         |
| `contrast-audit / cancelled`  | إلغاء      | [`303:21263`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=303-21263) | [`310:30369`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-30369) | [`AuditPanel.tsx`](../src/ui/overlay/colour/AuditPanel.tsx)                                      | ✓                                                                    |
| `contrast-audit / error`      | خطأ        | [`303:21315`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=303-21315) | [`310:30414`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-30414) | [`AuditPanel.tsx`](../src/ui/overlay/colour/AuditPanel.tsx)                                      | فروق §6 230 (هـ)                                                     |
| `inspect / restricted`        | رفض صلاحية | [`319:53552`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=319-53552) | [`319:53790`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=319-53790) | [`Restricted.tsx`](../src/pages/popup/views/Restricted.tsx) — في النافذة: لا طبقة في صفحة مقيّدة | في النافذة: `popup / restricted`                                     |
| `contrast-audit / restricted` | رفض صلاحية | [`319:53671`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=319-53671) | [`319:53835`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=319-53835) | [`Restricted.tsx`](../src/pages/popup/views/Restricted.tsx) — في النافذة: لا طبقة في صفحة مقيّدة | في النافذة: `popup / restricted`                                     |

### الألوان — الصفحة `18 — Colors`

| الإطار                        | الحالة     | الداكن                                                                                    | الفاتح                                                                                    | منفَّذ                                                                                           | مطابق                                    |
| ----------------------------- | ---------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| `colors / sampling`           | أساسية     | [`65:2`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=65-2)           | [`310:31472`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-31472) | [`ColourPanel.tsx`](../src/ui/overlay/colour/ColourPanel.tsx)                                    | ✓ · «سجّل مشكلة» [32](../STAGES/32.md) ✓ |
| `colors / idle`               | فراغ       | [`98:424`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=98-424)       | [`310:31548`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-31548) | [`ColourPanel.tsx`](../src/ui/overlay/colour/ColourPanel.tsx) — `ColourIdle`                     | ✓                                        |
| `colors / palette-extract`    | أساسية     | [`122:157`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=122-157)     | [`310:31578`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-31578) | [`PalettePanel.tsx`](../src/ui/overlay/colour/PalettePanel.tsx)                                  | ✓ · §11                                  |
| `colors / replace`            | أساسية     | [`125:227`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=125-227)     | [`310:31685`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-31685) | [`ReplacePanel.tsx`](../src/ui/overlay/colour/ReplacePanel.tsx) — بلا مشغِّل: §6 الصفّ 92        | بلا مشغِّل · §11                         |
| `colors / scale`              | أساسية     | [`125:355`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=125-355)     | [`310:31738`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-31738) | [`ScalePanel.tsx`](../src/ui/overlay/colour/ScalePanel.tsx)                                      | ✓                                        |
| `colors / copied`             | نجاح       | [`303:22111`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=303-22111) | [`310:31831`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-31831) | [`notices.ts`](../src/content/notices.ts)                                                        | ✓ · §11                                  |
| `colors / palette-saved`      | نجاح       | [`303:22197`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=303-22197) | [`310:31908`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-31908) | [`notices.ts`](../src/content/notices.ts)                                                        | ✓ · §11                                  |
| `colors / cancelled`          | إلغاء      | [`303:22316`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=303-22316) | [`310:32016`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-32016) | [`notices.ts`](../src/content/notices.ts)                                                        | ✓ · §11                                  |
| `colors / error`              | خطأ        | [`303:22356`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=303-22356) | [`310:32047`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-32047) | [`notices.ts`](../src/content/notices.ts)                                                        | ✓ · §11                                  |
| `colors / palette-extracting` | تحميل      | [`303:22398`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=303-22398) | [`310:32078`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-32078) | [`PalettePanel.tsx`](../src/ui/overlay/colour/PalettePanel.tsx)                                  | ✓                                        |
| `colors / palette-empty`      | فراغ       | [`303:22513`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=303-22513) | [`310:32121`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-32121) | [`PalettePanel.tsx`](../src/ui/overlay/colour/PalettePanel.tsx)                                  | ✓ · §11                                  |
| `colors / restricted`         | رفض صلاحية | [`319:54026`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=319-54026) | [`319:54144`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=319-54144) | [`Restricted.tsx`](../src/pages/popup/views/Restricted.tsx) — في النافذة: لا طبقة في صفحة مقيّدة | في النافذة: `popup / restricted`         |

### المقارنة وتقريرها — الصفحة `19 — Compare`

| الإطار                      | الحالة     | الداكن                                                                                    | الفاتح                                                                                    | منفَّذ                                                                                           | مطابق                                              |
| --------------------------- | ---------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| `compare / split-reference` | أساسية     | [`69:2`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=69-2)           | [`310:32950`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-32950) | [`ReferenceOverlay.tsx`](../src/ui/overlay/compare/ReferenceOverlay.tsx)                         | ✓ · §11 · «مناطق مستثناة» مع [34](../STAGES/34.md) |
| `compare / no-reference`    | فراغ       | [`96:560`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=96-560)       | [`310:33023`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-33023) | [`ComparePanel.tsx`](../src/ui/overlay/compare/ComparePanel.tsx)                                 | ✓                                                  |
| `compare / two-captures`    | أساسية     | [`127:196`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=127-196)     | [`310:33040`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-33040) | [`ComparePage.tsx`](../src/pages/compare/ComparePage.tsx)                                        | ✓ · §11                                            |
| `compare / viewports`       | أساسية     | [`127:315`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=127-315)     | [`310:33110`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-33110) | [`ViewportGallery.tsx`](../src/ui/overlay/compare/ViewportGallery.tsx)                           | ✓                                                  |
| `compare / report`          | أساسية     | [`291:12538`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=291-12538) | [`310:33162`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-33162) | [`ReportDialog.tsx`](../src/pages/compare/parts/ReportDialog.tsx)                                | ✓ · §11                                            |
| `compare / report-done`     | نجاح       | [`291:12691`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=291-12691) | [`310:33283`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-33283) | [`ReportDialog.tsx`](../src/pages/compare/parts/ReportDialog.tsx)                                | ✓ · §11                                            |
| `compare / diff-saved`      | نجاح       | [`291:12790`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=291-12790) | [`310:33371`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-33371) | [`DiffSavedDialog.tsx`](../src/pages/compare/parts/DiffSavedDialog.tsx)                          | ✓                                                  |
| `compare / loading`         | تحميل      | [`291:12887`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=291-12887) | [`310:33457`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-33457) | [`ComparePage.tsx`](../src/pages/compare/ComparePage.tsx)                                        | ✓                                                  |
| `compare / identical`       | نجاح       | [`291:12984`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=291-12984) | [`310:33545`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-33545) | [`ComparePage.tsx`](../src/pages/compare/ComparePage.tsx)                                        | ✓ · §11                                            |
| `compare / size-mismatch`   | خطأ        | [`291:13076`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=291-13076) | [`310:33630`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-33630) | [`ComparePage.tsx`](../src/pages/compare/ComparePage.tsx)                                        | ✓ · §11                                            |
| `compare / error`           | خطأ        | [`291:13178`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=291-13178) | [`310:33722`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-33722) | [`ComparePage.tsx`](../src/pages/compare/ComparePage.tsx)                                        | ✓                                                  |
| `compare / cancelled`       | إلغاء      | [`291:13276`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=291-13276) | [`310:33803`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-33803) | — لا إلغاء في الصفحة: الفرق يُحسب مرّة عند فتحها                                                 | —                                                  |
| `compare / restricted`      | رفض صلاحية | [`319:54261`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=319-54261) | [`319:54366`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=319-54366) | [`Restricted.tsx`](../src/pages/popup/views/Restricted.tsx) — في النافذة: لا طبقة في صفحة مقيّدة | في النافذة: `popup / restricted`                   |

### المكتبة والأدلّة — الصفحة `20 — Library`

| الإطار                      | الحالة     | الداكن                                                                                    | الفاتح                                                                                    | منفَّذ                                                                                                            | مطابق   |
| --------------------------- | ---------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------- |
| `library / grid`            | أساسية     | [`66:20`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=66-20)         | [`86:1825`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=86-1825)     | [`Library.tsx`](../src/pages/library/Library.tsx)                                                                 | ✓ · §11 |
| `library / empty`           | فراغ       | [`94:55`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=94-55)         | [`310:34782`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-34782) | [`Library.tsx`](../src/pages/library/Library.tsx)                                                                 | ✓ · §11 |
| `library / loading`         | تحميل      | [`94:374`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=94-374)       | [`310:34800`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-34800) | [`Library.tsx`](../src/pages/library/Library.tsx)                                                                 | ✓       |
| `library / selection`       | أساسية     | [`94:738`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=94-738)       | [`310:34834`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-34834) | [`SelectionBar.tsx`](../src/pages/library/parts/SelectionBar.tsx)                                                 | ✓ · §11 |
| `library / palettes`        | أساسية     | [`126:222`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=126-222)     | [`310:35063`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-35063) | [`PaletteCard.tsx`](../src/pages/library/parts/PaletteCard.tsx)                                                   | ✓ · §11 |
| `library / references`      | أساسية     | [`126:660`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=126-660)     | [`310:35197`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-35197) | [`ReferenceCard.tsx`](../src/pages/library/parts/ReferenceCard.tsx)                                               | ✓ · §11 |
| `library / tags`            | أساسية     | [`126:1078`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=126-1078)   | [`310:35317`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-35317) | [`TagsPanel.tsx`](../src/pages/library/parts/TagsPanel.tsx) — لوحة لا عرض                                         | ✓ · §11 |
| `library / guide`           | أساسية     | [`128:697`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=128-697)     | [`310:35436`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-35436) | [`GuidePage.tsx`](../src/pages/library/parts/GuidePage.tsx) — مع `guide / editor` صفحةٌ واحدة                     | ✓ · §11 |
| `guide / editor`            | أساسية     | [`304:1506`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=304-1506)   | [`310:35507`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-35507) | [`GuidePage.tsx`](../src/pages/library/parts/GuidePage.tsx)                                                       | ✓ · §11 |
| `guide / export`            | أساسية     | [`304:1647`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=304-1647)   | [`310:35587`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-35587) | [`GuideExportDialog.tsx`](../src/pages/export/GuideExportDialog.tsx)                                              | ✓ · §11 |
| `guide / template-save`     | أساسية     | [`304:1922`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=304-1922)   | [`310:35691`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-35691) | [`GuideExportDialog.tsx`](../src/pages/export/GuideExportDialog.tsx) — طورٌ في النافذة                            | ✓ · §11 |
| `guide / export-loading`    | تحميل      | [`304:2130`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=304-2130)   | [`310:35786`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-35786) | [`GuideExportDialog.tsx`](../src/pages/export/GuideExportDialog.tsx)                                              | ✓ · §11 |
| `guide / export-done`       | نجاح       | [`304:2328`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=304-2328)   | [`310:35875`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-35875) | [`GuideExportDialog.tsx`](../src/pages/export/GuideExportDialog.tsx)                                              | ✓ · §11 |
| `guide / export-error`      | خطأ        | [`304:2528`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=304-2528)   | [`310:35964`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-35964) | [`GuideExportDialog.tsx`](../src/pages/export/GuideExportDialog.tsx)                                              | ✓ · §11 |
| `library / delete-confirm`  | أساسية     | [`304:2735`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=304-2735)   | [`310:36046`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-36046) | [`DeleteConfirm.tsx`](../src/pages/library/parts/DeleteConfirm.tsx)                                               | ✓ · §11 |
| `library / locked`          | رفض صلاحية | [`304:3091`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=304-3091)   | [`310:36289`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-36289) | [`Library.tsx`](../src/pages/library/Library.tsx) و[`UnlockDialog.tsx`](../src/pages/shell/lock/UnlockDialog.tsx) | ✓ · §11 |
| `library / deleted`         | نجاح       | [`304:3257`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=304-3257)   | [`310:36340`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-36340) | [`Library.tsx`](../src/pages/library/Library.tsx)                                                                 | ✓       |
| `library / storage-warning` | أساسية     | [`304:3499`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=304-3499)   | [`310:36570`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-36570) | [`Library.tsx`](../src/pages/library/Library.tsx)                                                                 | ✓       |
| `library / error`           | خطأ        | [`304:3833`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=304-3833)   | [`310:36764`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-36764) | [`Library.tsx`](../src/pages/library/Library.tsx)                                                                 | ✓       |
| `guide / export-cancelled`  | إلغاء      | [`319:54483`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=319-54483) | [`319:54835`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=319-54835) | [`GuideExportDialog.tsx`](../src/pages/export/GuideExportDialog.tsx)                                              | ✓ · §11 |
| `guide / empty`             | فراغ       | [`319:54680`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=319-54680) | [`319:54922`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=319-54922) | [`Library.tsx`](../src/pages/library/Library.tsx) — «أنشئ دليلًا» يأخذ إلى اللقطات، والإنشاء من شريط التحديد      | ✓       |

### المشاريع — الصفحة `21 — Projects`

| الإطار                      | الحالة | الداكن                                                                                    | الفاتح                                                                                    | منفَّذ                                                                             | مطابق   |
| --------------------------- | ------ | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------- |
| `projects / overview`       | أساسية | [`72:2`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=72-2)           | [`310:40776`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-40776) | [`ProjectsOverview.tsx`](../src/pages/library/parts/ProjectsOverview.tsx)          | ✓ · §11 |
| `projects / empty`          | فراغ   | [`99:33`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=99-33)         | [`310:40969`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-40969) | [`Library.tsx`](../src/pages/library/Library.tsx)                                  | ✓       |
| `projects / new`            | أساسية | [`304:26502`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=304-26502) | [`310:40987`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-40987) | [`ProjectsPanel.tsx`](../src/pages/library/parts/ProjectsPanel.tsx) — لوحة لا حوار | ✓ · §11 |
| `projects / new-error`      | خطأ    | [`304:26843`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=304-26843) | [`310:41197`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-41197) | [`Library.tsx`](../src/pages/library/Library.tsx) — إشعار خطر                      | ✓ · §11 |
| `projects / loading`        | تحميل  | [`304:27167`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=304-27167) | [`310:41402`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-41402) | [`Library.tsx`](../src/pages/library/Library.tsx)                                  | ✓       |
| `projects / error`          | خطأ    | [`304:27482`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=304-27482) | [`310:41606`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-41606) | [`Library.tsx`](../src/pages/library/Library.tsx)                                  | ✓       |
| `projects / delete-confirm` | أساسية | [`304:27809`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=304-27809) | [`310:41810`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-41810) | [`ProjectsPanel.tsx`](../src/pages/library/parts/ProjectsPanel.tsx)                | ✓       |
| `projects / created`        | نجاح   | [`304:28147`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=304-28147) | [`310:42029`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-42029) | [`ProjectsPanel.tsx`](../src/pages/library/parts/ProjectsPanel.tsx)                | ✓       |

### التصدير — الصفحة `22 — Export`

| الإطار                       | الحالة     | الداكن                                                                                  | الفاتح                                                                                    | منفَّذ                                                                                                          | مطابق   |
| ---------------------------- | ---------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------- |
| `export / modal`             | أساسية     | [`73:2`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=73-2)         | [`310:43256`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-43256) | [`ExportModal.tsx`](../src/pages/export/ExportModal.tsx)                                                        | ✓ · §11 |
| `export / done`              | نجاح       | [`129:1249`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=129-1249) | [`310:43481`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-43481) | [`ExportDone.tsx`](../src/pages/export/ExportDone.tsx)                                                          | ✓ · §11 |
| `export / pdf`               | أساسية     | [`290:480`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=290-480)   | [`310:43706`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-43706) | [`ExportModal.tsx`](../src/pages/export/ExportModal.tsx) · [`pdf-export.ts`](../src/pages/export/pdf-export.ts) | ✓ · §11 |
| `export / loading`           | تحميل      | [`290:901`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=290-901)   | [`310:43931`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-43931) | [`ExportProgress.tsx`](../src/pages/editor/parts/ExportProgress.tsx)                                            | ✓       |
| `export / error`             | خطأ        | [`290:1261`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=290-1261) | [`310:44142`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-44142) | [`ExportModal.tsx`](../src/pages/export/ExportModal.tsx)                                                        | ✓       |
| `export / permission-denied` | رفض صلاحية | [`290:1630`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=290-1630) | [`310:44346`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-44346) | [`ExportDone.tsx`](../src/pages/export/ExportDone.tsx)                                                          | ✓       |
| `export / cancelled`         | إلغاء      | [`290:1997`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=290-1997) | [`310:44561`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-44561) | [`ExportModal.tsx`](../src/pages/export/ExportModal.tsx)                                                        | ✓       |

### المشاركة المحلّية — الصفحة `23 — Share`

| الإطار                      | الحالة     | الداكن                                                                                    | الفاتح                                                                                    | منفَّذ                                                                                                              | مطابق      |
| --------------------------- | ---------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------- |
| `share / modal`             | أساسية     | [`73:361`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=73-361)       | [`310:45733`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-45733) | [`ShareDialog.tsx`](../src/pages/share/ShareDialog.tsx) · [`CaptureShare.tsx`](../src/pages/share/CaptureShare.tsx) | ✓          |
| `share / done`              | نجاح       | [`129:843`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=129-843)     | [`310:45954`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-45954) | [`ShareDialog.tsx`](../src/pages/share/ShareDialog.tsx)                                                             | ✓          |
| `share / clipboard`         | نجاح       | [`291:447`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=291-447)     | [`310:46176`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-46176) | [`ShareDialog.tsx`](../src/pages/share/ShareDialog.tsx)                                                             | ✓          |
| `share / file`              | أساسية     | [`291:829`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=291-829)     | [`310:46391`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-46391) | [`CaptureShare.tsx`](../src/pages/share/CaptureShare.tsx) — بلا مفاتيح الحذف                                        | ✓ · §6 344 |
| `share / guide`             | أساسية     | [`291:1262`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=291-1262)   | [`310:46613`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-46613) | [`GuideShare.tsx`](../src/pages/share/GuideShare.tsx)                                                               | ✓          |
| `share / loading`           | تحميل      | [`291:1658`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=291-1658)   | [`310:46838`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-46838) | [`ShareDialog.tsx`](../src/pages/share/ShareDialog.tsx)                                                             | ✓          |
| `share / error`             | خطأ        | [`291:2012`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=291-2012)   | [`310:47044`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-47044) | [`ShareDialog.tsx`](../src/pages/share/ShareDialog.tsx) — بلا «أبلغ»                                                | ✓ · §6 344 |
| `share / permission-denied` | رفض صلاحية | [`291:2381`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=291-2381)   | [`310:47248`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-47248) | [`ShareDialog.tsx`](../src/pages/share/ShareDialog.tsx) — نتيجةٌ بلافتة                                             | ✓ · §6 344 |
| `share / cancelled`         | إلغاء      | [`319:55644`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=319-55644) | [`319:55991`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=319-55991) | [`ShareDialog.tsx`](../src/pages/share/ShareDialog.tsx)                                                             | ✓          |

### التكاملات وGitHub — الصفحة `24 — Integrations`

| الإطار                              | الحالة     | الداكن                                                                                    | الفاتح                                                                                    | منفَّذ                                                                   | مطابق       |
| ----------------------------------- | ---------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------- |
| `integrations / connections`        | أساسية     | [`72:488`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=72-488)       | [`310:48570`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-48570) | [`ConnectionsPanel.tsx`](../src/pages/integrations/ConnectionsPanel.tsx) | فروق §6 417 |
| `integrations / connected`          | نجاح       | [`285:9323`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=285-9323)   | [`310:48590`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-48590) | [`ConnectionsPanel.tsx`](../src/pages/integrations/ConnectionsPanel.tsx) | فروق §6 417 |
| `integrations / auth-error`         | خطأ        | [`285:9606`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=285-9606)   | [`310:48606`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-48606) | [`ConnectionsPanel.tsx`](../src/pages/integrations/ConnectionsPanel.tsx) | —           |
| `integrations / missing-permission` | رفض صلاحية | [`285:9884`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=285-9884)   | [`310:48624`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-48624) | [`ConnectionsPanel.tsx`](../src/pages/integrations/ConnectionsPanel.tsx) | —           |
| `integrations / local-only`         | رفض صلاحية | [`285:10162`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=285-10162) | [`310:48642`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-48642) | [`ConnectionsPanel.tsx`](../src/pages/integrations/ConnectionsPanel.tsx) | —           |
| `github / connect`                  | أساسية     | [`293:18976`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=293-18976) | [`310:48659`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-48659) | [`ConnectDialog.tsx`](../src/pages/integrations/ConnectDialog.tsx)       | فروق §6 420 |
| `github / connecting`               | تحميل      | [`293:19134`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=293-19134) | [`310:48702`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-48702) | [`ConnectDialog.tsx`](../src/pages/integrations/ConnectDialog.tsx)       | —           |
| `github / issue-compose`            | أساسية     | [`293:19271`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=293-19271) | [`310:48731`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-48731) | [`IssueComposer.tsx`](../src/pages/integrations/IssueComposer.tsx)       | فروق §6 417 |
| `github / issue-preview`            | أساسية     | [`293:19455`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=293-19455) | [`310:48770`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-48770) | [`IssueComposer.tsx`](../src/pages/integrations/IssueComposer.tsx)       | فروق §6 419 |
| `github / issue-sending`            | تحميل      | [`293:19642`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=293-19642) | [`310:48807`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-48807) | [`IssueComposer.tsx`](../src/pages/integrations/IssueComposer.tsx)       | —           |
| `github / issue-sent`               | نجاح       | [`293:19779`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=293-19779) | [`310:48836`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-48836) | [`IssueComposer.tsx`](../src/pages/integrations/IssueComposer.tsx)       | —           |
| `github / issue-error`              | خطأ        | [`293:19924`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=293-19924) | [`310:48869`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-48869) | [`IssueComposer.tsx`](../src/pages/integrations/IssueComposer.tsx)       | فروق §6 421 |
| `github / issue-cancelled`          | إلغاء      | [`293:20070`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=293-20070) | [`310:48896`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-48896) | [`IssueComposer.tsx`](../src/pages/integrations/IssueComposer.tsx)       | —           |

### الإعدادات والبيانات والدعم — الصفحة `25 — Settings`

| الإطار                        | الحالة     | الداكن                                                                                    | الفاتح                                                                                    | منفَّذ                                                                                  | مطابق   |
| ----------------------------- | ---------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------- |
| `settings / capture`          | أساسية     | [`68:2`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=68-2)           | [`310:51416`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-51416) | [`CaptureTab.tsx`](../src/pages/settings/parts/CaptureTab.tsx)                          | ✓ · §11 |
| `settings / annotation`       | أساسية     | [`129:35`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=129-35)       | [`310:51437`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-51437) | [`AnnotationTab.tsx`](../src/pages/settings/parts/AnnotationTab.tsx)                    | ✓       |
| `settings / colors`           | أساسية     | [`129:313`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=129-313)     | [`310:51456`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-51456) | [`ColorsTab.tsx`](../src/pages/settings/parts/ColorsTab.tsx)                            | ✓ · §11 |
| `settings / appearance`       | أساسية     | [`129:579`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=129-579)     | [`310:51474`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-51474) | [`AppearanceTab.tsx`](../src/pages/settings/parts/AppearanceTab.tsx)                    | ✓       |
| `settings / shortcuts`        | أساسية     | [`281:862`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=281-862)     | [`310:51492`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-51492) | [`ShortcutsTab.tsx`](../src/pages/settings/parts/ShortcutsTab.tsx)                      | ✓ · §11 |
| `settings / data`             | أساسية     | [`282:1318`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=282-1318)   | [`310:51522`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-51522) | [`DataSection.tsx`](../src/pages/settings/parts/DataSection.tsx)                        | ✓ · §11 |
| `settings / about`            | أساسية     | [`282:1656`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=282-1656)   | [`310:51551`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-51551) | [`AboutSection.tsx`](../src/pages/settings/parts/AboutSection.tsx)                      | ✓       |
| `shortcuts / sheet`           | أساسية     | [`292:1691`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=292-1691)   | [`310:51577`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-51577) | [`ShortcutsSheet.tsx`](../src/pages/shell/ShortcutsSheet.tsx)                           | ✓ · §11 |
| `data / backup-progress`      | تحميل      | [`292:1916`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=292-1916)   | [`310:51633`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-51633) | [`BackupDialog.tsx`](../src/pages/settings/parts/data/BackupDialog.tsx)                 | ✓ · §11 |
| `data / backup-done`          | نجاح       | [`292:2072`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=292-2072)   | [`310:51680`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-51680) | [`BackupDialog.tsx`](../src/pages/settings/parts/data/BackupDialog.tsx)                 | ✓ · §11 |
| `data / restore-preview`      | أساسية     | [`292:2245`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=292-2245)   | [`310:51741`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-51741) | [`RestoreDialog.tsx`](../src/pages/settings/parts/data/RestoreDialog.tsx)               | ✓       |
| `data / restore-error`        | خطأ        | [`292:2416`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=292-2416)   | [`310:51801`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-51801) | [`RestoreDialog.tsx`](../src/pages/settings/parts/data/RestoreDialog.tsx)               | ✓ · §11 |
| `data / import-settings`      | أساسية     | [`292:2584`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=292-2584)   | [`310:51842`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-51842) | [`ImportSettingsDialog.tsx`](../src/pages/settings/parts/data/ImportSettingsDialog.tsx) | ✓       |
| `data / reset-confirm`        | أساسية     | [`292:2765`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=292-2765)   | [`310:51896`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-51896) | [`ResetDialog.tsx`](../src/pages/settings/parts/data/ResetDialog.tsx)                   | ✓       |
| `data / delete-confirm`       | أساسية     | [`292:2926`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=292-2926)   | [`310:51944`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-51944) | [`DeleteDialog.tsx`](../src/pages/settings/parts/data/DeleteDialog.tsx)                 | ✓ · §11 |
| `data / delete-confirm-final` | أساسية     | [`292:3109`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=292-3109)   | [`310:52006`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-52006) | [`DeleteDialog.tsx`](../src/pages/settings/parts/data/DeleteDialog.tsx)                 | ✓       |
| `data / delete-done`          | نجاح       | [`292:3268`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=292-3268)   | [`310:52050`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-52050) | [`DeleteDialog.tsx`](../src/pages/settings/parts/data/DeleteDialog.tsx)                 | ✓       |
| `data / delete-error`         | خطأ        | [`292:3419`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=292-3419)   | [`310:52094`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-52094) | [`DeleteDialog.tsx`](../src/pages/settings/parts/data/DeleteDialog.tsx)                 | ✓ · §11 |
| `support / form`              | أساسية     | [`293:4050`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=293-4050)   | [`310:52134`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-52134) | [`ReportDialog.tsx`](../src/pages/settings/parts/report/ReportDialog.tsx)               | ✓       |
| `support / form-error`        | خطأ        | [`293:4220`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=293-4220)   | [`310:52178`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-52178) | [`ReportDialog.tsx`](../src/pages/settings/parts/report/ReportDialog.tsx)               | ✓       |
| `support / image`             | أساسية     | [`293:4381`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=293-4381)   | [`310:52220`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-52220) | [`ImageStep.tsx`](../src/pages/settings/parts/report/ImageStep.tsx)                     | ✓ · §11 |
| `support / image-empty`       | فراغ       | [`293:4598`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=293-4598)   | [`310:52270`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-52270) | [`ImageStep.tsx`](../src/pages/settings/parts/report/ImageStep.tsx)                     | ✓ · §11 |
| `support / review`            | أساسية     | [`293:4760`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=293-4760)   | [`310:52315`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-52315) | [`ReportDialog.tsx`](../src/pages/settings/parts/report/ReportDialog.tsx)               | ✓ · §11 |
| `support / sending`           | تحميل      | [`293:4949`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=293-4949)   | [`310:52394`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-52394) | [`ReportDialog.tsx`](../src/pages/settings/parts/report/ReportDialog.tsx)               | ✓       |
| `support / sent`              | نجاح       | [`293:5096`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=293-5096)   | [`310:52433`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-52433) | [`ReportDialog.tsx`](../src/pages/settings/parts/report/ReportDialog.tsx)               | ✓ · §11 |
| `support / failed`            | خطأ        | [`293:5250`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=293-5250)   | [`310:52476`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-52476) | [`ReportDialog.tsx`](../src/pages/settings/parts/report/ReportDialog.tsx)               | ✓       |
| `support / local-only`        | رفض صلاحية | [`293:5414`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=293-5414)   | [`310:52528`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-52528) | [`ReportDialog.tsx`](../src/pages/settings/parts/report/ReportDialog.tsx)               | ✓       |
| `support / cancelled`         | إلغاء      | [`293:5570`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=293-5570)   | [`310:52573`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-52573) | [`ReportDialog.tsx`](../src/pages/settings/parts/report/ReportDialog.tsx)               | ✓       |
| `whats-new / card`            | أساسية     | [`293:5723`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=293-5723)   | [`310:52615`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-52615) | [`WhatsNewDialog.tsx`](../src/pages/shell/WhatsNewDialog.tsx)                           | ✓ · §11 |
| `settings / save-error`       | خطأ        | [`319:12777`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=319-12777) | [`319:13305`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=319-13305) | [`Settings.tsx`](../src/pages/settings/Settings.tsx)                                    | ✓       |
| `settings / saved`            | نجاح       | [`319:12812`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=319-12812) | [`319:13327`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=319-13327) | [`Settings.tsx`](../src/pages/settings/Settings.tsx)                                    | ✓       |
| `data / backup-cancelled`     | إلغاء      | [`319:12845`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=319-12845) | [`319:13349`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=319-13349) | [`BackupDialog.tsx`](../src/pages/settings/parts/data/BackupDialog.tsx)                 | ✓       |
| `data / backup-empty`         | فراغ       | [`319:13000`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=319-13000) | [`319:13394`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=319-13394) | [`BackupDialog.tsx`](../src/pages/settings/parts/data/BackupDialog.tsx)                 | ✓       |
| `data / permission-denied`    | رفض صلاحية | [`319:13151`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=319-13151) | [`319:13438`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=319-13438) | [`BackupDialog.tsx`](../src/pages/settings/parts/data/BackupDialog.tsx)                 | ✓ · §11 |

### الخصوصية وقفل المكتبة — الصفحة `26 — Privacy`

| الإطار                                    | الحالة     | الداكن                                                                                    | الفاتح                                                                                    | منفَّذ                                                                     | مطابق                           |
| ----------------------------------------- | ---------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------- |
| `privacy / controls`                      | أساسية     | [`68:416`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=68-416)       | [`310:58971`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-58971) | [`PrivacyTab.tsx`](../src/pages/settings/parts/PrivacyTab.tsx)             | ✓                               |
| `privacy / excluded-sites`                | أساسية     | [`285:444`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=285-444)     | [`310:58999`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-58999) | [`ExcludedSites.tsx`](../src/pages/settings/parts/ExcludedSites.tsx)       | ✓ · §11                         |
| `privacy / excluded-sites · empty`        | فراغ       | [`285:803`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=285-803)     | [`310:59023`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-59023) | [`ExcludedSites.tsx`](../src/pages/settings/parts/ExcludedSites.tsx)       | ✓ · §11                         |
| `privacy / permissions`                   | رفض صلاحية | [`285:1073`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=285-1073)   | [`310:59040`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-59040) | [`PermissionsPanel.tsx`](../src/pages/settings/parts/PermissionsPanel.tsx) | ✓ · §11                         |
| `privacy / incognito`                     | أساسية     | [`285:1379`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=285-1379)   | [`310:59060`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-59060) | [`PrivacyTab.tsx`](../src/pages/settings/parts/PrivacyTab.tsx)             | ✓ في `privacy / controls` · §11 |
| `lock / setup`                            | أساسية     | [`293:16890`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=293-16890) | [`310:59085`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-59085) | [`SetupDialog.tsx`](../src/pages/settings/parts/lock/SetupDialog.tsx)      | ✓                               |
| `lock / setup-mismatch`                   | خطأ        | [`293:17065`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=293-17065) | [`310:59133`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-59133) | [`SetupDialog.tsx`](../src/pages/settings/parts/lock/SetupDialog.tsx)      | ✓                               |
| `lock / unlock`                           | رفض صلاحية | [`293:17224`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=293-17224) | [`310:59174`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-59174) | [`UnlockDialog.tsx`](../src/pages/shell/lock/UnlockDialog.tsx)             | ✓ · §11                         |
| `lock / unlock-wrong`                     | خطأ        | [`293:17383`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=293-17383) | [`310:59219`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-59219) | [`UnlockDialog.tsx`](../src/pages/shell/lock/UnlockDialog.tsx)             | ✓ · §11                         |
| `lock / unlocking`                        | تحميل      | [`293:17542`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=293-17542) | [`310:59264`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-59264) | [`UnlockDialog.tsx`](../src/pages/shell/lock/UnlockDialog.tsx)             | لحظيّ · §11                     |
| `lock / forgot`                           | أساسية     | [`293:17686`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=293-17686) | [`310:59303`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-59303) | [`UnlockDialog.tsx`](../src/pages/shell/lock/UnlockDialog.tsx)             | ✓ · §11                         |
| `lock / disable`                          | أساسية     | [`293:17856`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=293-17856) | [`310:59358`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-59358) | [`DisableDialog.tsx`](../src/pages/settings/parts/lock/DisableDialog.tsx)  | ✓ · §11                         |
| `lock / enabled`                          | نجاح       | [`293:18010`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=293-18010) | [`310:59399`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-59399) | [`SetupDialog.tsx`](../src/pages/settings/parts/lock/SetupDialog.tsx)      | ✓ · §11                         |
| `privacy / excluded-sites · invalid`      | خطأ        | [`319:52076`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=319-52076) | [`319:52178`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=319-52178) | [`ExcludedSites.tsx`](../src/pages/settings/parts/ExcludedSites.tsx)       | ✓ · §11                         |
| `privacy / excluded-sites · import-error` | خطأ        | [`319:52110`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=319-52110) | [`319:52203`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=319-52203) | [`ExcludedSites.tsx`](../src/pages/settings/parts/ExcludedSites.tsx)       | ✓ · §11                         |
| `privacy / excluded-sites · saved`        | نجاح       | [`319:52144`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=319-52144) | [`319:52228`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=319-52228) | [`Settings.tsx`](../src/pages/settings/Settings.tsx)                       | ✓                               |

### المشكلة — الصفحات 13 و15 و16 و17 و18 و20

رُسمت في [31](../STAGES/31.md) وبُنيت في [32](../STAGES/32.md). مداخلها في إطارات قائمة: زرّ «سجّل مشكلة» في
لوحات `inspect / element-selected` و`measure / two-elements` و`colors / sampling` بنظائرها الفاتحة، وبند
«المشكلات» في `App Sidebar` (§4). وعمود «مطابق» هنا لم يُقَس بطريقة §11 بعد — ما فيه فروقٌ مقصودة مكتوبةٌ
بسببها في الصفّ 188 من `Docs/Engineering.md §6`: ميزانية `content.js` (الصفّ 187) أخرجت من النموذج المشروعَ
وخطوات الإعادة إلى تفصيل المشكلة في المكتبة، وجمعت اللون والتباين في قائمة واحدة، وجعلت «جارٍ الفحص» وعدّ
الحالات بعد الجولة سطرًا لا رقاقات. والعنصر الثاني في القياس يُثبَّت بـ⇧ والنقر (الصفّ 189).

| الإطار                   | الحالة | الداكن                                                                                  | الفاتح                                                                                    | منفَّذ                                                              | مطابق                                 |
| ------------------------ | ------ | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------- |
| `issue / create`         | أساسية | [`365:2368`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=365-2368) | [`395:2965`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=395-2965)   | [`IssueForm.tsx`](../src/ui/overlay/issues/IssueForm.tsx)           | فروق §6 188                           |
| `issue / create-spacing` | أساسية | [`373:887`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=373-887)   | [`395:65259`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=395-65259) | [`IssueForm.tsx`](../src/ui/overlay/issues/IssueForm.tsx)           | فروق §6 188                           |
| `issue / create-colour`  | أساسية | [`373:2835`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=373-2835) | [`395:65474`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=395-65474) | [`IssueForm.tsx`](../src/ui/overlay/issues/IssueForm.tsx)           | فروق §6 188                           |
| `issue / save-error`     | خطأ    | [`366:2504`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=366-2504) | [`395:3104`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=395-3104)   | [`IssueForm.tsx`](../src/ui/overlay/issues/IssueForm.tsx)           | —                                     |
| `issue / page-list`      | أساسية | [`370:2639`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=370-2639) | [`395:3245`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=395-3245)   | [`PageIssues.tsx`](../src/ui/overlay/issues/PageIssues.tsx)         | —                                     |
| `issue / page-empty`     | فراغ   | [`372:2721`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=372-2721) | [`395:3310`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=395-3310)   | [`PageIssues.tsx`](../src/ui/overlay/issues/PageIssues.tsx)         | فروق §6 188                           |
| `issue / rechecking`     | تحميل  | [`372:2873`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=372-2873) | [`395:3336`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=395-3336)   | [`PageIssues.tsx`](../src/ui/overlay/issues/PageIssues.tsx)         | فروق §6 188                           |
| `issue / recheck-result` | نجاح   | [`372:3039`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=372-3039) | [`395:3405`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=395-3405)   | [`PageIssues.tsx`](../src/ui/overlay/issues/PageIssues.tsx)         | فروق §6 188                           |
| `popup / page-issues`    | أساسية | [`376:323`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=376-323)   | [`395:64991`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=395-64991) | [`PageIssuesCard.tsx`](../src/pages/popup/parts/PageIssuesCard.tsx) | —                                     |
| `library / issues`       | أساسية | [`380:9549`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=380-9549) | [`395:61942`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=395-61942) | [`IssuesView.tsx`](../src/pages/library/parts/IssuesView.tsx)       | —                                     |
| `library / issues-empty` | فراغ   | [`381:9699`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=381-9699) | [`395:62119`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=395-62119) | [`IssuesView.tsx`](../src/pages/library/parts/IssuesView.tsx)       | —                                     |
| `library / issue-detail` | أساسية | [`382:9828`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=382-9828) | [`395:62140`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=395-62140) | [`IssueDetail.tsx`](../src/pages/library/parts/IssueDetail.tsx)     | المشروع والخطوات يُكتبان هنا (§6 188) |
| `editor / note-issue`    | أساسية | [`378:1489`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=378-1489) | [`395:65088`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=395-65088) | [`NoteList.tsx`](../src/pages/editor/parts/NoteList.tsx)            | —                                     |

ما يلزم من يبني هذه الإطارات:

- **الحالات الثلاث بلون واحد في كل موضع:** مفتوحة `status/danger`، وتحتاج تحققًا `status/warning`، ومحلولة
  `status/success` — في الرقاقة، وفي إطار العنصر على الصفحة، وفي رقمه المشترك بين الصفحة والقائمة.
- **النموذج لوحة زجاجية بجوار لوحة الأداة،** ونوع الفحص من الأداة التي فُتح منها: نمط من الفحص، ومسافة من
  القياس، ولون أو تباين من اللون. «الآن» تُقرأ من الصفحة ولا تُكتب، و«المتوقّعة» والسماح يكتبهما المستخدم.
- **لقطة الدليل تُحفظ دائمًا،** والملاحظة في المحرّر اختيارية بمربّعها. وفشل الحفظ خطأٌ فوق الأزرار يُبقي ما
  كُتب في النموذج، وزرّه الوحيد «أعد المحاولة» — لا «أبلغ عن المشكلة» في المكوّن، فالكلمة هنا للمشكلة المسجَّلة.
- **النافذة 360 × 520 لا تسع قسمين:** على صفحة لها مشكلات يحلّ «مشكلات هذه الصفحة» محلّ «الأخيرة».
- **«أعد الفحص» في الصفحة وحدها،** فالمكتبة لا تفحص صفحة غير مفتوحة — تفصيل المشكلة فيه «افتح الصفحة». وتغيير
  الحالة يدويًّا من قائمة في رأس التفصيل، ويُسجَّل في «التاريخ».
- **البصمة تُعرض بطول النصّ لا بالنصّ،** لأن النصّ الخام لا يُحفظ.

### حزمة التسليم — الصفحة 22

رُسمت في [31](../STAGES/31.md) وبُنيت في [33](../STAGES/33.md). النافذة فوق عرض المشكلات بمشكلتين محدَّدتين، وتُفتح كذلك من تفصيل المشكلة (مشكلة واحدة) ومن رأس «الملاحظات» في المحرّر (مشكلات دليلها اللقطة المفتوحة) — النافذة نفسها بلا إطارٍ ثانٍ للمدخلين.

| الإطار               | الحالة | الداكن                                                                                  | الفاتح                                                                                    | منفَّذ                                                        | مطابق       |
| -------------------- | ------ | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ----------- |
| `handoff / modal`    | أساسية | [`385:2132`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=385-2132) | [`395:62717`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=395-62717) | [`HandoffDialog.tsx`](../src/pages/handoff/HandoffDialog.tsx) | فروق §6 243 |
| `handoff / json`     | أساسية | [`386:2307`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=386-2307) | [`395:62938`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=395-62938) | [`HandoffDialog.tsx`](../src/pages/handoff/HandoffDialog.tsx) | —           |
| `handoff / building` | تحميل  | [`387:2666`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=387-2666) | [`395:63381`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=395-63381) | [`HandoffDialog.tsx`](../src/pages/handoff/HandoffDialog.tsx) | فروق §6 243 |
| `handoff / done`     | نجاح   | [`387:3028`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=387-3028) | [`395:63575`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=395-63575) | [`HandoffDialog.tsx`](../src/pages/handoff/HandoffDialog.tsx) | فروق §6 243 |
| `handoff / copied`   | نجاح   | [`386:2710`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=386-2710) | [`395:63159`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=395-63159) | [`HandoffDialog.tsx`](../src/pages/handoff/HandoffDialog.tsx) | —           |
| `handoff / error`    | خطأ    | [`387:3371`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=387-3371) | [`395:63777`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=395-63777) | [`HandoffDialog.tsx`](../src/pages/handoff/HandoffDialog.tsx) | —           |

- **المعاينة هي ما يُنسخ:** Markdown خامًا، وJSON بمخطّط `rasd.handoff/1`. والصور لا تُنسخ إلى الحافظة، بل في
  الحزمة المنزَّلة وحدها — ويقول الإشعار ذلك.
- الحاوية ZIP بلا ضغط ([ADR 0037](ADR/0037-package-writer.md))، فاسم الإطارات `rasd-handoff-YYYY-MM-DD.zip` هو المنفَّذ.
- لقطة دليل فُقدت من المكتبة خطأٌ يُصلَح بإزالة مشكلتها من الحزمة، لا بإعادة المحاولة.

### استثناء المقارنة — الصفحة 19

رُسمت في [31](../STAGES/31.md) وتُبنى في [34](../STAGES/34.md). مدخلها رأس قسم «مناطق مستثناة» في لوحة
`compare / split-reference` بنظيرها. والإطارات بترتيب القصّة: فراغ، ثمّ رسم مستطيل، ثمّ اختيار عنصر، ثمّ القائمة،
ثمّ الفرق المحسوب عليها.

| الإطار                         | الحالة | الداكن                                                                                  | الفاتح                                                                                    | منفَّذ                                                                                                                          | مطابق |
| ------------------------------ | ------ | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----- |
| `compare / exclusions`         | أساسية | [`391:1989`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=391-1989) | [`395:60472`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=395-60472) | [`ComparePanel.tsx`](../src/ui/overlay/compare/ComparePanel.tsx) · [`ZoneMarks.tsx`](../src/ui/overlay/compare/ZoneMarks.tsx)   | —     |
| `compare / exclusion-draw`     | أساسية | [`391:2217`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=391-2217) | [`395:60575`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=395-60575) | [`ZoneMarks.tsx`](../src/ui/overlay/compare/ZoneMarks.tsx) · [`compare.ts`](../src/content/tools/compare.ts)                    | —     |
| `compare / exclusion-pick`     | أساسية | [`391:2422`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=391-2422) | [`395:60665`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=395-60665) | [`ZoneMarks.tsx`](../src/ui/overlay/compare/ZoneMarks.tsx) · [`compare.ts`](../src/content/tools/compare.ts)                    | —     |
| `compare / exclusions-empty`   | فراغ   | [`391:2640`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=391-2640) | [`395:60766`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=395-60766) | [`ComparePanel.tsx`](../src/ui/overlay/compare/ComparePanel.tsx)                                                                | —     |
| `compare / diff-masked`        | أساسية | [`391:2819`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=391-2819) | [`395:60848`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=395-60848) | [`ComparePanel.tsx`](../src/ui/overlay/compare/ComparePanel.tsx)                                                                | —     |
| `compare / session-zones`      | أساسية | [`393:2742`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=393-2742) | [`395:61044`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=395-61044) | [`ZonesSection.tsx`](../src/pages/compare/parts/ZonesSection.tsx) · [`ZoneLayer.tsx`](../src/pages/compare/parts/ZoneLayer.tsx) | —     |
| `compare / exclusion-fallback` | رفض    | [`391:3022`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=391-3022) | [`395:60938`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=395-60938) | [`ComparePanel.tsx`](../src/ui/overlay/compare/ComparePanel.tsx) · [`ZoneMarks.tsx`](../src/ui/overlay/compare/ZoneMarks.tsx)   | —     |

- **المنطقة المستثناة** قناع `overlay/mask` بحدّ متقطّع `tool/compare/fg` ورقمها في زاويتها، والفرق الذي يقع
  داخلها باهتٌ لا يُعدّ. والمنطقة الساقطة إلى مستطيلها بلون `status/warning`، ومعها سطر يسمّي المحدِّد الغائب.
- **نسبة الفرق تُسمّى «على المناطق المهمّة»** متى وُجدت منطقة، ومعها ما استُثني منها.
- **مقارنة لقطتين بلا مرجع** مستطيلات وحدها — لا DOM يُختار منه عنصر — ومعلَنة «غير محفوظة» في اللوحة وعلى المنطقة.

**اختلافاتٌ مقصودة في التنفيذ** ([34](../STAGES/34.md)، [ADR 0034](ADR/0034-comparison-exclusions.md)):

- **القسم مبسوطٌ دائمًا** — القائمة وزرّا الإعداد — لا مطويًّا بعدد و«عدّل» كما في `diff-masked`. حالةٌ ثانية للقسم
  تكلّف `content.js` ما لا يشتريه شيء: التعديل بنقرة في الحالتين، وسقف المرحلة 4KB مضغوطة.
- **الاسم المعروض** اسمُ المستخدم إن وُجد، وإلا المحدِّد لمنطقة العنصر أو المقاس لمنطقة المستطيل. الإطارات تُري أسماءً
  كتبها مستخدم («الشارة المتجدّدة»)، ولا واجهة تسمية في النطاق؛ الحقل `label` محفوظ لها.
- **سطر السقوط يقول «في الصفحة» لا «في المرجع»**: العنصر يُبحث عنه في الصفحة الحيّة ساعة القياس، لا في صورة
  المرجع.
- **اقتراح مناطق العنصر من المقاسات الأخرى** («منطقتا عنصر من مقاسات أخرى لهذه الصفحة. أضفها») بلا إطار: سطرٌ
  بأجزاء اللوحة القائمة يحمل ما تقرّره ADR 0034 §3، ويظهر حين يوجد مقترحٌ عنصره في الصفحة الآن وحده.
- **وسم المنطقة داخل ركنها** لا فوق حدّها — فوق المرجع وفي المسرح معًا: مسرح صفحة المقارنة يقصّ ما يخرج عنه،
  فوسمٌ فوق منطقةٍ عند حافّته العليا يختفي.
- **تلميح الرسم والاختيار** بشريط التلميحات القائم (`اسحب` ارسم منطقة · `esc` إلغاء) لا بجملة الإطار الواحدة.
- **صفّ «مستثنى»** يقول نصيب المستثنى من مساحة التقاطع («منطقتان · 7% من الصفحة»)، وسطر صفحة المقارنة يُلحق
  بعدد البكسلات «· استُثني N» بعد «من N» كما هو.

### التأهيل — الصفحة `27 — Onboarding`

| الإطار                | الحالة | الداكن                                                                              | الفاتح                                                                                | منفَّذ                                                     | مطابق   |
| --------------------- | ------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------- |
| `onboarding / step-1` | أساسية | [`74:2`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=74-2)     | [`308:40`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=308-40)   | [`Onboarding.tsx`](../src/pages/onboarding/Onboarding.tsx) | ✓ · §11 |
| `onboarding / step-2` | أساسية | [`74:46`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=74-46)   | [`308:76`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=308-76)   | [`Onboarding.tsx`](../src/pages/onboarding/Onboarding.tsx) | ✓ · §11 |
| `onboarding / step-3` | أساسية | [`74:100`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=74-100) | [`308:111`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=308-111) | [`Onboarding.tsx`](../src/pages/onboarding/Onboarding.tsx) | ✓ · §11 |
| `onboarding / step-4` | أساسية | [`74:142`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=74-142) | [`308:149`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=308-149) | [`Onboarding.tsx`](../src/pages/onboarding/Onboarding.tsx) | ✓ · §11 |

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

**نُفِّذ في [03](../STAGES/03.md):** كل إطار في §5 عمود «منفَّذ» فيه يربطه بملفّه أو بمرحلته، والاختلافات
المقصودة وأسبابها في §11.

## 9. ما بقي مفتوحًا

| البند                                                                                          | الحالة                                                                                                           | تملكه                                                                   |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| صفحات التوثيق 02 و04 إلى 11 و32 بالإنجليزية أوّلًا                                             | لم تُمسّ: توثيق داخلي للمصمّم والمطوّر لا واجهة منتج                                                             | قرار مالك إن أراد تعريبها                                               |
| شريط الأدوات في `editor / crop` و`editor / text` يُبرز أداة السهم                              | الكود يُبرز الأداة النشطة فعلًا (الاقتصاص · النصّ)، والإطاران كما هما                                            | لا مرحلة تملكه: [31](../STAGES/31.md) فتحت الملفّ بقائمة مغلقة لا تشمله |
| بلاطتا الترويج في الصفحة 30 بعنوان إنجليزي وعربي                                               | قائمة المتجر بلغتين بقرار النطاق                                                                                 | [28](../STAGES/28.md)                                                   |
| ألوان شريط Chrome الحقيقية                                                                     | قِيست في Chrome 154: `#ffffff` و`#3c3c3c`، والحالتان مقروءتان عليهما — [`Docs/Brand/README.md`](Brand/README.md) | [04](../STAGES/04.md) — منجز                                            |
| إطارات الإضافات الثلاث: المشكلة، وحزمة التسليم، واستثناء المقارنة                              | رُسمت: ستّ وعشرون شاشة بوضعَيها في §5                                                                            | [31](../STAGES/31.md) — منجز                                            |
| `Button` بحالة `Loading`: نصّه غير مربوط بخاصية `Label`، ومعتَّم 0.70 فيقيس 3.79 : 1 في الفاتح | في [31](../STAGES/31.md) كُتب النصّ في النسخة وأُعيدت عتمته 1 في إطارَي التحميل الجديدين، والمكوّن كما هو        | مرحلة تملك Figma — تعديل مكوّن خارج قائمة 31                            |
| فواصل «الدليل» في `compare / two-captures` إطارات فارغة بمقاس 100 × 100 الافتراضي              | تطيل اللوحة نحو 245 بكسل. صُحّحت في نسخة `compare / session-zones` وحدها، والإطار كما هو                         | مرحلة تملك Figma — صقلٌ لإطار قائم خارج قائمة 31                        |

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

## 11. التنفيذ في الكود — الاختلافات المقصودة

كُتب في [`STAGES/03`](../STAGES/03.md) بتاريخ 2026-09-30. عمود «منفَّذ» في §5 يربط كل إطار بملفّه، أو
بالمرحلة التي تملك محرّكه. وما يلي كل اختلاف مقصود بين الكود وإطاره، بسببه. **قاعدة واحدة تحكمها:**
النصّ يقول ما يفعله المحرّك، وما لا محرّك له يُعرض معطَّلًا بسببه أو لا يُعرض — لا وعد بلا سلك.

**ترتيب القراءة.** Figma يرتّب أبناء الصفّ الأفقي من اليسار، فنسخُ ترتيبهم إلى DOM يعكس الصفّ في RTL.
كل صفّ أفقي في الكود بترتيب القراءة، وهذا ما أصلح النافذة كلّها، وصفحة المقارنة، وشريطَي تلميحات
المنطقة والعنصر.

**المطابقة ([`STAGES/04`](../STAGES/04.md)).** كل شاشة منفَّذة لقطةٌ حيّة من `pnpm design:shots` بمقاس
إطارها وبالوضعين، وُضعت فوق إطارها الداكن وأُصلح ما خالفه — وعمود «مطابق» في §5 نتيجتها: `✓` مطابق،
و`✓ · §11` مطابق وبقي اختلاف مقصود مكتوب هنا بسببه، و«في النافذة» حالةٌ تُرسم في النافذة لا فوق الصفحة
فمطابقتها مطابقة إطار النافذة، و«بلا مشغِّل» مكوّنٌ مبنيّ لا يبلغه المستخدم، و«—» لا تنفيذ بعد (عمود
«منفَّذ» يسمّي مرحلته أو سببه). والفاتح قُورن بعيّنة من كل صفحة لا إطارًا إطارًا: قيمه مولَّدة من لقطة
التوكنز نفسها (`pnpm tokens:check`)، فخطأ فيه خطأ توكن يظهر في كل الشاشات لا في واحدة.

### النافذة

- `inspect-active` و`colors`: بطاقة العنصر وقيم اللون في لوحة الصفحة لا في النافذة — النافذة تُغلق عند
  أوّل نقرة في الصفحة، ونقل البيانات إليها محرّكُ رسائل لا مرحلة تصميم.
- `capturing`: «المقطع ٤ من ٦» بدل الارتفاع بالبكسل — المهمّة لا تحمل الارتفاع. والسطر الفرعي يصف
  ما يفعله المحرّك (تحييد العناصر الثابتة) لا تحميل الصور المؤجَّلة الذي لا يفعله.
- `error`: «أبلغ عن المشكلة» تحت «أعد المحاولة» تفتح نافذة البلاغ في الإعدادات بالأداة ورمز الخطأ ([13](../STAGES/13.md)). `first-run`: «جولة سريعة» تفتح جولة
  التعريف في تبويب، و«ابدأ» تُتمّ التشغيل الأوّل. `success`: «مشاركة» تفتح المحرّر
  ونافذة المشاركة فوقه ([10](../STAGES/10.md)، ADR 0044)، و«نسخ» للقطات PNG وحدها (الحافظة لا تقبل غيرها).
- `restricted`: «لماذا؟» يعرض سبب التبويب نفسه — كان زرًّا صامتًا.
- مسافات أصغر بقليل من الإطار (بطاقة الالتقاط، وأداة الفحص، والبطاقة الأخيرة) كي تسع الحالة الافتراضية
  520 بلا تمرير — والإطار نفسه يقصّ جسمه بثلاثة.
- `offline`: ما يتوقّف دون اتصال بلا GitHub والإبلاغ — لا يُسمّى ما لم يُبنَ قبل [11](../STAGES/11.md)
  و[13](../STAGES/13.md). والإبلاغ بُني في 13، وسطر `offline` لم يُحدَّث فيها: النافذة لا تعرف حالة الاتّصال، والبلاغ
  يُحفظ مسودةً حين ينقطع.

### الأدوات فوق الصفحة

- **الإشعارات** (`capture / success` و`cancelled` و`clipboard-denied`، و`inspect / cancelled`،
  و`colors / copied` و`palette-saved` و`cancelled` و`error`) إشعار واحد
  ([`Notice.tsx`](../src/ui/overlay/Notice.tsx)) في مكان واحد أسفل الوسط: مكان الشريط في الخمول، وفوقه مع
  أداة، وفوق التلميحات في المنطقة والعنصر. وإشعار «تعذّر الالتقاط» بسببه بلا إطار — كان الفشل في
  `console` وحده. و`colors / error` **مثبَّت** في وضع اللون وحده تحت العابر ما دامت القطّارة عاجزة،
  لا عابرٌ يسكت بعد ثوانٍ. و«احفظ اللوحة» وأزرار التصدير معطَّلة حين لا ألوان، وسببها حالة اللوحة.
- **الشريط العائم** بلا «قلم» (التعليق في المحرّر، §6 الصفّ 13)، وفيه «تصوير عنصر» الذي أغفله الإطار.
- `measure / cancelled`: `Esc` في المحرّك يُخرج من الأداة لا يمسح التحديد، فالنصّ «خرجت من القياس ·
  اضغط ⌥⇧M لتعود». و`measure / copied` و`measure / error` لا محرّك لهما.
- `inspect / copied`: أزرار اللوحة تُنزِّل ملفًّا (الوحدة 19.2)، فالنصّ «نُزّل الملفّ».
- **بطاقتا الإرشاد** بمفاتيح المحرّك: الفحص «انقر · Esc» (لا «↑ ↓» ولا «⇧» ولا «⌘C» — لا محرّك لها في
  الفحص)، والقياس «انقر · اسحب · ⌥ بلا التصاق · Esc» (لا «⇧ + نقرة» ولا «⌥ إلى الأب»).
- **مفاتيح الاختصار** في الإشعار حيّة: من غيّر حرف الأداة من الإعدادات يرى حرفه.
- `*/restricted` في الصفحات 14 و16–19: لا طبقة تعمل في صفحة مقيّدة، فرسالتها `popup / restricted`.
  و`capture / error` و`capture / permission` في النافذة كذلك.
- «أبلغ» في إشعارات الخطأ تنتظر [13](../STAGES/13.md). و`colors / replace` مبنيّ بلا مشغِّل (§6 الصفّ 92).
- `capture / full-page`: بطاقة صغيرة بـ«المقطع ٢ من ٥» وشريط تقدّم، لا بطاقة الإطار المفصّلة بجوار خريطة
  المقاطع: المهمّة لا تحمل الارتفاع الملتقَط، والمحرّك لا يحمّل الصور المؤجّلة، ولا خريطة مقاطع —
  والبطاقة لا تقول ما لا يعرفه المحرّك.
- `measure / two-elements`: **لوحة «قياس» العائمة لم تُبنَ.** قيمها (الفجوة والمقاسان) مرسومة على الصفحة
  نفسها، وصفّا «خطوط الأساس» و«%» بلا محرّك، ومفتاح الوحدة فيها كتابة إعدادات والوحدة اليوم من
  الإعدادات. سطح جديد لا انحدار في سطح قائم — بناؤه قرار نطاق.
- `colors / palette-extract`: بلا تبويب «كل الصفحة» (لا محرّك له، `palette-panel.test.tsx`)، فلا تُعتَّم
  الصفحة كما يعتّمها الإطار علامةً على أن مصدرها كلّها. `palette-empty`: السبب ومخرجه «أظهر الحيادية»،
  و«أغلق» هو × اللوحة.
- `inspect / error`: `FrameBlocked` مبنيّة في المعرض ولا تُركَّب. الفحص يقرأ عنصر `iframe` نفسه، وما داخل
  إطار من موقع آخر لا تبلغه طبقة الصفحة العليا أصلًا — فلا حالة «تعذّرت القراءة» يقع فيها المستخدم.

### المحرّر

- «مشاركة» تفتح نافذة المشاركة ([10](../STAGES/10.md))، وقسم GitHub لا يُعرض قبل [11](../STAGES/11.md).
- `saved`: لا إشعار لكل حفظ — الحفظ تلقائي كل 800 مللي ثانية، فحالة الشريط «حُفظ قبل …» بدل إشعار كل
  ثوانٍ. `text`: لا لوحة نصّ منفصلة؛ المقاس من قسم النمط، واللون من السكّة، و«خلفية للنصّ» بلا حقل.
- السكّة اثنتا عشرة أداة لا تسع (الخطّ والنصّ والاقتصاص في المحرّك)، وسبعة ألوان لا أربعة — لوحة
  التعليق سبعة توكنز، و`verify:editor` يعدّها.
- اللوحة تُبقي ما في المحرّك ولم يرسمه الإطار: ترشيح الملاحظات بالوسم، والنمط، والطبقات، وبيانات الصفحة.
  و«نسخ» نسخٌ سريع بمقياس 1×، والمقياس 2× في نافذة التصدير.
- ألوان التعليق على القماش بدرجاتها الداكنة في الوضعين، والإطار الفاتح يرسمها بدرجات 700: المشهد يُخبَز
  في الصورة كما يُرى، فلو تبع سمة الواجهة لاختلف الملفّ المصدَّر باختلاف سمة من صدّره
  ([`colors.ts`](../src/pages/editor/colors.ts)). ألوان الواجهة فوقه — التحديد والمقابض وحدّ الحجب —
  تتبع السمة.

### المكتبة والمشاريع

- **قيد حارس:** `verify:library` حاجب ومثبَّت ببصمته، ويقود الصفحة بأسماء عناصرها — فبقيت: صفّ الأنواع،
  و«عرض المكتبة» (نشطة · الأرشيف · المهملات)، وزرّا لوحتَي المشاريع والوسوم (§6 الصفّ 139). وحوار
  `library / delete-confirm` بُني في [04](../STAGES/04.md) بدل تأكيد المتصفّح، والحارس يقوده. نصّ ملاحظته
  يقول ما يحذفه المحرّك: «مع تعليقاتها، ولا تُسترجع من المهملات» للّقطات (الحذف النهائي من المهملات)، و«لا
  مهملات لهذا النوع» للألوان واللوحات والمراجع والأدلّة — لا «لا سلّة محذوفات» الذي ينقضه وجود المهملات.
- لا تبديل قائمة وشبكة (لا عرض قائمة)، ولا «تصدير» جماعي، ولا «مشاركة» في شريط التحديد.
- العدّ بقاعدة العدد العربية («٦ لقطات» · «٢٤٨ لقطة»)، والبحث بنصّ العرض — «…والألوان» كانت تعد
  ببحث عابر للأنواع لا يفعله المحرّك. ومرشّح النوع بالأنواع الأربعة المنتَجة.
- `tags`: لوحة وسوم بعدّاتها ترشّح الشبكة، بلا إعادة تسمية ولا حذف ولا وسم جديد — لا محرّك لها.
- `empty`: بلا «التقط لقطة» — صفحة الإضافة لا تلتقط تبويبًا آخر؛ النصّ يسمّي الاختصار والنافذة.
- لافتة عدم الاتصال حُذفت بقرار التصميم 10.
- `library / locked` ([08](../STAGES/08.md)): نافذة الفكّ فوق هيكل البطاقات وحده — بلا شريط الأدوات ولا عدّادات
  الشريط الجانبي، فهي بيانات من المكتبة يمنعها الحارس (ADR 0043). والمساحة المستخدمة تُقاس وحدها: ليست من المكتبة،
  و«تعذّر قياس المساحة» كان سيقول عطلًا لم يقع. ولا «×»: لا شيء خلفها يُعاد إليه.
- **المشاريع:** نظرتها العامّة عرضٌ في المكتبة بمدخل «كل المشاريع»، وبطاقتها بلا حالة ولا موقع ولا
  «ملاحظات مفتوحة» (لا حقول لها)، و`new` لوحةٌ لا حوار لأن `verify:library` يقودها. وفشل الإنشاء
  والتعديل والحذف صار إشعار خطر — كانت النتيجة تُهمَل.
- `palettes`: بطاقة اللوحة بلا «نزّل» و«انسخ» — تصدير اللوحة في لوحتها فوق الصفحة. و`references`: بطاقة
  المرجع بأيقونة لا بصورته — مسار المصغّرات مبنيّ للّقطات وحدها — وبلا شارة حالته (لا محرّك يقارن
  المرجع بالصفحة الحيّة خارج أداة المقارنة). ولا «لوحة جديدة» ولا «أضف مرجعًا»: اللوحة تُستخرج والمرجع
  يُفلَت من أدوات الصفحة، لا من المكتبة.
- الشريط الجانبي فيه «الألوان» تحت المجموعات ولا يرسمها الإطار: المكتبة تحفظ اللون المفرد نوعًا قائمًا.
- **الدليل ([06](../STAGES/06.md)، ADR 0041):** `library / guide` و`guide / editor` صفحةٌ واحدة تُحرَّر في مكانها —
  رقاقات الصيغ من الأوّل اختصارٌ يفتح النافذة على صيغته، والمقبض والحذف و«صدّر الدليل» من الثاني. و«شارك» تفتح نافذة
  المشاركة ([10](../STAGES/10.md))، ولكل خطوةٍ زرّا «انقل إلى أعلى/أسفل» بجانب المقبض: السحب وحده يُقصي لوحة
  المفاتيح. والعنوان الفارغ يُعرض بعنوان صفحة اللقطة بديلًا. والدليل يُنشأ من «أنشئ دليلًا» في شريط التحديد
  (بترتيب الالتقاط)، و«أنشئ دليلًا» في `guide / empty` يأخذ إلى اللقطات بتلميحٍ لأن الإنشاء يحتاج تحديدًا.
- **نافذة تصدير الدليل:** الأطوار الستّة (`export` · `template-save` · `export-loading` · `export-done` ·
  `export-error` · `export-cancelled`) ورقةٌ واحدة بجسمٍ يتبدّل. «حجم الصفحة» يُعرض مع غير PDF معطَّلًا بسببٍ
  مرئيّ. وMarkdown تحت اسمها «نصٌّ للتوثيق بلا صور» — الملفّ المنفرد بلا صور، والحزمة ZIP هي Markdown بصورها.
  و«أبلغ عن المشكلة» في `export-error` لا تُعرض (محرّكها في [13](../STAGES/13.md))، و«أعد المحاولة» داخل
  التنبيه كما يرسمه. وبجانب قائمة «القالب» زرّ حذف القالب المختار — لا يرسمه الإطار، ولا يُترك قالبٌ بلا مخرج.

### التصدير

- SVG محذوفة (قرار النطاق)، وPDF تعمل منذ [05](../STAGES/05.md) بإطار `export / pdf` (ADR 0040). «ضمّن
  بيانات الصفحة» و«ضمّن قائمة الملاحظات» يعملان مع PDF، ويُعرضان مع PNG وWebP (كما يرسمهما `73:2`) معطَّلَين
  بسطرٍ يدلّ على PDF: هما صفحةٌ في الوثيقة لا تحملها صورة. و«بيانات الصفحة» معطَّلة بسببها حين يُحذف
  الوصف في الخصوصية. و«خلفية شفافة» محذوف، و«دمج التعليقات» سطر ملخّص (ADR 0015).
- PDF بلا «انسخ إلى الحافظة»: الحافظة لا تقبل الوثيقة، والإطار `290:480` يرسم «تنزيل» وحده.
- «تنزيل» و«افتح المجلّد» بدل «نزّل» و«اعرض في المجلّد» — `verify:export` يجد الزرّين بنصّيهما.

### المشاركة المحلّية

- **[10](../STAGES/10.md)، ADR 0044:** النافذة فوق المحرّر لا فوق المكتبة كما يرسم `73:361` — المحرّر يملك المشهد
  بحجبه، و«مشاركة» في النافذة تفتحه بـ`share=1`. ومسار الملفّ بلا مفاتيح الحذف (الصورة لا تحمل ما تحذفه)،
  و`permission-denied` نتيجةٌ بلافتة رفضٍ صادقة (الملفّ يُحفظ بطريق المرساة)، ولا «انسخ المسار» ولا «أبلغ عن
  المشكلة» قبل [13](../STAGES/13.md)، والحافظة في الدليل نصّ الخطوات — التفصيل في `Docs/Engineering.md §6` 344.

### التكاملات وGitHub

- **[12](../STAGES/12.md)، ADR 0051:** شاشة الاتّصالات قسمٌ في الإعدادات (`?section=integrations`) لا صفحةٌ مستقلّة
  — كما يرسمها `integrations / connections` داخل الشريط الجانبي نفسه. وحالاتها الخمس (غير متّصل · متّصل · خطأ
  مصادقة · صلاحيات ناقصة · الوضع المحلّي) تُقرأ محلّيًّا بلا شبكة، وتزيد عليها ثلاثُ حالاتٍ تمنع الاستعمال قبل أن
  يبدأ: صلاحية مضيفٍ مسحوبة، ورمزٌ محفوظٌ لا يُقرأ، فلكلٍّ لافتةٌ وزرّ فعلٍ يعمل.
- **«المستودع الافتراضي» حقل نصٍّ لا قائمة منسدلة** (`§6` 417): سرد مستودعات الحساب طلبٌ شبكيٌّ إضافي لا يطلبه
  المستخدم، ولا نداء بلا تأكيد. يقبل «المالك/الاسم» أو رابط المستودع، وصيغةٌ خاطئة تُقال ولا تُحفظ.
- **«الحساب» لا يقول «والاتّصال يعمل»**: «متّصل» تعني رمزًا قابلًا للقراءة محفوظًا، لا أن GitHub قبله الآن — ذلك
  لا يُعرف بلا سؤاله (ADR 0051 §4). فالنصّ «الحساب {الاسم}» وحده.
- **المؤلِّف نافذةٌ فوق نافذة حزمة التسليم** (من المكتبة ومن المحرّر معًا) بدل أن تكون فوق صفحة التكاملات كما يرسم
  `293:19271`: اللقطة والصور المخبوزة بعد الحجب عند تلك النافذة، فلا تُخبَز مرّتين. والصور تُعرض مصغَّرةً تحت نصّ
  البلاغ، والنصّ المعروض Markdown المصدر نفسه الذي يُرسل لا عرضًا منسَّقًا له.
- **المعاينة تقول ما سيُكتب في المستودع:** حين يُختار رفع الصورة أصلًا تظهر لافتةٌ تقول إنه التزامٌ لا يُسحب بحذف
  البلاغ (`§6` 419)، وتظهر لافتة «البلاغ يراه كل من يصل إلى المستودع» كما في الإطار؛ وحجم النصّ يُعرض من حدّ GitHub.
- **«أبلغ عن المشكلة» غير معروضة في `github / issue-error`** (`§6` 421): لا قناةَ لها بعد، وزرٌّ بلا محرّك ممنوع.
- **نافذة الاتّصال تقول Contents مع Issues** (`§6` 366، ومغلق في 420): الإطار يعد بأن «Issues تكفي»، والرفع أصلًا
  يشترط Contents كذلك. وخدمة GitHub صفٌّ في شاشة الصلاحيات بسببها، لا موقعًا (`§6` 365).
- **الإلغاء أثناء الإرسال لا يدّعي ما لا يضمنه:** يُفحص بين الخطوات، وطلبٌ خرج لا يُسحب، فيُعرض نجاحًا إن وصل.

### المقارنة

- «تصدير التقرير» و«التقط الفرق» يعملان منذ [05](../STAGES/05.md)، معطَّلَين حتى يُحسب الفرق. والشريط الجانبي
  يسرد المناطق المتغيّرة مرقَّمةً — المحرّك لا يصنّفها «مضاف · محذوف · منقول».
- `compare / report`: «الصيغة» سطرٌ ثابت PDF لا قائمة — التقرير وثيقة، وصورة الفرق وحدها لها «التقط الفرق».
  و«رابط الصفحة» معطَّل بسطر «محذوف مع البيانات الوصفية» حين يُحذف الوصف في الخصوصية. وفي «النتيجة» سطرٌ
  للمناطق المستثناة حين توجد: خارج النسبة ومخطّطة بأرقامها في صورة الفرق.
- `compare / report-done`: «افتح المجلّد» بدل «اعرض في المجلّد» كنافذة التصدير، ولا يظهر على مسار المرساة.
- `cancelled`: لا إلغاء في الصفحة — الفرق يُحسب مرّة عند فتحها.

### الإعدادات والخصوصية

- «لقطة جديدة» في الشريط الجانبي تفتح ورقة الاختصارات — صفحة الإضافة لا تلتقط تبويبًا آخر.
- «احفظ نسخة في مجلّد التنزيلات» مفتاحٌ يعمل منذ [05](../STAGES/05.md) (الصفّ 286)، يطلب صلاحية التنزيلات عند
  تشغيله ويقول تحته ما يحدث إن رُفضت. والجودة قائمة من قيم مقيسة.
- البيانات ([07](../STAGES/07.md)، [ADR 0039](ADR/0039-data-management.md)): شارة التخزين الدائم ما قرّره المتصفّح —
  «لم يمنحه المتصفّح» لا «مفعَّل» المرسومة (Chrome يرفض الطلب لإضافةٍ بـ`unlimitedStorage`، الصفّ 265)؛ وتنبيه
  الامتلاء لافتةٌ تحت مجموعة «المساحة» بعتبة المكتبة (80% و95%) — لا يرسمه الإطار؛ ونصّ النسخة يعدّ المراجع
  والمشكلات أيضًا لأنها في الملفّ.
- النسخة الاحتياطية: عدّاد التقدّم يعدّ **الصور** لا «اللقطات» (هو ما يُقرأ فعلًا)؛ والمسار في `backup-done` اسم
  الملفّ لا مسار المجلّد (مع الصلاحية يختار المستخدم المكان)؛ و`permission-denied` لا يُفشل النسخة — تُحفظ بمرساة
  ويُكتب ما فُقد تحت «النسخة جاهزة» (الصفّ 268)؛ وسطرٌ تحذيري إن تُرك سجلٌّ تالف (الصفّ 264).
- `restore-error` و`delete-error`: «أبلغ عن المشكلة» تفتح نافذة البلاغ بالأداة `data` ورمز الفشل ([13](../STAGES/13.md))؛ و«أعد المحاولة»
  في الاستعادة لرفض القاعدة وحده؛ والخطأ أربعة نصوص لا واحد: ليس نسخة · من إصدارٍ أحدث · تالف · رفضه التخزين
  (الصفّ 269). ولحالتي الفحص والكتابة نافذتا انتظار بلا إطار («يُفحص الملفّ» · «تُستعاد المكتبة») ولنجاحها
  «استُعيدت المكتبة» بما أُضيف وما بقي — والإطار لا يرسم ما بعد «استعد».
- تأكيد الحذف يعدّ المراجع والمشكلات في صفٍّ رابع، والصفر كلمةٌ («لا مشكلات») لا «٠».
- `import-settings` يزيد على الإطار مجموعة «ما سيتغيّر» (كل إعدادٍ بقيمتيه «الحالية ← الجديدة») وتحذيرًا قبل
  «احفظ المقبول» لما لا يُعكَس: مدّة احتفاظٍ تقصر، و«*» في المواقع المستثناة، و«يعمل ويحفظ» في التصفّح الخاص
  (الصفّ 271)؛ و«ما أُسقط» خمسون صفًّا ثمّ «وغيرها». و`restore-preview` يزيد لافتتين إن كان في الملفّ ما سيكنسه
  الحذف الدوري أو يطهّره تفريغ المهملات. و«آخر نسخة» في تأكيد الحذف تقول «ناقصة» حين تُرك منها سجلّ.
- الصلاحيات السبع بأسمائها وأسبابها لا ثلاثة صفوف ودّية، والاقتراحات في المواقع المستثناة باقية.
- ما في المحرّك ولم يرسمه الإطار باقٍ: مجموعة «النسخ» في الألوان، وصفّ «درجة القياس ↑/↓» في الاختصارات.
- تلميح حذف البيانات الوصفية يصف ما يُحذف فعلًا (ملفّ ICC في WebP).
- الصفحتان الفرعيتان للخصوصية (المواقع المستثناة والصلاحيات) برابط «← الخصوصية» فوق العنوان — طريق
  العودة، والإطار لا يرسم طريقًا غير التنقّل الجانبي.
- `excluded-sites · invalid` خطأٌ تحت الحقل و`import-error` لافتة، لا إشعار عابر: الخطأ يبقى حيث يُصحَّح.
- **قفل المكتبة ([08](../STAGES/08.md)، [ADR 0043](ADR/0043-library-lock.md)):** القفل حارس وصول لا تشفير، فجملتا
  الإطار عن التشفير لا تُكتبان — `lock / forgot`: «رصد لا يحفظ الرمز، فلا طريق لاستعادته ولا لفتح المكتبة بدونه»، و
  `lock / disable`: «بعد الإيقاف تُفتح المكتبة في رصد بلا رمز» (§6 الصفّ 330). وسطر الصفّ تحت «قفل المكتبة» يقول حدّه:
  «لا يشفّر ملفّاتها على القرص». وفي الصفّ زرٌّ لا يرسمه الإطار: «اقفل الآن» حين تكون مفتوحة (وإلا لا إقفال إلا
  بإغلاق المتصفّح)، و«افتح» حين تكون مقفلة (الإطار يرسم نافذة الفكّ فوق هذه الصفحة ولا يرسم ما يفتحها) — وهنا بـ«×»
  لأن خلفها صفحةً يُعاد إليها. و`unlock-wrong` يعدّ الباقي في كل خطأ لا في الثالث وحده، وبعد الخامس «أعد المحاولة بعد
  دقيقة» و«افتح» معطَّل حتى تنقضي. و`forgot` يسمّي المكتبة كلّها في صفٍّ واحد (والمشكلات منها) لا اللقطات والأدلّة
  واللوحات وحدها. و`enabled` يزيد «أو حين تقفلها بنفسك». و`unlocking` حالةٌ لحظية (اشتقاقٌ نحو 300ms) لا تُصوَّر.
- `privacy / incognito`: قائمة في صفحة الخصوصية بنصوص الصفحة الفرعية (الخيار المحدَّد يُوصف تحته)، لا صفحة
  لخيار واحد.
- `shortcuts / sheet`: «غيّر اختصارات الالتقاط» لا «غيّر الاختصارات» — صفحة Chrome تغيّر اختصارات الالتقاط
  وحدها، ومفاتيح الأدوات من قسم الاختصارات.

- **«أبلغ عن مشكلة»** (`support / *`، [13](../STAGES/13.md)، [ADR 0050](ADR/0050-problem-reports.md)) — فروقٌ مقصودة:
  - `image` و`image-empty`: «التقط من جديد» و«التقط لقطة» صارتا «اختر صورة أخرى» و«أرفق ملفًّا» مع اللصق — عقد قناة
    البلاغات المشتركة يمنع التقاطًا يجريه التطبيق للبلاغ. والحجب تغطيةٌ مصمتة وحدها، وتحته «تراجع عن آخر حجب» و«ألغِ
    القصّ» — الإطار لا يرسم تراجعًا.
  - `review`: مصغّرة الصورة **المخبوزة** فوق الصفوف — البكسلات التي ستخرج بعد القصّ والحجب (عقد القناة: «كل مرفقٍ بحجمه
    ومصغّرته»)، والإطار لا يرسمها. والنصّ كاملًا في صفٍّ عموديّ لا «كما كتبتها»، والقيم التقنية حرفًا كما تُرسَل (`full-page` لا «صفحة كاملة»، و`macos`
    و`15.3.0` في صفّين) — المعيار أن المعروض يطابق المرسَل حرفيًّا. ويزيد صفوف المعمارية واللغة والمنتَج.
  - `sent`: رقم البلاغ `#4` — رقم الـIssue في القناة نفسه، يطابق ما عند جهة الدعم — لا `RSD-1042` المرسومة.
  - النافذة 560 لا 600: هيكل نوافذ البيانات نفسه (`DataDialog`) لا نسخةٌ منه.
  - إغلاق النافذة في منتصف الخطوات بما كُتب يحفظ المسودة ويعرض `cancelled` — الإطار يرسمها للإلغاء أثناء الإرسال وحده.

### التأهيل و«ما الجديد»

كُتب في [`STAGES/09`](../STAGES/09.md)، والقرار في [ADR 0028](ADR/0028-onboarding-whats-new.md).

- **البطاقة 420 × 590 لا 560:** خطوة الصلاحيات تسرد أسباب `activeTab` و`scripting` وصلاحية المضيف بنصوص
  [`permission-policy.ts`](../src/shared/permission-policy.ts) نفسها، والبطاقة بارتفاع أطول خطواتها فلا
  يقفز «التالي» من تحت المؤشّر بين خطوة وأخرى.
- **الخطوة ٣** تعرض اختصار «منطقة» كما سجّله المتصفّح (`chrome.commands`) لا `⇧⌘T` المرسومة، وبلا اختصار
  «بلا اختصار على هذا الجهاز». **والخطوة ٤** زرّها «ابدأ» لا «التقط أوّل لقطة»: صفحة الإضافة لا تلتقط
  تبويبًا آخر (`activeTab` يُمنح بإيماءة على الصفحة المراد التقاطها)، فالزرّ يُتمّ الجولة ويعيد المستخدم إلى
  صفحته، ونصّها يقول كيف يلتقط وأن المحرّر يُفتح من إشعار الحفظ (لا تلقائيًّا — الصفّ 165). وبلاطتها «الجزء الظاهر» كما في ورقة الاختصارات.
- لون العيّنة في الخطوة ١ `color/info/500` — لونُ صفحةٍ مفحوصة لا توكن له.
- **«ما الجديد»:** البنود من `CHANGELOG.md` للنسخة المثبَّتة، والعنوان برقمين (`1.0` لا `1.0.0`). و«اقرأ سجلّ
  التغييرات» لا يُعرض ما دام رابط المستودع مخفيًّا — يعطي زائره 404. والعلامات شكل مربّع الاختيار بلا دوره:
  البند خبرٌ لا خيار. وتظهر البطاقة مرّة في أوّل صفحة يفتحها المستخدم بعد الترقية (المكتبة أو الإعدادات)، ودائمًا
  من «عن رصد ‹ ما الجديد» بسطرٍ فرعي «ما تغيّر في هذا الإصدار» لا «يظهر مرّة واحدة». وتُفتح الجولة عند
  التثبيت في الخلفية ثمّ تتقدّم ما لم يتقدّم شيءٌ آخر (ADR 0028).

### مكوّنات

- `Toggle` بمواصفة مكوّنه: مسار 40 × 22 بحدّ ومقبض أبيض 16 (كان 46 × 24 بمقبض داكن).
- `KeyCap` في جذر الظلّ بخطّ Cairo بعد Geist Mono — المفاتيح العربية («انقر» · «اسحب») كانت تسقط إلى
  خطّ النظام.
