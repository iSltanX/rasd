/**
 * معالجات المشكلات في الخلفية — التسجيل وقراءة مشكلات الصفحة وحفظ نتائج الفحص (ADR 0030 و0031).
 *
 * **الخلفية وحدها تكتب ما يأتي من الصفحة.** المخزن في قاعدة الإضافة لا قاعدة الموقع، وسكربت المحتوى
 * يعمل فوق صفحةٍ قد تكون معادية: فالمسودّة ونتائج الفحص تُتحقَّق بمخطّطها، والرابط والعنوان من التبويب
 * لا من الحمولة، والحالة تُشتقّ من النتيجة لا تُقبل، ولا تُكتب مشكلةٌ لغير صفحة المُرسِل.
 */

import { SCENE_SCHEMA_VERSION } from '@/modules/editor/scene'
import { buildIssue, noteScene, pageKeyOf, pageOf, type NoteStyle } from '@/modules/issues/build'
import { parseDraft, parseIssue, parseRecheck } from '@/modules/issues/schema'
import { applyCheck } from '@/modules/issues/status'
import { onMessage, sendToTab, type MessageContext } from '@/shared/messaging'
import { RasdThrow } from '@/shared/result'
import { getSettings } from '@/shared/settings'
import { issues, projects, putIssueWithEvidence, updateIssues } from '@/shared/storage/repository'

import { shootCapture } from './capture-service'
import { activateTool } from './commands'

import type { IssueRecord, ProjectOption, RecheckResult } from '@/shared/issue-schema'
import type { AnnotationRecord } from '@/shared/storage/schema'

/** مصدر المعرّفات — يُستبدَل في الاختبار. */
let newId: () => string = () => crypto.randomUUID()

export function setIssueIds(next: () => string): void {
  newId = next
}

/** التبويب المُرسِل ومفتاح صفحته — من المتصفّح لا من الحمولة. */
async function senderPage(
  context: MessageContext,
): Promise<{ tabId: number; tab: chrome.tabs.Tab; origin: string; path: string }> {
  if (context.tabId === undefined) throw new Error('لا تبويب مُرسِل للمشكلة.')
  const tab = await chrome.tabs.get(context.tabId)
  const key = tab.url ? pageKeyOf(tab.url) : null
  if (!key) throw new Error('تعذّرت قراءة عنوان التبويب — لا صفحة موثوقة للمشكلة.')
  return { tabId: context.tabId, tab, ...key }
}

/** مشكلات صفحة بعينها، الأقدم أوّلًا — ترتيبها هو رقمها المشترك بين الصفحة والقائمة. */
export async function issuesForPage(origin: string, path: string): Promise<IssueRecord[]> {
  const found = await issues.byIndex('origin', origin)
  if (!found.ok) throw new RasdThrow(found.error)
  const out: IssueRecord[] = []
  for (const raw of found.value) {
    // سجلٌّ لا يُقرأ لا يُسقط اللوحة كلّها — يُترك في مكانه ولا يُعرض.
    const parsed = parseIssue(raw)
    if (parsed.ok && parsed.value.page.path === path) out.push(parsed.value)
  }
  return out.sort((a, b) => a.createdAt - b.createdAt)
}

