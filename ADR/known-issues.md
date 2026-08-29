# مشكلات معروفة

بنود لا تُصلَح من داخل المشروع، تُتابَع حتى تُحلّ في المنبع.

## 1. تحذير إهمال من `@crxjs/vite-plugin` في وضع التطوير

```
`server.hmr.protocol/host/port/path/clientPort/timeout/server` is deprecated. Use `server.ws.*` instead.
```

**المصدر:** `@crxjs/vite-plugin@2.7.1` يضبط `server.hmr.host` بنفسه في خطّاف `config`
(`dist/index.mjs:1987`) — مؤكَّد بـ`VITE_DEPRECATION_TRACE=1`. إعدادنا نحن يستخدم
`server.ws.*` الصحيح.

**الأثر:** تحذير فقط. `pnpm dev` يعمل وإعادة البناء عند التعديل مُثبَتة.

**المتابعة:** يزول عند ترقية CRXJS. يُعاد الفحص عند كل ترقية للإضافة أو لـVite.

## 2. `--load-extension` يُتجاهَل صمتًا في Chrome 137+

Chrome يعطّل مفتاح سطر الأوامر `--load-extension` بميزة
`DisableLoadExtensionCommandLineSwitch`. **لا خطأ ولا تحذير** — الإضافة ببساطة
لا تُحمَّل. مؤكَّد على Chrome 151.0.7922.175: ملف تعريف نظيف بعد التشغيل يحوي
ثلاث إضافات مكوّنة مدمجة فقط، وليس إضافتنا. تمرير
`--disable-features=DisableLoadExtensionCommandLineSwitch` و`--enable-unsafe-extension-debugging`
لم يُعِد المفتاح للعمل.

**الأثر:** فحص `verify:load` في المرحلة 1 كان يمرّ زائفًا — كان يلتقط
service worker لإضافة Chrome مكوّنة (`Google Network Speech`) ويظنّها إضافتنا.

**الحلّ المعتمد:** `Extensions.loadUnpacked` عبر بروتوكول DevTools، مع استهداف
معرّف إضافتنا تحديدًا. المكسب الإضافي أن Chrome **يتحقّق من صحّة البيان** ويُرجع
سبب الرفض نصًّا — وهو ما كشف عطل الاختصارات أدناه.

**التحميل اليدوي من `chrome://extensions` لم يتأثّر** — المفتاح المعطَّل هو مفتاح
سطر الأوامر لا واجهة المستخدم.

## 3. `typescript-eslint` لا يدعم TypeScript 7 بعد

TypeScript مثبَّت على 6.0.3 — انظر [ADR 0003](0003-typescript-6.md). يُعاد النظر عند
توسيع `peerDependencies` في `typescript-eslint`.

## 4. دالة `node` في `~/.zshrc` تنكسر في الأصداف غير التفاعلية

`node` و`npm` و`npx` معرَّفة كدوال kzsh تُحمّل nvm كسولًا، وتتكرّر ذاتيًا في الأصداف
غير التفاعلية (`command not found: _load_nvm`). ليست مشكلة مشروع، لكنها تُربك السكربتات:
استخدم `pnpm run <script>` أو `./node_modules/.bin/<bin>` بدل `npx`.
