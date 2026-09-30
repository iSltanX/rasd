---
name: stage
description: يبدأ مرحلة من خطّة الموجات أو يستأنفها — مرحلة ضمن موجة متوازية في worktree، أو مرحلة موجة منفردة في النسخة الرئيسية. يُستدعى يدويًّا فقط بـ`/stage NN`.
argument-hint: <NN>
disable-model-invocation: true
allowed-tools: Bash(pwd) Bash(true) Bash(git rev-parse *) Bash(git worktree list) Bash(git fetch *) Bash(git status *) Bash(git tag -l *) Bash(git branch -r *) Bash(sed -n *) Bash(grep -n *)
---

# /stage $0

المرحلة المطلوبة: **$0** (رقمان: `05` لا `5`). الحاكم `AGENTS.md`، ثمّ `Docs/Waves.md`.

## الحالة كما قيست الآن

- المجلّد: !`pwd`
- مجلّد git ومجلّده المشترك (يختلفان في worktree): !`git rev-parse --git-dir --git-common-dir`
- الـworktrees: !`git worktree list`
- الفرع الحالي: !`git rev-parse --abbrev-ref HEAD`
- جلب الوسوم: !`git fetch -q origin --tags || true`
- الرأس ثمّ `origin/main`: !`git rev-parse HEAD origin/main || true`
- تغييرات غير ملتزمة: !`git status --porcelain --untracked-files=no`
- وسوم الأساس وبصماتها: !`git tag -l 'wave-*/base' --format='%(refname:short) %(objectname:short)'`
- ترويسة المرحلة: !`sed -n '1,/^---$/p' STAGES/$0.md || true`
- صفّها في الخطّة: !`grep -n "^| $0 " Docs/Waves.md || true`

## ما تفعله

1. **اقرأ** `AGENTS.md` (محمَّل)، ثمّ من `Docs/Waves.md`: صفّ المرحلة في «المراحل»، وصفّ موجتها في
   «الموجات»، و«الملكية ومناطق التعارض». ثمّ `STAGES/$0.md` كاملًا. إن لم تُطبع ترويسة أعلاه فالرقم خاطئ:
   توقّف واطلب رقمًا من رقمين.
2. **حدّد الدور** من عمود «الفرع» في صفّها:
   - `stage/…` ⇐ **مرحلة ضمن موجة** — نفّذ قسم «دور: مرحلة ضمن موجة» في `Docs/Waves.md` حرفيًّا، والجلسة
     يجب أن تكون في worktree (المجلّدان أعلاه مختلفان). وإلا توقّف واطلب جلسة جديدة بخيار worktree.
   - `main` ⇐ **مرحلة في موجة منفردة** — نفّذ قسم «دور: مرحلة في موجة منفردة»، والجلسة يجب أن تكون في
     النسخة الرئيسية (المجلّدان متطابقان). وإلا توقّف واطلب جلسة جديدة بلا worktree.
3. **كل شرط في خطوة التحقّق يُقاس بأمر** تشغّله أنت، ولا يُفترض من المطبوع أعلاه — ما طُبع سياقٌ لا دليل.
   وسقوط شرط واحد يوقف الجلسة بطباعة ما سقط.
4. **القيم:** `‹NN›` هو $0، و`‹WW›` رقم موجتها برقمين، و`‹BRANCH›` عمود «الفرع»، و`‹MODEL›` عمود «النموذج».
   وإن كان نموذج الجلسة غير المقترح فاذكر ذلك سطرًا وتابع.
5. **حرّاس كروم** عبر `pnpm verify:wave` وحده — يأخذ قفلًا على الجهاز لأن منافذها مشتركة بين الجلسات.
6. **عند التسليم** اطبع تقرير التسليم بصيغته في `Docs/Waves.md` وتوقّف. لا تبدأ مرحلة أخرى.
