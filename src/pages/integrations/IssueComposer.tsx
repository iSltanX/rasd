/**
 * مؤلِّف البلاغ — `github / issue-compose` ثمّ `issue-preview` و`issue-sending` و`issue-sent` و`issue-error` و
 * `issue-cancelled` (`Docs/Design.md`): نافذةٌ واحدة بأطوارها. التأليف، ثمّ المعاينة، ثمّ **التأكيد الصريح**.
 *
 * **لا شبكة قبل التأكيد.** التأليف والمعاينة يُبنيان محلّيًّا كلّيًّا (`planIssue` بعارض Markdown المشترك)، وقراءة
 * حالة الاتّصال محلّية (`connection.ts`)؛ وأول طلبٍ يخرج هو الذي يلي النقر على «افتح البلاغ» — وبعدها وحدها. ولذلك
 * لا يُسأل GitHub عن المستودع ولا عن خصوصيته قبل التأكيد: خطؤه (غير موجود، لا صلاحية) يُقال عند الإرسال بسببه،
 * والمعاينة تقول بصدق «يراه كل من يصل إلى المستودع».
 *
 * **والمعاينة هي ما سيُرسل:** النصّ المعروض هو `composeBody` نفسه الذي يُفحص بحدّ GitHub (65536 محرفًا) ويُرسَل؛
 * وحدّه يُفحص هنا فيُعطَّل «افتح البلاغ» بسببٍ مقروء لا يُترك GitHub يرفضه بعد أن رُفعت الصور.
 * وإن اختير رفع الصورة أصلًا فالمعاينة تقول ما سيُكتب في المستودع: التزامٌ على فرعه الافتراضي لا يُسحب بحذف البلاغ.
 *
 * **والإلغاء يُفحص بين الخطوات** (`sendIssue`): طلبٌ خرج لا يُسحب، فإن ألغى المستخدم والطلب الأخير في الطريق وصل
 * البلاغ، والنافذة تعرضه نجاحًا ولا تدّعي أنه أُلغي.
 */

import { useEffect, useMemo, useRef, useState } from 'preact/hooks'

import { parseRepoRef } from '@/modules/export/integrations/github'
import {
  checkIssue,
  composeBody,
  defaultIntro,
  defaultTitle,
  DEFAULT_ISSUE_OPTIONS,
  imageTargets,
  planIssue,
  type ImageMode,
  type IssueOptions,
  type IssueProblem,
} from '@/modules/export/integrations/issue'
import { sendIssue, type SentIssue } from '@/modules/export/integrations/send'
import { countText, formatStorage } from '@/shared/bidi/numerals'
import { Banner, Button, Field, Select, SettingRow, Toggle } from '@/ui/components'
import { Spinner } from '@/ui/components/Spinner/Spinner'
import { cx } from '@/ui/cx'
import { Icon } from '@/ui/icons/Icon'
import { TechnicalValue } from '@/ui/TechnicalValue'
import { useFocusTrap } from '@/ui/use-focus-trap'

import sheet from '../export/export.module.css'

import { readConnection, type Connection } from './connection'
import styles from './integrations.module.css'
import { savePrefs } from './preferences'
import { failureText, leftoverNote, problemText, sendFailureText } from './text'

import type { EvidenceFrame } from '@/modules/handoff/model'
import type { IssueRecord } from '@/shared/issue-schema'
import type { JSX } from 'preact'

export interface IssueComposerProps {
  readonly issues: readonly IssueRecord[]
  /** من أين جاءت المشكلات — «تحديد في المكتبة» · «لقطة في المحرّر». */
  readonly source: string
  /** الصور المخبوزة بمعرّف اللقطة من مخرج الترميز الواحد، بعد الحجب. */
  readonly baked: ReadonlyMap<string, Uint8Array>
  readonly frames?: ReadonlyMap<string, EvidenceFrame>
  readonly onClose: () => void
  /** زمن البناء — يُحقن للاختبار. */
  readonly now?: number
}