async function projectOptions(): Promise<ProjectOption[]> {
  const all = await projects.getAll()
  if (!all.ok) return []
  return all.value
    .map((p) => ({ id: p.id, name: p.name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ar'))
}

async function noteStyle(): Promise<NoteStyle> {
  const { annotation } = await getSettings()
  return {
    colorToken: annotation.color,
    strokeWidthCss: annotation.strokeWidth,
    fontSizeCss: annotation.fontSize,
    pinShape: annotation.pinShape,
    pinStart: annotation.pinStart,
  }
}

/** مصدر الرسالة صفحةٌ من الإضافة نفسها — النافذة، لا سكربت محتوى. */
const fromExtensionPage = (context: MessageContext): boolean =>
  context.origin?.startsWith('chrome-extension://') ?? false

export function registerIssues(): void {
  onMessage('issue/page', async (_payload, context) => {
    const page = await senderPage(context)
    const [list, options] = await Promise.all([
      issuesForPage(page.origin, page.path),
      projectOptions(),
    ])
    return { issues: list, projects: options }
  })

  onMessage('issue/create', async (payload, context) => {
    const draft = parseDraft(payload)
    if (!draft.ok) throw new RasdThrow(draft.error)
    const sender = await senderPage(context)
    const page = pageOf({ url: sender.tab.url ?? '', title: sender.tab.title ?? '' }, draft.value)
    if (!page) throw new Error('تعذّرت قراءة عنوان التبويب — لا صفحة موثوقة للمشكلة.')

    // مشروعٌ لم يعد موجودًا (حُذف والنموذج مفتوح) لا يُكتب معرّفًا يتيمًا.
    const projectId =
      draft.value.projectId && (await projects.get(draft.value.projectId)).ok
        ? draft.value.projectId
        : null

    const shot = await shootCapture({
      tabId: sender.tabId,
      kind: 'element',
      rect: draft.value.shot.rect,
      dpr: draft.value.shot.dpr,
    })
    if (!shot.ok) throw new RasdThrow(shot.error)

    const now = Date.now()
    const captureId = shot.value.record.id
    const noteId = draft.value.withNote ? newId() : null
    const issue = buildIssue(
      { ...draft.value, projectId },
      page,
      { issueId: newId(), captureId, noteId },
      now,
    )

    let annotation: AnnotationRecord | null = null
    if (noteId) {
      const scene = noteScene(
        draft.value,
        { width: shot.value.width, height: shot.value.height },
        { captureId, noteId, pinId: newId() },
        await noteStyle(),
      )
      annotation = {
        captureId,
        scene,
        updatedAt: now,
        schemaVersion: SCENE_SCHEMA_VERSION,
        redaction: { total: 0, irreversible: 0 },
      }
    }

    const saved = await putIssueWithEvidence(
      { ...shot.value.record, projectId },
      shot.value.blob,
      annotation,
      issue,
    )
    if (!saved.ok) throw new RasdThrow(saved.error)
    return { id: issue.id, captureId }
  })

  onMessage('issue/recheck-save', async ({ results }, context) => {
    const parsed = parseRecheck(results)
    if (!parsed.ok) throw new RasdThrow(parsed.error)
    const page = await senderPage(context)

    const byId = new Map<string, RecheckResult>(parsed.value.map((r) => [r.id, r]))
    const at = Date.now()
    const written = await updateIssues([...byId.keys()], (issue) => {
      const result = byId.get(issue.id)
      // مشكلةٌ لصفحةٍ أخرى لا تكتبها صفحةٌ لا تملكها — ولو عرفت معرّفها.
      if (!result || issue.page.origin !== page.origin || issue.page.path !== page.path) {
        return null
      }
      return applyCheck(issue, result, at)
    })
    if (!written.ok) throw new RasdThrow(written.error)
    return { issues: written.value }
  })

  onMessage('issue/recheck-tab', async ({ tabId }, context) => {
    if (!fromExtensionPage(context)) {
      throw new RasdThrow({
        code: 'permission-denied',
        message: 'إعادة الفحص تبدأ من نافذة الإضافة أو من لوحة الصفحة بنقرة — لا من سكربت.',
      })
    }
    const activated = await activateTool(tabId, 'issues')
    if (!activated.started) return { started: false, reason: activated.reason }
    // الجولة تُعرض في الطبقة نفسها، والنافذة تُغلق — فلا يُنتظر ردّها هنا.
    void sendToTab({ tabId }, 'issue/run-recheck', undefined, { timeoutMs: 5000 })
    return { started: true }
  })
}
