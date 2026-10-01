/**
 * نصوص التكامل — **لكل سببٍ رسالةٌ تخصّه**، لا رسالة عامّة (`Docs/Design.md` §6: خطأ GitHub في `integrations`).
 *
 * الأسباب من `GitHubFailure` وهي تقابل إطارات `integrations / *` و`github / issue-error`. والرسالة تقول ثلاثة أشياء:
 * ما وقع، وهل خرج شيءٌ إلى GitHub، وما يفعله المستخدم بعدها. ورفض المصادقة يختلف عن نقص الصلاحية عن انقطاع الشبكة
 * لأن علاج كلٍّ منها مختلف: إعادة اتّصال، أو رمزٌ بصلاحية أخرى، أو انتظار.
 *
 * **لا رقم مرحلة في أي نصٍّ يراه المستخدم** (`tests/unit/no-plan-leak.test.ts`).
 */

import { countText, formatHuman } from '@/shared/bidi/numerals'

import type { GitHubFailure } from '@/modules/export/integrations/github'
import type { IssueProblem } from '@/modules/export/integrations/issue'
import type { SendError } from '@/modules/export/integrations/send'

/** أين وقع الفشل: الاتّصال بالرمز، أو رفع الصورة، أو فتح الـIssue. */
export type FailureStep = 'connect' | 'upload' | 'issue'

const FILES = {
  one: 'ملفّ واحد',
  two: 'ملفّان',
  many: 'ملفّات',
  accusative: 'ملفًّا',
  singular: 'ملفّ',
}

/** ما يُقال عن صورٍ رُفعت قبل الفشل — بقيت في المستودع. */
export function leftoverNote(uploaded: number): string {
  return uploaded > 0 ? ` رُفع ${countText(uploaded, FILES)} إلى المستودع قبل ذلك وبقي هناك.` : ''
}

export function failureText(
  failure: GitHubFailure,
  step: FailureStep,
  retryAfter?: number,
): string {
  switch (failure) {
    case 'local-only':
      return '«الوضع المحلّي فقط» مفعَّل، فلا يتّصل رصد بأي خدمة. أوقفه من إعدادات الخصوصية ثمّ أعد المحاولة.'
    case 'host-permission':
      return 'صلاحية الوصول إلى api.github.com غير ممنوحة. اتّصل بـGitHub من التكاملات في الإعدادات، أو امنحها من شاشة الصلاحيات.'
    case 'settings-unreadable':
      return 'تعذّرت قراءة إعداداتك، ولا يرسل رصد شيئًا قبل أن يتأكّد من «الوضع المحلّي فقط». أعد المحاولة.'
    case 'unnamed-origin':
      return 'وجهةٌ غير مسمّاة في رصد — لم يُرسل شيء.'
    case 'not-connected':
      return 'لم تتّصل بـGitHub بعد. اتّصل من التكاملات في الإعدادات.'
    case 'vault':
      return 'تعذّرت قراءة رمز الوصول المحفوظ على هذا الجهاز. أعد الاتّصال من التكاملات.'
    case 'malformed':
      return step === 'connect'
        ? 'هذا لا يشبه رمز وصول من GitHub. انسخه كاملًا من صفحة الرموز في حسابك.'
        : 'اكتب المستودع بصيغة «المالك/الاسم»، مثل northwind/web.'
    case 'auth':
      return 'رفض GitHub رمز الوصول: انتهت صلاحيته أو سُحب أو كُتب خطأ. أعد الاتّصال لتكمل.'
    case 'missing-permission':
      return step === 'upload'
        ? 'رمز الوصول لا يملك صلاحية Contents على هذا المستودع، فلا يستطيع رفع الصورة أصلًا فيه. امنحه Contents (كتابة) أو اختر تضمين الصورة في نصّ البلاغ.'
        : 'رمز الوصول لا يسمح بفتح Issue في هذا المستودع. امنحه صلاحية Issues ثمّ أعد المحاولة.'
    case 'not-found':
      return 'المستودع غير موجود، أو خاصٌّ لا يصله رمز الوصول. تحقّق من الاسم ومن أن الرمز مخصَّص له.'
    case 'issues-disabled':
      return 'الـIssues معطَّلة في هذا المستودع. فعّلها من إعداداته أو اختر مستودعًا آخر.'
    case 'rate-limited':
      return retryAfter
        ? `بلغ GitHub حدّ الطلبات. أعد المحاولة بعد ${formatHuman(retryAfter)} ثانية.`
        : 'بلغ GitHub حدّ الطلبات. أعد المحاولة بعد قليل.'
    case 'conflict':
      return 'تعارض مؤقّت مع التزامٍ آخر على المستودع. أعد المحاولة.'
    case 'invalid':
      return 'رفض GitHub محتوى البلاغ. عدّل العنوان أو النصّ وأعد المحاولة.'
    case 'server':
      return 'لم يستجب GitHub الآن. نصّ البلاغ محفوظ هنا ولم يُرسل منه شيء، أعد المحاولة بعد قليل.'
    case 'network':
      return 'لم يصل ردٌّ من GitHub. تحقّق من اتّصالك بالإنترنت ثمّ أعد المحاولة؛ نصّ البلاغ محفوظ هنا.'
    case 'unexpected':
      return 'ردٌّ لم يفهمه رصد من GitHub، ولم يُفتح البلاغ. أعد المحاولة بعد قليل.'
  }
}

/** عنوان اللافتة فوق الرسالة — يقول أين وقع الفشل. */
export function failureTitle(step: FailureStep): string {
  switch (step) {
    case 'connect':
      return 'تعذّر الاتّصال بـGitHub'
    case 'upload':
      return 'تعذّر رفع الصورة'
    case 'issue':
      return 'تعذّر فتح البلاغ'
  }
}

export function problemText(problem: IssueProblem): string {
  switch (problem) {
    case 'title-empty':
      return 'اكتب عنوانًا للبلاغ.'
    case 'title-too-long':
      return 'العنوان أطول من 256 حرفًا، وهو أقصى ما يقبله GitHub.'
    case 'body-too-long':
      return 'نصّ البلاغ أطول مما يقبله GitHub (65536 حرفًا). الصور المضمَّنة في النصّ أكبر ما فيه — اختر رفعها أصلًا في المستودع أو أطفئ ما لا تحتاجه.'
  }
}

/** رسالة خطأ الإرسال كاملةً: سببها، ثمّ ما بقي في المستودع إن رُفع شيء. */
export function sendFailureText(
  error: Exclude<SendError, { step: 'check' | 'cancelled' }>,
): string {
  return `${failureText(error.error.failure, error.step, error.error.retryAfterSeconds)}${
    error.step === 'issue' ? leftoverNote(error.uploaded) : ''
  }`
}