type Phase =
  | { readonly kind: 'checking' }
  | { readonly kind: 'blocked'; readonly connection: Connection }
  | { readonly kind: 'compose' }
  | { readonly kind: 'preview' }
  | { readonly kind: 'sending'; readonly cancelling: boolean }
  | { readonly kind: 'sent'; readonly sent: SentIssue; readonly repo: string }
  | { readonly kind: 'failed'; readonly text: string; readonly needsReconnect: boolean }
  | { readonly kind: 'cancelled'; readonly uploaded: number }

const IMAGE_OPTIONS = [
  { value: 'asset', label: 'أصل في المستودع' },
  { value: 'inline', label: 'مضمَّنة في النصّ' },
] as const

const SUBTITLE: Record<Phase['kind'], string> = {
  checking: 'جارٍ التحقّق من الاتّصال',
  blocked: 'لا يمكن فتح بلاغ الآن',
  compose: '',
  preview: '',
  sending: 'تُفتح الآن',
  sent: 'فُتح البلاغ',
  failed: 'لم يُفتح البلاغ',
  cancelled: 'أُلغي الإرسال',
}

/** نسخة رصد من البيان — وفي بيئةٍ بلا بيان (الاختبار) علامةٌ لا رقمٌ مخترَع. */
function rasdVersion(): string {
  try {
    return chrome.runtime.getManifest().version
  } catch {
    return 'dev'
  }
}

/** لماذا لا يُفتح البلاغ: رسالةٌ بسببها — الأسباب نفسها التي تقولها شاشة الاتّصالات. */
function blockedText(connection: Connection): string {
  switch (connection.kind) {
    case 'local-only':
      return failureText('local-only', 'issue')
    case 'disconnected':
      return failureText('not-connected', 'issue')
    case 'auth-error':
      return failureText('auth', 'issue')
    case 'missing-permission':
      return failureText('missing-permission', 'issue')
    case 'host-revoked':
      return failureText('host-permission', 'issue')
    default:
      return failureText('vault', 'issue')
  }
}

