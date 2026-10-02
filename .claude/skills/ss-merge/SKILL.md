---
name: ss-merge
description: منسّق إغلاق موجة SS — يكتشف فروع مراحلها، ويدمجها بترتيب `order`، ويثبّت الحالة، ويشغّل بوّابة الموجة المحلّية، ثمّ يدفع ويضع وسم الموجة التالية `ss-X/base`. يُستدعى يدويًّا فقط بـ`/ss-merge X` في النسخة الرئيسية.
argument-hint: <X>
disable-model-invocation: true
allowed-tools: Bash(pwd) Bash(true) Bash(git rev-parse *) Bash(git worktree list) Bash(git fetch *) Bash(git status *) Bash(git tag -l *) Bash(git branch -r *) Bash(sed -n *) Bash(grep -n *)
---

# /ss-merge $0

الموجة المطلوبة: **$0** (حرف واحد: `B`). الحاكم `AGENTS.md`، ثمّ `Docs/SS/README.md`.

## الحالة كما قيست الآن

- المجلّد: !`pwd`
- مجلّد git ومجلّده المشترك (متطابقان في النسخة الرئيسية): !`git rev-parse --git-dir --git-common-dir`
- الفرع الحالي: !`git rev-parse --abbrev-ref HEAD`
- جلب الوسوم والفروع: !`git fetch -q --prune origin --tags || true`
- الرأس ثمّ `origin/main`: !`git rev-parse HEAD origin/main || true`
- تغييرات غير ملتزمة: !`git status --porcelain`
- وسوم أساس SS وبصماتها: !`git tag -l 'ss-*/base' --format='%(refname:short) %(objectname:short)'`
- فروع مراحل SS المدفوعة: !`git branch -r --list 'origin/ss/*'`
- الـworktrees: !`git worktree list`
- صفّ الموجة في الكتلة المشتقّة: !`grep -n "^| $0 " Docs/SS/README.md || true`

## ما تفعله

1. **اقرأ** `AGENTS.md` (محمَّل)، ثمّ من `Docs/SS/README.md`: الكتلة المشتقّة (صفّ الموجة $0 ومراحلها بترتيب الدمج
   وفحصها وجولتها اليدوية)، و«الملكية ومناطق التعارض»، و«دور: إغلاق الموجة»؛ ومن `Docs/SS/waves.json` نموذج الدمج
   (`merge_model`) إن وُجد.
2. **الجلسة في النسخة الرئيسية** (المجلّدان أعلاه متطابقان) وعلى `main`. وإلا توقّف واطلب جلسة جديدة بلا worktree.
   والموجة المنفردة لا تُدمج هنا: تغلقها جلسة مرحلتها بـ`/ss`.
3. **نفّذ «دور: إغلاق الموجة» خطوةً خطوة.** `‹WAVE›` هو $0، و`‹NEXT›` الحرف التالي (لا وسم بعد الأخيرة)، و`‹GATE›` من
   صفّ الموجة. الفروع تُكتشف من ترويساتها لا من أسمائها، ولا يكتب المالك اسم فرع ولا أمر git.
4. **كل شرط يُقاس بأمر** تشغّله أنت — ما طُبع أعلاه سياقٌ لا دليل. وسقوط شرط يوقف الدمج بطباعة ما سقط.
5. **الحكم محلّي:** `RASD_GATE_BASE=ss-‹WAVE›/base pnpm gate:a` ثمّ `pnpm verify:wave --base ss-‹WAVE›/base --size ‹GATE›`
   (ومن SS7 فصاعدًا `--firefox`) على الشجرة النظيفة. لا تنتظر GitHub Actions، ولا تدفع حالةً لم تجتز البوّابة، ولا تضع
   وسمًا على التزام لم يجتزها.
6. **البلاغ الأخير:** الموجة انتهت، والتالية مفتوحة على وسمها، ولكل مرحلة فيها أمرها (`/ss SSn`) ونموذجها ووصفة جلستها كما في
   اللوحة `Docs/SS/board.html`، وما بقي من worktrees ليؤرشف المالك جلساتها.
