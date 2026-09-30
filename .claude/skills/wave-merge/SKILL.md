---
name: wave-merge
description: منسّق دمج موجة — يكتشف فروع مراحلها، ويدمجها بترتيب الخطّة، ويثبّت الحالة، ويشغّل بوّابة الموجة المحلّية، ثمّ يدفع ويضع وسم الموجة التالية. يُستدعى يدويًّا فقط بـ`/wave-merge XX` في النسخة الرئيسية.
argument-hint: <XX>
disable-model-invocation: true
allowed-tools: Bash(pwd) Bash(true) Bash(git rev-parse *) Bash(git worktree list) Bash(git fetch *) Bash(git status *) Bash(git tag -l *) Bash(git branch -r *) Bash(sed -n *) Bash(grep -n *)
---

# /wave-merge $0

الموجة المطلوبة: **$0** (رقمان: `01` لا `1`). الحاكم `AGENTS.md`، ثمّ `Docs/Waves.md`.

## الحالة كما قيست الآن

- المجلّد: !`pwd`
- مجلّد git ومجلّده المشترك (متطابقان في النسخة الرئيسية): !`git rev-parse --git-dir --git-common-dir`
- الفرع الحالي: !`git rev-parse --abbrev-ref HEAD`
- جلب الوسوم والفروع: !`git fetch -q --prune origin --tags || true`
- الرأس ثمّ `origin/main`: !`git rev-parse HEAD origin/main || true`
- تغييرات غير ملتزمة: !`git status --porcelain`
- وسوم الأساس وبصماتها: !`git tag -l 'wave-*/base' --format='%(refname:short) %(objectname:short)'`
- فروع المراحل المدفوعة: !`git branch -r --list 'origin/stage/*'`
- الـworktrees: !`git worktree list`

## ما تفعله

1. **اقرأ** `AGENTS.md` (محمَّل)، ثمّ من `Docs/Waves.md`: صفّ الموجة $0 في «الموجات» (المراحل بترتيب
   الدمج، والفحص، وصاحبة الترحيل، والجولة اليدوية)، و«الملكية ومناطق التعارض»، و«الأرقام المحجوزة»، وقسم
   «دور: منسّق الدمج — إغلاق الموجة».
2. **الجلسة في النسخة الرئيسية** (المجلّدان أعلاه متطابقان) وعلى `main`. وإلا توقّف واطلب جلسة جديدة
   بلا worktree. والموجة المنفردة لا تُدمج هنا: تغلقها جلسة مرحلتها بـ`/stage`.
3. **نفّذ «إغلاق الموجة» خطوةً خطوة.** `‹WW›` هو $0، و`‹NEXT›` الموجة التالية برقمين (لا وسم بعد
   الأخيرة). الفروع تُكتشف من ترويساتها لا من أسمائها، ولا يكتب المالك اسم فرع ولا أمر git.
4. **كل شرط يُقاس بأمر** تشغّله أنت — ما طُبع أعلاه سياقٌ لا دليل. وسقوط شرط يوقف الدمج بطباعة ما سقط.
5. **الحكم محلّي:** `RASD_GATE_BASE=wave-‹WW›/base pnpm gate:a` ثمّ `pnpm verify:wave --wave ‹WW›` على
   الشجرة النظيفة. لا تنتظر GitHub Actions، ولا تدفع حالةً لم تجتز البوّابة، ولا تضع وسمًا على التزام لم
   يجتزها.
6. **البلاغ الأخير:** الموجة انتهت، والتالية مفتوحة على وسمها، ولكل مرحلة فيها أمرها (`/stage NN`)
   ونموذجها ووصفة جلستها كما في اللوحة `Docs/Waves/board.html`، وما بقي من worktrees ليؤرشف المالك جلساتها.