export function IssueComposer(props: IssueComposerProps): JSX.Element {
  const dialog = useRef<HTMLDivElement>(null)
  useFocusTrap(dialog)
  const [phase, setPhase] = useState<Phase>({ kind: 'checking' })
  const [repoText, setRepoText] = useState('')
  const [title, setTitle] = useState(() => defaultTitle(props.issues))
  const [intro, setIntro] = useState(() => defaultIntro(props.issues, props.source))
  const [options, setOptions] = useState<IssueOptions>(DEFAULT_ISSUE_OPTIONS)
  const [touched, setTouched] = useState(false)
  const [copied, setCopied] = useState(false)
  const [baseAt] = useState(() => props.now ?? Date.now())
  /** كل محاولة إرسال بمجلّد أصولٍ جديد — إعادة المحاولة بالمسار نفسه كانت ستصطدم بملفٍّ رُفع. */
  const attempt = useRef(0)
  const controller = useRef<AbortController | null>(null)
  const live = useRef(true)

  useEffect(
    () => () => {
      live.current = false
      controller.current?.abort()
    },
    [],
  )

  // حالة الاتّصال والتفضيلات — محلّيّتان. بلا شبكة.
  useEffect(() => {
    void readConnection().then((connection) => {
      if (!live.current) return
      if (connection.kind !== 'connected') {
        setPhase({ kind: 'blocked', connection })
        return
      }
      setRepoText(connection.prefs.repo ?? '')
      setOptions((prev) => ({ ...prev, imageMode: connection.prefs.imageMode }))
      setPhase({ kind: 'compose' })
    })
  }, [])

  const repo = parseRepoRef(repoText)
  const planned = useMemo(
    () =>
      planIssue(
        {
          issues: props.issues,
          source: props.source,
          generatedAt: baseAt + (attempt.current + 1) * 1000,
          version: rasdVersion(),
          baked: props.baked,
          ...(props.frames ? { frames: props.frames } : {}),
        },
        options,
      ),
    [props.issues, props.source, props.baked, props.frames, baseAt, options, phase.kind],
  )

  /** النصّ كما سيُرسل: مقاسه لحدّ GitHub، وما يُعرض في المعاينة. */
  const body = useMemo(() => {
    if (!planned.ok) return null
    const owner = repo?.owner ?? 'owner'
    const name = repo?.repo ?? 'repo'
    const actual = composeBody(
      intro,
      planned.value,
      imageTargets(options.imageMode, planned.value, owner, name),
    )
    const shown = composeBody(intro, planned.value, (image) =>
      options.imageMode === 'asset'
        ? (planned.value.images.find((i) => i.name === image)?.path ?? image)
        : 'data:image/png;base64,…',
    )
    return { actual, shown }
  }, [planned, intro, options.imageMode, repo?.owner, repo?.repo])

  const thumbnails = useMemo(() => {
    if (!planned.ok || typeof URL.createObjectURL !== 'function') return []
    return planned.value.images.map((image) => ({
      name: image.name,
      url: URL.createObjectURL(new Blob([image.bytes as BlobPart], { type: 'image/png' })),
    }))
  }, [planned])
  useEffect(
    () => () => {
      for (const t of thumbnails) URL.revokeObjectURL(t.url)
    },
    [thumbnails],
  )

  const problem: IssueProblem | null = body ? checkIssue(title, body.actual) : null
  const titleProblem = problem === 'title-empty' || problem === 'title-too-long' ? problem : null
  const repoInvalid = repo === null
  const canPreview = !repoInvalid && titleProblem === null && planned.ok

  const close = (): void => {
    controller.current?.abort()
    props.onClose()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      if (phase.kind === 'sending') cancel()
      else close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const goPreview = (): void => {
    setTouched(true)
    if (canPreview) setPhase({ kind: 'preview' })
  }

  /** **التأكيد:** أول طلبٍ يخرج في هذه النافذة كلّها هو الذي يلي هذه النقرة. */
  const confirm = (): void => {
    if (!repo || !planned.ok || problem !== null) return
    attempt.current += 1
    const runPlan = planIssue(
      {
        issues: props.issues,
        source: props.source,
        generatedAt: baseAt + attempt.current * 1000,
        version: rasdVersion(),
        baked: props.baked,
        ...(props.frames ? { frames: props.frames } : {}),
      },
      options,
    )
    if (!runPlan.ok) return
    const abort = new AbortController()
    controller.current = abort
    setPhase({ kind: 'sending', cancelling: false })
    void sendIssue({
      owner: repo.owner,
      repo: repo.repo,
      title,
      intro,
      plan: runPlan.value,
      imageMode: options.imageMode,
      signal: abort.signal,
    }).then(async (result) => {
      if (!live.current) return
      const name = `${repo.owner}/${repo.repo}`
      if (result.ok) {
        await savePrefs({ repo: name, imageMode: options.imageMode, status: 'ok' })
        setPhase({ kind: 'sent', sent: result.value, repo: name })
        return
      }
      const error = result.error
      if (error.step === 'cancelled') {
        setPhase({ kind: 'cancelled', uploaded: error.uploaded })
      } else if (error.step === 'check') {
        setPhase({ kind: 'failed', text: problemText(error.problem), needsReconnect: false })
      } else {
        // آخر ما رآه رصد من GitHub يُحفظ فتعرضه شاشة الاتّصالات: رمزٌ مرفوض أو بلا صلاحية.
        const failure = error.error.failure
        if (failure === 'auth') await savePrefs({ status: 'auth-error' })
        if (failure === 'missing-permission') await savePrefs({ status: 'missing-permission' })
        setPhase({
          kind: 'failed',
          text: sendFailureText(error),
          needsReconnect:
            failure === 'auth' ||
            failure === 'missing-permission' ||
            failure === 'not-connected' ||
            failure === 'vault' ||
            failure === 'host-permission' ||
            failure === 'local-only',
        })
      }
    })
  }

  function cancel(): void {
    controller.current?.abort()
    setPhase((prev) => (prev.kind === 'sending' ? { kind: 'sending', cancelling: true } : prev))
  }

  const openIntegrations = (): void => {
    void chrome.tabs.create({
      url: `${chrome.runtime.getURL('src/pages/settings/index.html')}?section=integrations`,
    })
  }

  const copyLink = (url: string): void => {
    const clipboard = navigator.clipboard as Clipboard | undefined
    if (!clipboard?.writeText) return
    void clipboard.writeText(url).then(() => setCopied(true))
  }

  const subtitle =
    phase.kind === 'compose'
      ? `من ${props.source}`
      : phase.kind === 'preview'
        ? `هذا ما سيُفتح في ${repo ? `${repo.owner}/${repo.repo}` : ''}`
        : SUBTITLE[phase.kind]

  const setOption = <K extends keyof IssueOptions>(key: K, value: IssueOptions[K]): void =>
    setOptions((prev) => ({ ...prev, [key]: value }))

  const imageCount = planned.ok ? planned.value.images.length : 0

  return (
    <div
      class={sheet.scrim}
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-labelledby="composer-title"
      data-composer=""
      data-phase={phase.kind}
    >
      <div class={cx(sheet.modal, styles.modal)}>
        <header class={sheet.head}>
          <button
            type="button"
            class={sheet.close}
            aria-label="إغلاق"
            data-composer-close=""
            onClick={() => (phase.kind === 'sending' ? cancel() : close())}
          >
            <Icon name="close" size="sm" />
          </button>
          <div class={sheet.headText}>
            <h2 id="composer-title" class={cx(sheet.title, 't-arabic-heading-s')}>
              بلاغ جديد في <bdi dir="ltr">GitHub</bdi>
            </h2>
            <p class={cx(sheet.subtitle, 't-arabic-ui-xs')}>{subtitle}</p>
          </div>
        </header>

        {phase.kind === 'checking' ? (
          <div class={cx(sheet.body, styles.center)}>
            <Spinner />
          </div>
        ) : null}

        {phase.kind === 'blocked' ? (
          <>
            <div class={sheet.body} data-composer-blocked={phase.connection.kind}>
              <Banner tone={phase.connection.kind === 'local-only' ? 'info' : 'warning'}>
                {blockedText(phase.connection)}
              </Banner>
            </div>
            <footer class={cx(sheet.actions, styles.actions)}>
              <Button variant="primary" size="l" icon="plug" onClick={openIntegrations}>
                افتح التكاملات
              </Button>
              <Button variant="secondary" size="l" onClick={close}>
                أغلق
              </Button>
            </footer>
          </>
        ) : null}

        {phase.kind === 'compose' ? (
          <>
            <div class={sheet.body} data-composer-compose="">
              <section class={sheet.group} aria-labelledby="composer-target">
                <h3 id="composer-target" class={cx(sheet.groupLabel, 't-arabic-label-xs')}>
                  الوجهة
                </h3>
                <div class={sheet.card}>
                  <div class={styles.field}>
                    <Field
                      id="composer-repo"
                      label="المستودع"
                      value={repoText}
                      placeholder="owner/repo"
                      class={styles.ltr}
                      state={touched && repoInvalid ? 'error' : 'default'}
                      hint={touched && repoInvalid ? failureText('malformed', 'issue') : undefined}
                      onInput={setRepoText}
                    />
                  </div>
                  <SettingRow
                    id="composer-image"
                    label="صورة البلاغ"
                    hint={
                      options.imageMode === 'asset'
                        ? 'تُرفع أصلًا في المستودع، فتحتاج صلاحية Contents'
                        : 'تُضمَّن في نصّ البلاغ، وقد لا تتّسع لها حدوده'
                    }
                    control={
                      <Select
                        value={options.imageMode}
                        options={IMAGE_OPTIONS}
                        aria-label="صورة البلاغ"
                        aria-describedby="composer-image-hint"
                        data-composer-image=""
                        onChange={(v) => setOption('imageMode', v as ImageMode)}
                      />
                    }
                  />
                </div>
              </section>

              <Field
                id="composer-title-field"
                label="العنوان"
                value={title}
                state={touched && titleProblem ? 'error' : 'default'}
                hint={touched && titleProblem ? problemText(titleProblem) : undefined}
                onInput={setTitle}
              />
              <Field id="composer-intro" label="النصّ" value={intro} multiline onInput={setIntro} />

              <section class={sheet.group} aria-labelledby="composer-include">
                <h3 id="composer-include" class={cx(sheet.groupLabel, 't-arabic-label-xs')}>
                  يُضمَّن
                </h3>
                <div class={sheet.card}>
                  <SettingRow
                    id="composer-notes"
                    label="الملاحظات المرقَّمة"
                    hint="نصّ كل مشكلة وخطوات إعادتها"
                    divider
                    control={
                      <Toggle
                        on={options.notes}
                        label="الملاحظات المرقَّمة"
                        onChange={(on) => setOption('notes', on)}
                      />
                    }
                  />
                  <SettingRow
                    id="composer-page"
                    label="رابط الصفحة"
                    hint="يظهر في البلاغ لكل من يرى المستودع. المعاملات تُحذف دائمًا"
                    control={
                      <Toggle
                        on={options.pageLink}
                        label="رابط الصفحة"
                        onChange={(on) => setOption('pageLink', on)}
                      />
                    }
                  />
                </div>
              </section>
            </div>
            <footer class={cx(sheet.actions, styles.actions)}>
              <Button variant="primary" size="l" onClick={goPreview} data-composer-preview="">
                عاين قبل الإرسال
              </Button>
              <Button variant="secondary" size="l" onClick={close}>
                ألغِ
              </Button>
            </footer>
          </>
        ) : null}

        {phase.kind === 'preview' ? (
          <>
            <div class={sheet.body} data-composer-review="">
              <h3 class={cx(styles.phaseTitle, 't-arabic-ui-s-strong')} data-composer-title="">
                {title.trim()}
              </h3>
              <pre
                class={cx(styles.preview, 't-mono-xs')}
                tabIndex={0}
                aria-label="نصّ البلاغ كما سيُرسل"
                data-composer-body=""
              >
                {body?.shown ?? ''}
              </pre>
              {thumbnails.length > 0 ? (
                <div class={styles.thumbs} data-composer-images="">
                  {thumbnails.map((t) => (
                    <img key={t.name} class={styles.thumb} src={t.url} alt="" />
                  ))}
                </div>
              ) : null}
              <div class={sheet.summary}>
                <div class={sheet.kv}>
                  <span class={cx(sheet.rowLabel, 't-arabic-ui-xs')}>المستودع</span>
                  <TechnicalValue kind="path" variant="mono-xs">
                    {repo ? `${repo.owner}/${repo.repo}` : ''}
                  </TechnicalValue>
                </div>
                <div class={sheet.kv}>
                  <span class={cx(sheet.rowLabel, 't-arabic-ui-xs')}>الصور</span>
                  <span class={cx(sheet.rowValue, 't-arabic-ui-xs-strong')}>
                    {imageCount === 0
                      ? 'بلا صور'
                      : options.imageMode === 'asset'
                        ? `${countText(imageCount, IMAGES)} تُرفع إلى المستودع`
                        : `${countText(imageCount, IMAGES)} داخل النصّ`}
                  </span>
                </div>
                <div class={sheet.kv}>
                  <span class={cx(sheet.rowLabel, 't-arabic-ui-xs')}>حجم النصّ</span>
                  <TechnicalValue kind="dimension" variant="mono-xs">
                    {body ? `${formatStorage(body.actual.length)} / 64 KB` : '—'}
                  </TechnicalValue>
                </div>
              </div>
              {problem ? (
                <Banner tone="danger">
                  <span data-composer-problem={problem}>{problemText(problem)}</span>
                </Banner>
              ) : null}
              {options.imageMode === 'asset' && imageCount > 0 ? (
                <Banner tone="info">
                  قبل فتح البلاغ تُرفع الصور إلى المستودع في التزامٍ على فرعه الافتراضي، ولا تُحذف
                  منه بحذف البلاغ.
                </Banner>
              ) : null}
              <Banner tone="warning">
                البلاغ يراه كل من يصل إلى المستودع. لا يُرسل شيء قبل أن تضغط «افتح البلاغ».
              </Banner>
            </div>
            <footer class={cx(sheet.actions, styles.actions)}>
              <Button
                variant="primary"
                size="l"
                icon="external"
                onClick={confirm}
                data-composer-confirm=""
                {...(problem ? { state: 'disabled' as const } : {})}
              >
                افتح البلاغ
              </Button>
              <Button variant="secondary" size="l" onClick={() => setPhase({ kind: 'compose' })}>
                عُد للتعديل
              </Button>
            </footer>
          </>
        ) : null}

        {phase.kind === 'sending' ? (
          <>
            <div class={cx(sheet.body, styles.center)} data-composer-sending="">
              <Spinner size="l" />
              <p class={cx(styles.phaseText, 't-arabic-ui-s')}>
                {options.imageMode === 'asset' && imageCount > 0
                  ? 'نرفع الصورة ونفتح البلاغ'
                  : 'نفتح البلاغ'}
              </p>
            </div>
            <footer class={cx(sheet.actions, styles.actions)}>
              <Button
                variant="secondary"
                size="l"
                onClick={cancel}
                state={phase.cancelling ? 'loading' : 'default'}
                data-composer-cancel=""
              >
                ألغِ
              </Button>
            </footer>
          </>
        ) : null}

        {phase.kind === 'sent' ? (
          <>
            <div class={cx(sheet.body, styles.center)} data-composer-sent="">
              <span class={cx(styles.badge, styles.badgeSuccess)}>
                <Icon name="check" size="lg" />
              </span>
              <p class={cx(styles.phaseTitle, 't-arabic-heading-xs')}>فُتح البلاغ</p>
              <p class={cx(styles.phaseText, 't-arabic-ui-s')}>البلاغ في مستودعك الآن.</p>
              <TechnicalValue kind="path" variant="mono-s" class={styles.issueRef}>
                {`${phase.repo}#${phase.sent.number}`}
              </TechnicalValue>
            </div>
            <footer class={cx(sheet.actions, styles.actions)}>
              <Button
                variant="primary"
                size="l"
                icon="external"
                onClick={() => void chrome.tabs.create({ url: phase.sent.url })}
                data-composer-open=""
              >
                افتح في GitHub
              </Button>
              <Button
                variant="secondary"
                size="l"
                icon="copy"
                onClick={() => copyLink(phase.sent.url)}
              >
                {copied ? 'نُسخ الرابط' : 'انسخ الرابط'}
              </Button>
              <Button variant="secondary" size="l" onClick={close}>
                أغلق
              </Button>
            </footer>
          </>
        ) : null}

        {phase.kind === 'failed' ? (
          <>
            <div class={sheet.body} data-composer-failed="">
              <Banner tone="danger">
                <strong class="t-arabic-ui-s-strong">تعذّر فتح البلاغ</strong>
                <span data-composer-error="">{phase.text}</span>
              </Banner>
            </div>
            <footer class={cx(sheet.actions, styles.actions)}>
              {phase.needsReconnect ? (
                <Button variant="primary" size="l" icon="plug" onClick={openIntegrations}>
                  افتح التكاملات
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="l"
                  onClick={() => setPhase({ kind: 'preview' })}
                  data-composer-retry=""
                >
                  أعد المحاولة
                </Button>
              )}
              <Button variant="secondary" size="l" onClick={close}>
                أغلق
              </Button>
            </footer>
          </>
        ) : null}

        {phase.kind === 'cancelled' ? (
          <>
            <div class={cx(sheet.body, styles.center)} data-composer-cancelled="">
              <span class={cx(styles.badge, styles.badgeWarning)}>
                <Icon name="close" size="lg" />
              </span>
              <p class={cx(styles.phaseTitle, 't-arabic-heading-xs')}>لم يُفتح بلاغ</p>
              <p class={cx(styles.phaseText, 't-arabic-ui-s')}>
                لم يُفتح بلاغ في GitHub. اللقطة في المكتبة كما هي.{leftoverNote(phase.uploaded)}
              </p>
            </div>
            <footer class={cx(sheet.actions, styles.actions)}>
              <Button variant="primary" size="l" onClick={() => setPhase({ kind: 'preview' })}>
                عُد إلى البلاغ
              </Button>
              <Button variant="secondary" size="l" onClick={close}>
                أغلق
              </Button>
            </footer>
          </>
        ) : null}
      </div>
    </div>
  )
}

const IMAGES = {
  one: 'صورة واحدة',
  two: 'صورتان',
  many: 'صور',
  accusative: 'صورة',
  singular: 'صورة',
}
