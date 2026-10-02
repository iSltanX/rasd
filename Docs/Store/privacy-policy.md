# سياسة الخصوصية العامّة — نصّ الصفحة `https://www.bysltan.com/rasd/privacy`

> النصّ الذي يُنشر في موقع المالك ويُلصق رابطه في حقل «Privacy policy URL» في المتجرين. **مبنيٌّ من
> [`Docs/Privacy.md`](../Privacy.md) ولا يزيد عليه** — ذاك المرجع المقيس جملةً جملة، وهذا صياغته لزائرٍ لا يقرأ الشيفرة.
> فأيّ تغيير في سلوك رصد يغيّر ذاك أوّلًا ثمّ هذا، ويُحدَّث تاريخ السريان (`Docs/Store/checklist.md`).
>
> بلا اسم متصفّح بعينه: سياسة Edge تطلب ألّا تحيل سياسةٌ تُعرض لمستخدميه إلى متصفّحٍ آخر (Developer policies 1.5.2).

---

## سياسة الخصوصية — رصد

**تسري من 2 أكتوبر 2026.** رصد إضافة متصفّح للفحص البصري يطوّرها سلطان ([bysltan.com](https://www.bysltan.com)).

### الخلاصة

كل ما تحفظه في رصد يبقى على جهازك. لا حساب، ولا خادم يحفظ مكتبتك، ولا قياس استعمال، ولا إعلانات، ولا بيع لأيّ
بيانات. «الوضع المحلّي فقط» مفعّل افتراضيًّا، وما دام مفعّلًا لا يرسل رصد طلب شبكة واحدًا.

### ما يُحفظ على جهازك

- **المكتبة:** اللقطات وصورها، والمشاريع والوسوم، ولوحات الألوان، والمراجع، والمشكلات، وأدلّة الخطوات — في قاعدة
  بيانات المتصفّح المحلّية. ومع كل لقطة عنوان الصفحة ورابطها كما التقطتها.
- **الإعدادات:** ومنها المواقع المستثناة، وحالة قفل المكتبة إن فعّلته.
- **رمز GitHub إن اتّصلت:** مشفّرًا بمفتاحٍ لا يُصدَّر من المتصفّح.
- **مسودة بلاغ واحدة** إن لم يكتمل إرسال بلاغ — بصورتها بعد الحجب.

لا شيء يُحفظ في تخزين المواقع التي تزورها، ولا يُزامَن شيء مع حسابك في المتصفّح.

### ما يُرسَل، وإلى من، ومتى

لا يُرسَل شيء إلا في حالتين، كلتاهما تشترط أن تطفئ «الوضع المحلّي فقط» بنفسك، وأن تمنح إذن الاتّصال بالخدمة، وأن
تضغط «أرسل» بعد مراجعة ما سيُرسَل بالضبط:

1. **GitHub** — إن اتّصلت برمزك وطلبت فتح Issue: يُرسَل ما راجعته في نافذة الإرسال وحده، إلى مستودعٍ تختاره أنت، عبر
   `api.github.com`. والرمز يُرسَل إلى GitHub وحده.
2. **«أبلغ عن مشكلة»** — يُرسَل إلى مطوّر رصد:
   - ما كتبته: العنوان، وماذا حدث، والخطوات، وماذا توقّعت.
   - صورة إن أرفقتها أنت، بعد قصّها وحجب ما تريد. يُعاد ترميزها قبل الإرسال فلا تخرج بياناتها الوصفية (ومنها الموقع
     الجغرافي)، والحجب جزءٌ من بكسلاتها لا يُستعاد.
   - معلومات تشخيص: إصدار رصد، ونوع النظام وإصداره، والمتصفّح ومحرّكه ونسخة رصد وهدف بنائها ومصدر تثبيتها، ولغة
     الواجهة — والأداة ورمز الخطأ إن فتحت البلاغ من رسالة خطأ.
   - معرّفٌ عشوائي للبلاغ يمنع تكراره، لا يعرّفك ولا يعرّف جهازك.

   **ولا يُرسَل أبدًا:** رابط الصفحة التي كنت عليها ولا عنوانها ولا محتواها، ولا مكتبتك ولا إعداداتك. ولا يطلب البلاغ
   بريدًا ولا اسمًا.

   يصل البلاغ إلى خادمٍ صغير يشغّله المطوّر على Cloudflare Workers، يتحقّق منه ويحدّ عدد البلاغات من الشبكة الواحدة
   ببصمةٍ مؤقّتة لعنوان IP لا تُحفظ، ثمّ يحفظه في مستودع دعمٍ **خاصّ** على GitHub لا يراه إلا المطوّر. Cloudflare وGitHub
   مزوّدا خدمةٍ للمطوّر، ولا يُنشر البلاغ ولا صورته.

### الصلاحيات

لا وصول دائم إلى المواقع: يعمل رصد على الصفحة التي تطلبه عليها بنقرتك أو اختصارك. والصلاحيات الاختيارية (التنزيلات،
والوصول إلى موقعٍ بعينه، والخدمتان أعلاه) تُطلب حين تحتاجها وتسحبها من صفحة الإضافات متى شئت.

### بعد إزالة الإضافة

حين تزيل رصد يفتح المتصفّح صفحةً في هذا الموقع تسأل سؤالًا واحدًا اختياريًّا عن سبب الإزالة. رابطها ثابت بلا معرّف ولا
بيانات من الإضافة، فلا نعرف من الزائر، ولا يُرسَل شيء إلا إن أجبت وضغطت «أرسل».

### التصفّح الخاص

لرصد في النوافذ الخاصّة نسخةٌ منفصلة. وافتراضيًّا تعمل أدواتها ولا تحفظ شيئًا في المكتبة؛ ويمكنك من الإعدادات أن
توقفها في النوافذ الخاصّة أو أن تسمح لها بالحفظ.

### المدّة والحذف

- ما تحفظه يبقى حتى تحذفه. ويمكنك تفعيل حذفٍ دوري بعد 7 أو 30 أو 90 يومًا.
- المحذوف يبقى في سلّة المحذوفات 30 يومًا لتستعيده، ثمّ يُمحى.
- «احذف كل البيانات» في الإعدادات يمحو كل ما سبق. وإزالة الإضافة تمحو كل ما تملكه.
- البلاغ يبقى في مستودع الدعم ما دام نافعًا لمتابعة المشكلة. ولحذفه أرسل بلاغًا جديدًا تكتب فيه «احذف البلاغ #رقم»،
  أو راسل المطوّر من [bysltan.com](https://www.bysltan.com) — فيُحذف البلاغ وصورته نهائيًّا.

### الاستعمال المحدود

استعمال رصد للبيانات يلتزم سياسة بيانات المستخدم في Chrome Web Store ومنها متطلّبات «الاستعمال المحدود» (Limited
Use): لا تُستعمل البيانات إلا لغرض رصد الواحد، ولا تُنقل إلا كما وُصف أعلاه، ولا تُستعمل للإعلانات ولا تُباع ولا
تُستعمل لتقدير الجدارة الائتمانية.

### التغييرات

أيّ تغيير في ما يحفظه رصد أو يرسله يُكتب هنا قبل أن يصل إلى المستخدمين، مع تاريخ سريانٍ جديد.

---

## Privacy policy — Rasd

**Effective 2 October 2026.** Rasd is a visual-inspection browser extension developed by Sultan
([bysltan.com](https://www.bysltan.com)).

### Summary

Everything you save in Rasd stays on your device. There is no account, no server that stores your library, no usage
analytics, no ads and no sale of any data. "Local only" mode is on by default, and while it is on Rasd makes no network
request at all.

### What is stored on your device

- **Your library:** captures and their images, projects and tags, colour palettes, references, issues and step guides —
  in the browser's local database. Each capture keeps the page title and address it was taken from.
- **Your settings**, including excluded sites and the library-lock state if you enable it.
- **Your GitHub token, if you connect:** encrypted with a key the browser will not export.
- **One report draft**, if sending a report did not complete — with its image after your redactions.

Nothing is written to the storage of the websites you visit, and nothing is synced with your browser account.

### What is sent, to whom, and when

Nothing is sent except in two cases. Both require you to turn off "Local only" yourself, grant the connection permission,
and press "Send" after reviewing exactly what will be sent:

1. **GitHub** — if you connect your token and ask to open an issue: only what you reviewed in the send dialog is sent, to a
   repository you choose, through `api.github.com`. The token is sent to GitHub only.
2. **"Report a problem"** — sent to the developer of Rasd:
   - What you wrote: the title, what happened, the steps and what you expected.
   - An image, if you attach one, after your crop and redactions. It is re-encoded before sending so its metadata
     (including location) does not leave, and redactions are part of its pixels and cannot be recovered.
   - Diagnostics: the Rasd version, operating system type and version, browser and version, and interface language — plus
     the tool and error code if you opened the report from an error message.
   - A random report ID that prevents duplicates; it identifies neither you nor your device.

   **Never sent:** the address, title or content of the page you were on, your library or your settings. The report asks
   for no email and no name.

   The report reaches a small server the developer runs on Cloudflare Workers, which validates it and limits the number of
   reports per network using a temporary fingerprint of the IP address that is not stored, then saves it in a **private**
   GitHub support repository that only the developer can see. Cloudflare and GitHub act as service providers to the
   developer; reports and their images are never published.

### Permissions

No permanent access to websites: Rasd works on the page where you invoke it with a click or shortcut. Optional permissions
(downloads, access to a specific site, and the two services above) are requested when needed, and you can revoke them
from the extensions page at any time.

### After removing the extension

When you remove Rasd, the browser opens a page on this site with one optional question about why. Its address is fixed,
with no identifier and no data from the extension, so we do not know who is visiting, and nothing is sent unless you answer
and press "Send".

### Private browsing

Rasd runs as a separate copy in private windows. By default its tools work there and nothing is saved to the library; in
Settings you can turn it off in private windows or allow it to save.

### Retention and deletion

- What you save stays until you delete it. You can turn on automatic deletion after 7, 30 or 90 days.
- Deleted items stay in the trash for 30 days so you can restore them, then they are erased.
- "Delete all data" in Settings erases everything above. Removing the extension erases everything it owns.
- A report stays in the support repository while it is useful for following up the problem. To delete it, send a new
  report saying "delete report #number", or contact the developer through [bysltan.com](https://www.bysltan.com) — the
  report and its image are then deleted permanently.

### Limited Use

Rasd's use of information complies with the Chrome Web Store User Data Policy, including the Limited Use requirements:
data is used only for Rasd's single purpose, is transferred only as described above, and is never used for advertising,
sold, or used to determine creditworthiness.

### Changes

Any change to what Rasd stores or sends is written here, with a new effective date, before it reaches users.
