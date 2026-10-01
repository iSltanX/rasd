/**
 * **إرسال البلاغ** — رفع الصور أصلًا إن اختيرت، ثمّ فتح الـIssue بنصّه النهائي.
 *
 * **لا يُستدعى إلا بعد تأكيد المستخدم الصريح** (زرّ «افتح البلاغ» في المعاينة): هذا الملفّ أوّل موضعٍ في المنتج
 * يكتب إلى مستودعٍ خارجي، فكل ما قبله — البناء والمعاينة — بلا شبكة (`IssueComposer.tsx` يحرسه اختبار).
 *
 * والخطوتان مسمّاتان في الخطأ (`upload` · `issue`) لأن الرسالة تختلف: رفضٌ في الرفع يعني صلاحية Contents، ورفضٌ في
 * الفتح يعني Issues — وصورةٌ رُفعت ولم يُفتح البلاغ بعدها تُقال بعددها: ملفٌّ بقي في المستودع.
 *
 * `modules/` منطق خالص: لا DOM ولا `chrome.*` — الشبكة من `github.ts` ومخرجها الواحد.
 */

import { err, ok, type Result } from '@/shared/result'

import { createIssue, uploadAsset, type GitHubError, type GitHubIssue } from './github'
import {
  checkIssue,
  composeBody,
  imageTargets,
  type ImageMode,
  type IssuePlan,
  type IssueProblem,
} from './issue'

export type SendStep = 'upload' | 'issue'

export type SendError =
  /** مرفوضٌ قبل أن يُطلب شيء — لم يخرج شيء. */
  | { readonly step: 'check'; readonly problem: IssueProblem }
  /** ألغى المستخدم بين خطوتين — لا يُطلب بعدها شيء. `uploaded` ما رُفع قبل الإلغاء وبقي في المستودع. */
  | { readonly step: 'cancelled'; readonly uploaded: number }
  | {
      readonly step: SendStep
      readonly error: GitHubError
      /** كم ملفًّا رُفع قبل الفشل — يبقى في المستودع. */
      readonly uploaded: number
    }

export interface SendRequest {
  readonly owner: string
  readonly repo: string
  readonly title: string
  readonly intro: string
  readonly plan: IssuePlan
  readonly imageMode: ImageMode
  /**
   * إلغاء المستخدم: يُفحص **بين** الخطوات لا في أثنائها — طلبٌ خرج لا يُسحب، فإن ألغى والطلب الأخير في الطريق
   * فقد يُفتح البلاغ (والواجهة تقول ذلك).
   */
  readonly signal?: AbortSignal
}

export interface SentIssue extends GitHubIssue {
  readonly uploaded: number
}

/** رسالة الالتزام التي ترفع الصورة: تقول ما هي ومن أين، لمن يقرأ تاريخ المستودع. */
const commitMessage = (name: string): string => `رصد: صورة بلاغ (${name.replace(/^images\//u, '')})`

export async function sendIssue(request: SendRequest): Promise<Result<SentIssue, SendError>> {
  const { owner, repo, plan } = request

  // النصّ الأخير يُفحص بحدّ GitHub **قبل** أي رفع: صورةٌ تتجاوز حدّ النصّ لا تُرفع ثمّ يُرفض البلاغ بعدها.
  const draft = (
    targets: Parameters<typeof composeBody>[2],
  ): { body: string; problem: IssueProblem | null } => {
    const body = composeBody(request.intro, plan, targets)
    return { body, problem: checkIssue(request.title, body) }
  }

  // الأصل: العنوان النهائي يحتاج رمز الالتزام، فالفحص قبل الرفع بعناوين بطولها الحقيقي (`PENDING_COMMIT`).
  const probe = draft(imageTargets(request.imageMode, plan, owner, repo))
  if (probe.problem) return err({ step: 'check', problem: probe.problem })
  if (request.imageMode === 'inline') return finish(request, probe.body, 0)

  const commits = new Map<string, string>()
  for (const image of plan.images) {
    if (request.signal?.aborted) return err({ step: 'cancelled', uploaded: commits.size })
    const uploaded = await uploadAsset(
      owner,
      repo,
      image.path,
      image.bytes,
      commitMessage(image.name),
    )
    if (!uploaded.ok) return err({ step: 'upload', error: uploaded.error, uploaded: commits.size })
    commits.set(image.path, uploaded.value.commitSha)
  }
  const { body } = draft(imageTargets('asset', plan, owner, repo, commits))
  return finish(request, body, commits.size)
}

async function finish(
  request: SendRequest,
  body: string,
  uploaded: number,
): Promise<Result<SentIssue, SendError>> {
  if (request.signal?.aborted) return err({ step: 'cancelled', uploaded })
  const created = await createIssue(request.owner, request.repo, {
    title: request.title.trim(),
    body,
  })
  if (!created.ok) return err({ step: 'issue', error: created.error, uploaded })
  return ok({ ...created.value, uploaded })
}
