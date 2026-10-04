# رصد — تعليمات Claude Code

@AGENTS.md

قواعد التنفيذ والتحقّق والالتزام كلّها في `AGENTS.md` أعلاه؛ لا تُكرَّر هنا. وما يلزم إضافةً لمن يبدأ من هذا الملفّ:

- **البيئة والأوامر والبنية:** [`Docs/Development.md`](Docs/Development.md). **المرجع الهندسي وسجلّ القرارات:** [`Docs/Engineering.md`](Docs/Engineering.md) و[`Docs/ADR/`](Docs/ADR/).
- **الحالة:** رصد 1.0.0 منشورة في Chrome Web Store؛ بقية القنوات في [`Docs/Release/channels.md`](Docs/Release/channels.md) لم تُنشر، والنشر بأمر المالك وحده.
- **المستودع عامّ والشيفرة غير مفتوحة المصدر** (`UNLICENSED`): لا يُغيَّر الترخيص ولا نصّ EULA ولا ملفّات `licenses/`.
- **خارج Git ومحلّي بحت:** `.claude/` (جلسات ونُسَخ عمل معزولة)، و`dist*/` و`coverage/` و`artifacts/` مخرَجات تُعاد.
- **ترقيم المراحل في التعليقات** (`STAGES/NN` · `SSn` · «الموجة») تاريخيّ لا روابط — `AGENTS.md` §8.
