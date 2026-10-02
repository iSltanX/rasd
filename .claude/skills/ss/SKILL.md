---
name: ss
description: يبدأ مرحلة من نظام SS (الخطّة النشطة منذ 2026-10-02) أو يستأنفها — مرحلة ضمن موجة متوازية في worktree، أو مرحلة منفردة في النسخة الرئيسية. يُستدعى يدويًّا فقط بـ`/ss SSn`.
argument-hint: <SSn>
disable-model-invocation: true
allowed-tools: Bash(pwd) Bash(true) Bash(git rev-parse *) Bash(git worktree list) Bash(git fetch *) Bash(git status *) Bash(git tag -l *) Bash(git branch -r *) Bash(sed -n *) Bash(grep -n *)
---

# /ss $0

المرحلة المطلوبة: **$0** (بالصيغة `SS3` لا `3`). الحاكم `AGENTS.md`، ثمّ `Docs/SS/README.md`، ثمّ ملفّ المرحلة
`Docs/SS/stages/$0.md`. و«ماذا ولماذا» في `Docs/Browsers/Architecture.md`.

## الحالة كما قيست الآن

- المجلّد: !`pwd`
- مجلّد git ومجلّده المشترك (يختلفان في worktree): !`git rev-parse --git-dir --git-common-dir`
- الـworktrees: !`git worktree list`
- الفرع الحالي: !`git rev-parse --abbrev-ref HEAD`
- جلب الوسوم: !`git fetch -q origin --tags || true`
- الرأس ثمّ `origin/main`: !`git rev-parse HEAD origin/main || true`
- تغييرات غير ملتزمة: !`git status --porcelain --untracked-files=no`
- وسوم أساس SS وبصماتها: !`git tag -l 'ss-*/base' --format='%(refname:short) %(objectname:short)'`
- ترويسة المرحلة: !`sed -n '1,/^---$/p' Docs/SS/stages/$0.md || true`

## ما تفعله

1. **اقرأ** `AGENTS.md` (محمَّل)، ثمّ `Docs/SS/README.md` كاملًا (القواعد والملكية والأدوار وصيغة التقرير)، ثمّ
   `Docs/SS/stages/$0.md` كاملًا، ثمّ ما يحيل إليه من `Docs/Browsers/Architecture.md`. إن لم تُطبع ترويسة أعلاه فالمعرّف
   خاطئ: توقّف واطلب معرّفًا بصيغة `SSn`.
2. **حدّد الدور** من حقل `branch` في الترويسة:
   - `ss/…` ⇐ **مرحلة ضمن موجة** — نفّذ «دور: مرحلة ضمن موجة» في `Docs/SS/README.md` حرفيًّا، والجلسة يجب أن تكون في
     worktree (المجلّدان أعلاه مختلفان). وإلا توقّف واطلب جلسة جديدة بخيار worktree.
   - `main` ⇐ **مرحلة منفردة** — نفّذ «دور: مرحلة منفردة»، والجلسة في النسخة الرئيسية (المجلّدان متطابقان). وإلا توقّف.
3. **كل شرط في خطوة التحقّق يُقاس بأمر** تشغّله أنت، ولا يُفترض من المطبوع أعلاه — ما طُبع سياقٌ لا دليل. وسقوط شرط
   واحد يوقف الجلسة بطباعة ما سقط.
4. **القيم:** `‹ID›` هو $0، و`‹WAVE›` حرف موجتها من الترويسة، و`‹BRANCH›` و`‹MODEL›` و`‹GATE›` منها كذلك. وإن كان نموذج
   الجلسة غير المقترح فاذكر ذلك سطرًا وتابع. والنموذج الافتراضي في SS Sonnet 5.5، والأقوى بسببٍ في `why_model`.
5. **التنفيذ في هذه الجلسة** بلا تنسيق متعدّد الوكلاء: وكيل فرعي صغير واحد لمهمّة معزولة فقط إن لزم.
6. **حرّاس كروم** عبر `pnpm verify:wave` وحده (قفل الجهاز)، وحرّاس Firefox — حين توجد — عبر `pnpm verify:firefox`.
7. **عند التسليم** حدّث الترويسة وسجلّ التنفيذ ثمّ `pnpm ss:sync`، واطبع تقرير التسليم بصيغته في `Docs/SS/README.md`
   وتوقّف. لا تبدأ مرحلة أخرى.
