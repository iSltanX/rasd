/**
 * نافذة «أبلغ عن مشكلة» (`support / *`، الصفحة `25 — Settings`) — [ADR 0050](../../../../../Docs/ADR/0050-problem-reports.md).
 *
 * ثلاث خطوات ثمّ الإرسال: صف ما حدث ← الصورة (اختيارية) ← ما سيُرسَل بالضبط ← «أرسل البلاغ». **لا طلب شبكة قبل
 * ذلك الزرّ**، ولا صلاحية تُطلب قبله، ولا لقطة يجريها رصد أصلًا — الصورة ملفٌّ يختاره المستخدم أو يلصقه.
 *
 * - **المراجعة تعرض الجسم المبنيّ نفسه** (`reviewRows`) لا النموذج: كل قيمةٍ تُرسَل صفٌّ، والتشخيص كما يخرج حرفًا.
 * - **الفشل والإلغاء يحفظان المسودة** بصورتها المخبوزة، ويُعرض السبب وما يُفعل؛ والنجاح يحذفها ويعرض رقم البلاغ.
 * - **إعادة المحاولة تُرسل الجسم نفسه بالمفتاح نفسه** — لا إعادة كتابة، ولا بلاغان لردٍّ ضاع.
 * - **«الوضع المحلّي فقط»** يُشرح ويُعرض بديله: انسخ البلاغ نصًّا، أو افتح الخصوصية.
 *
 * **فروقٌ مقصودة عن الإطارات مكتوبة في `Docs/Design.md`:** رقم البلاغ `#12` (رقم القناة نفسه، يطابق ما عند جهة
 * الدعم) لا `RSD-1042`؛ والمراجعة تعرض النصّ كاملًا والقيم التقنية حرفًا (`full-page` لا «صفحة كاملة») لأن المعروض
 * يجب أن يطابق المرسَل؛ والصورة من ملفٍّ أو لصقٍ لا التقاط.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'

import {
  REPORTS_HOST_PATTERN,
  retryable,
  sendReport,
  type SendError,
} from '@/modules/report/client'
import { collectDiagnostics } from '@/modules/report/diagnostics'
import { clearDrafts, deleteDraft, latestDraft, saveDraft } from '@/modules/report/drafts'
import { failureMessage } from '@/modules/report/messages'
import {
  buildPayload,
  copyText,
  formErrors,
  payloadProblems,
  reviewRows,
  serialise,
  TITLE_MAX,
  type Diagnostics,
  type ReportForm,
  type ReportPayload,
} from '@/modules/report/payload'
import {
  hasHostPermission,
  requestHostPermission,
  type PermissionOutcome,
} from '@/shared/permissions'
import { getSettingsResult } from '@/shared/settings'
import { Banner } from '@/ui/components/Banner/Banner'
import { Button } from '@/ui/components/Button/Button'
import { Field } from '@/ui/components/Field/Field'
import { Spinner } from '@/ui/components/Spinner/Spinner'
import { cx } from '@/ui/cx'
import { Icon } from '@/ui/icons/Icon'
import { TechnicalValue } from '@/ui/TechnicalValue'

import dataStyles from '../data/data.module.css'
import { DataDialog, Row, sheet } from '../data/DataDialog'

import { bakeWorking, importImage, type BakedImage, type WorkingImage } from './image-source'
import { ImageStep } from './ImageStep'
import styles from './report.module.css'

import type { DeviceRect } from '@/shared/geometry'
import type { ReportDraftRecord } from '@/shared/storage/schema'
import type { JSX } from 'preact'

/** ما تحتاجه النافذة من خارجها — يُحقن في الاختبار فلا شبكة ولا قماش ولا قاعدة. */
export interface ReportDeps {
  readonly diagnostics: () => Promise<Diagnostics>
  readonly send: typeof sendReport
  readonly saveDraft: typeof saveDraft
  readonly latestDraft: typeof latestDraft
  readonly deleteDraft: typeof deleteDraft
  /** بعد نجاح الإرسال: مسودةٌ واحدة في كل مرّة، فلا يبقى بعده شيء. */
  readonly clearDrafts: typeof clearDrafts
  /** بصمة الجسم المرسَل — تقرّر هل المحاولة التالية «إعادة» بالمفتاح نفسه أم بلاغٌ معدَّل بمفتاحٍ جديد. */
  readonly digest: (text: string) => Promise<string>
  readonly importImage: typeof importImage
  readonly bakeWorking: typeof bakeWorking
  /** «الوضع المحلّي فقط» الآن، أو `null` حين تتعذّر القراءة (والمخرج يرفض حينها بسببه). */
  readonly localOnly: () => Promise<boolean | null>
  readonly hostGranted: () => Promise<boolean>
  /** يُنادى **متزامنًا** داخل نقرة «أرسل» — الطلب يرمي خارج سلسلة الإيماءة. */
  readonly requestHost: () => Promise<PermissionOutcome>
  readonly copy: (text: string) => Promise<boolean>
  readonly newId: () => string
  readonly now: () => number
  /** بناءٌ تجريبي يرسل `test: true` (`VITE_RASD_REPORT_TEST=1`). */
  readonly test: boolean
}

const LIVE: ReportDeps = {
  diagnostics: () => collectDiagnostics(),
  send: sendReport,
  saveDraft,
  latestDraft,
  deleteDraft,
  clearDrafts,
  digest: async (text) => {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
    return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
  },
  importImage,
  bakeWorking,
  localOnly: async () => {
    const settings = await getSettingsResult()
    return settings.ok ? settings.value.privacy.localOnly : null
  },
  hostGranted: () => hasHostPermission(REPORTS_HOST_PATTERN),
  requestHost: () => requestHostPermission([REPORTS_HOST_PATTERN]),
  copy: async (text) => {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      return false
    }
  },
  newId: () => crypto.randomUUID(),
  now: () => Date.now(),
  test: import.meta.env.VITE_RASD_REPORT_TEST === '1',
}

export interface ReportRequest {
  readonly tool: string | null
  readonly code: string | null
}

export interface ReportDialogProps {
  /** من رسالة خطأ: الأداة والرمز. `null` من مدخل الإعدادات. */
  readonly request: ReportRequest | null
  readonly onClose: () => void
  readonly onOpenPrivacy: () => void
  readonly deps?: Partial<ReportDeps>
}

type Phase =
  | 'loading'
  | 'describe'
  | 'image'
  | 'preparing'
  | 'review'
  | 'sending'
  | 'sent'
  | 'failed'
  | 'local-only'
  | 'cancelled'

const SUBTITLE: Readonly<Record<Phase, string>> = {
  loading: 'يُجهَّز النموذج',
  describe: 'الخطوة ١ من ٣ · صف ما حدث',
  image: 'الخطوة ٢ من ٣ · الصورة اختيارية',
  preparing: 'الخطوة ٢ من ٣ · تُجهَّز الصورة',
  review: 'الخطوة ٣ من ٣ · ما سيُرسَل بالضبط',
  sending: 'يُرسَل البلاغ',
  sent: 'وصل البلاغ',
  failed: 'لم يُرسَل البلاغ',
  'local-only': 'الإرسال معطَّل',
  cancelled: 'أُلغي الإرسال',
}

/** أسماء الحقول بالعربية — والقيمة بجانبها كما تُرسَل حرفًا. */
const LABEL: Readonly<Record<string, string>> = {
  kind: 'النوع',
  description: 'النصّ',
  'attachments.0': 'الصورة',
  product: 'المنتَج',
  test: 'بلاغ تجريبي',
  app_version: 'إصدار رصد',
  os: 'النظام',
  os_version: 'إصدار النظام',
  arch: 'المعمارية',
  locale: 'اللغة',
  'diagnostics.browser': 'المتصفّح',
  'diagnostics.browser_version': 'إصدار المتصفّح',
  'diagnostics.browser_id': 'معرّف المتصفّح',
  'diagnostics.engine': 'محرّك المتصفّح',
  'diagnostics.build_target': 'هدف بناء رصد',
  'diagnostics.install_source': 'مصدر تثبيت رصد',
  'diagnostics.tool': 'الأداة المتأثّرة',
  'diagnostics.error_code': 'رمز الخطأ',
}

const DIAGNOSTIC_KEYS = new Set(['app_version', 'os', 'os_version', 'arch', 'locale'])

const EMPTY_FORM = (request: ReportRequest | null): ReportForm => ({
  kind: 'bug',
  title: '',
  what: '',
  steps: '',
  expected: '',
  tool: request?.tool ?? null,
  errorCode: request?.code ?? null,
})

const NOTICE: Readonly<Record<string, string>> = {
  'not-image': 'هذا الملفّ ليس صورةً يقرؤها المتصفّح. اختر PNG أو JPEG.',
  empty: 'الملفّ فارغ.',
  'too-large': 'الصورة أكبر من أن تُرسَل حتى بعد تصغيرها. اقتصص جزءًا منها.',
  failed: 'تعذّر تجهيز الصورة. أعد المحاولة أو احذفها.',
}

export function ReportDialog(props: ReportDialogProps): JSX.Element {
  const deps = useMemo(() => ({ ...LIVE, ...props.deps }), [props.deps])
  const [phase, setPhase] = useState<Phase>('loading')
  /** مفتاح عدم التكرار ومعرّف المسودة — مرجعٌ لا حالة: يُقرأ داخل وعودٍ قد تتجاوز إعادة الرسم. */
  const key = useRef('')
  /** بصمة جسم آخر محاولة خرجت بهذا المفتاح، أو `null` حين لم يخرج شيء. */
  const attempted = useRef<string | null>(null)
  /** محاولةٌ جارية — نقرةٌ ثانية أثناء نافذة الإذن أو الإرسال لا تُطلق أخرى. */
  const inFlight = useRef(false)
  const [createdAt, setCreatedAt] = useState(0)
  const [form, setForm] = useState<ReportForm>(() => EMPTY_FORM(props.request))
  const [showErrors, setShowErrors] = useState(false)
  const [diag, setDiag] = useState<Diagnostics | null>(null)
  const [image, setImage] = useState<WorkingImage | null>(null)
  const [crop, setCrop] = useState<DeviceRect | null>(null)
  const [redactions, setRedactions] = useState<readonly DeviceRect[]>([])
  const [baked, setBaked] = useState<BakedImage | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<SendError | null>(null)
  const [draftSaved, setDraftSaved] = useState<boolean | null>(null)
  const [sentId, setSentId] = useState<number | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [localOnly, setLocalOnly] = useState<boolean | null>(null)
  const [granted, setGranted] = useState(false)
  const abort = useRef<AbortController | null>(null)
  const [thumb, setThumb] = useState<string | null>(null)

  // البداية: التشخيص، ثمّ أحدث مسودة إن فُتحت النافذة من الإعدادات (لا من خطأ بعينه).
  useEffect(() => {
    let live = true
    void (async () => {
      const [diagnostics, draft] = await Promise.all([
        deps.diagnostics(),
        props.request
          ? Promise.resolve(null)
          : deps.latestDraft().then((r) => (r.ok ? r.value : null)),
      ])
      if (!live) return
      setDiag(diagnostics)
      if (draft) {
        key.current = draft.id
        attempted.current = draft.attempted ?? null
        setCreatedAt(draft.createdAt)
        setForm({
          kind: draft.kind,
          title: draft.title,
          what: draft.what,
          steps: draft.steps,
          expected: draft.expected,
          tool: draft.tool,
          errorCode: draft.errorCode,
        })
        if (draft.image) {
          const restored = await deps.importImage(draft.image.blob).catch(() => null)
          if (live && restored?.ok) setImage(restored.image)
        }
      } else {
        key.current = deps.newId()
        setCreatedAt(deps.now())
      }
      if (live) setPhase('describe')
    })()
    return () => {
      live = false
    }
  }, [])

  // كل تعديلٍ على الصورة يُبطل المخبوز: ما يُعرض في المراجعة يُخبز من الحالة الأخيرة.
  useEffect(() => setBaked(null), [image, crop, redactions])

  // مصغّرة المخبوز في المراجعة — البكسلات التي ستخرج فعلًا بعد القصّ والحجب والتصغير (عقد القناة).
  useEffect(() => {
    if (!baked || typeof URL.createObjectURL !== 'function') {
      setThumb(null)
      return
    }
    const url = URL.createObjectURL(baked.blob)
    setThumb(url)
    return () => URL.revokeObjectURL(url)
  }, [baked])

  const payload: ReportPayload | null = useMemo(
    () =>
      diag
        ? buildPayload(form, diag, baked ? { type: 'image/png', bytes: baked.bytes } : null, {
            test: deps.test,
          })
        : null,
    [form, diag, baked, deps.test],
  )

  const hasContent =
    form.title.trim() !== '' ||
    form.what.trim() !== '' ||
    form.steps.trim() !== '' ||
    form.expected.trim() !== '' ||
    image !== null

  /** يخبز الصورة إن لم تُخبز بعد تعديلها الأخير. `false` حين تعذّر. */
  const ensureBaked = async (): Promise<BakedImage | null | false> => {
    if (!image) return null
    if (baked) return baked
    // فكٌّ أو خبزٌ يرمي (ذاكرة، صورةٌ تالفة) فشلٌ مسمّى لا نافذةٌ معلّقة في «تُجهَّز الصورة».
    const out = await deps
      .bakeWorking(image, crop, redactions)
      .catch(() => ({ ok: false as const, failure: 'failed' as const }))
    if (!out.ok) {
      setNotice(NOTICE[out.failure] ?? null)
      return false
    }
    setBaked(out.image)
    return out.image
  }

  const persist = async (bakedNow: BakedImage | null): Promise<boolean> => {
    const record: ReportDraftRecord = {
      id: key.current,
      attempted: attempted.current,
      createdAt,
      updatedAt: deps.now(),
      ...form,
      image: bakedNow
        ? {
            blob: bakedNow.blob,
            width: bakedNow.width,
            height: bakedNow.height,
            redactions: redactions.length,
          }
        : null,
    }
    const saved = await deps.saveDraft(record)
    setDraftSaved(saved.ok)
    return saved.ok
  }

  /** إغلاقٌ أو «ألغِ» في الخطوات: ما كُتب لا يضيع — يُحفظ مسودةً وتُعرض حالة الإلغاء. */
  const cancelSteps = async () => {
    if (!hasContent) {
      props.onClose()
      return
    }
    const out = await ensureBaked()
    await persist(out || null)
    setPhase('cancelled')
  }

  const doSend = async (body: ReportPayload) => {
    setPhase('sending')
    setError(null)
    /*
     * المفتاح نفسه للجسم نفسه وحده. بلاغٌ عُدِّل بعد محاولةٍ خرجت (ألغاها المستخدم وقد تكون وصلت، ثمّ «أكمل البلاغ»)
     * بلاغٌ آخر بمفتاحٍ جديد — وإلا أجاب الخادم بالرقم القديم وضاع التعديل صامتًا.
     */
    const fingerprint = await deps.digest(serialise(body))
    if (attempted.current !== null && attempted.current !== fingerprint) key.current = deps.newId()
    attempted.current = fingerprint
    const controller = new AbortController()
    abort.current = controller
    const outcome = await deps.send(body, { key: key.current, signal: controller.signal })
    abort.current = null
    inFlight.current = false
    if (outcome.ok) {
      await deps.clearDrafts()
      setSentId(outcome.id)
      setPhase('sent')
      return
    }
    await persist(baked)
    // إذنٌ سُحب بعد المراجعة: «أعد المحاولة» يطلبه من جديد لا يدور على الرفض نفسه.
    if (outcome.error.failure === 'host-permission') setGranted(false)
    if (outcome.error.failure === 'local-only') {
      setLocalOnly(true)
      setPhase('local-only')
      return
    }
    if (outcome.error.failure === 'cancelled') {
      setPhase('cancelled')
      return
    }
    setError(outcome.error)
    setPhase('failed')
  }

  /**
   * «أرسل البلاغ» و«أعد المحاولة» — **أوّل طلب شبكة في النافذة كلّها**. والإذن يُطلب هنا متزامنًا داخل النقرة إن لم
   * يُمنح، ثمّ يقرّر المخرج من جديد: الوضع المحلّي من القرص، والإذن، والأصل المسمّى.
   */
  const confirm = () => {
    if (!payload || inFlight.current) return
    if (localOnly === true) {
      setPhase('local-only')
      return
    }
    // إعداداتٌ لم تُقرأ جهلٌ لا سماح: لا يُطلب إذنٌ قد لا يُحتاج — والمخرج كان سيرفض بالسبب نفسه.
    if (localOnly === null) {
      void persist(baked).then(() => {
        setError({ failure: 'settings-unreadable' })
        setPhase('failed')
      })
      return
    }
    inFlight.current = true
    if (!granted) {
      void deps.requestHost().then((outcome) => {
        if (outcome === 'granted') {
          setGranted(true)
          void doSend(payload)
          return
        }
        inFlight.current = false
        void persist(baked).then(() => {
          setError({ failure: 'host-permission' })
          setPhase('failed')
        })
      })
      return
    }
    void doSend(payload)
  }

  const toReview = async () => {
    setNotice(null)
    setPhase('preparing')
    const out = await ensureBaked()
    if (out === false) {
      setPhase('image')
      return
    }
    const [mode, host] = await Promise.all([
      deps.localOnly().catch(() => null),
      deps.hostGranted().catch(() => false),
    ])
    setLocalOnly(mode)
    setGranted(host)
    setPhase('review')
  }

  const copyReport = async () => {
    if (!payload) return
    setCopied((await deps.copy(copyText(payload))) ? 'report' : 'failed')
  }

  const onClose = () => {
    if (phase === 'describe' || phase === 'image' || phase === 'review') void cancelSteps()
    else if (phase !== 'sending' && phase !== 'preparing') props.onClose()
  }

  const errors = showErrors ? formErrors(form) : []
  const field = (key: 'title' | 'what' | 'steps' | 'expected') => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }))

  const copiedNote =
    copied === 'report' ? (
      <p class={cx(styles.copied, 't-arabic-ui-xs')} role="status">
        نُسخ البلاغ نصًّا — بلا بيانات الصورة، فأرفقها بنفسك إن أرسلته بطريقتك.
      </p>
    ) : copied === 'number' ? (
      <p class={cx(styles.copied, 't-arabic-ui-xs')} role="status">
        نُسخ رقم البلاغ.
      </p>
    ) : copied === 'failed' ? (
      <p class={cx(styles.copied, 't-arabic-ui-xs')} role="status">
        تعذّر النسخ إلى الحافظة.
      </p>
    ) : null

  let body: JSX.Element
  let actions: JSX.Element | null

  switch (phase) {
    case 'loading':
    case 'preparing':
      body = (
        <div class={dataStyles.status}>
          <Spinner size="l" label={SUBTITLE[phase]} />
        </div>
      )
      actions = null
      break

    case 'describe':
      body = (
        <>
          <Banner tone="info">يصل بلاغك وصورته إلى جهة الدعم وحدها. لا يُنشر شيء للعامة.</Banner>
          <Field
            id="report-field-title"
            label="عنوان المشكلة"
            value={form.title}
            maxLength={TITLE_MAX}
            onInput={field('title')}
            state={errors.includes('title') ? 'error' : 'default'}
            hint={errors.includes('title') ? 'اكتب عنوانًا قصيرًا للمشكلة' : undefined}
          />
          <Field
            id="report-field-what"
            label="ماذا حدث؟"
            multiline
            value={form.what}
            onInput={field('what')}
            state={errors.includes('what') ? 'error' : 'default'}
            hint={errors.includes('what') ? 'صف ما حدث بجملة أو جملتين' : undefined}
          />
          <Field
            id="report-field-steps"
            label="خطوات حدوثها"
            multiline
            value={form.steps}
            onInput={field('steps')}
          />
          <Field
            id="report-field-expected"
            label="ماذا توقّعت؟"
            value={form.expected}
            onInput={field('expected')}
            hint="اختياري"
          />
          {errors.includes('length') ? (
            <Banner tone="warning">النصّ أطول من ألفي حرف. اختصر الوصف أو الخطوات.</Banner>
          ) : null}
        </>
      )
      actions = (
        <>
          <Button
            size="l"
            data-rasd-autofocus=""
            onClick={() => {
              setShowErrors(true)
              if (formErrors(form).length === 0) setPhase('image')
            }}
          >
            التالي: الصورة
          </Button>
          <Button
            variant="secondary"
            size="l"
            data-rasd-cancel=""
            onClick={() => void cancelSteps()}
          >
            ألغِ
          </Button>
        </>
      )
      break

    case 'image':
      body = (
        <ImageStep
          image={image}
          crop={crop}
          redactions={redactions}
          notice={notice}
          onPick={(file) => {
            setNotice(null)
            void deps
              .importImage(file)
              .catch(() => ({ ok: false as const, failure: 'not-image' as const }))
              .then((out) => {
                if (!out.ok) {
                  setNotice(NOTICE[out.failure] ?? null)
                  return
                }
                image?.bitmap.close()
                setImage(out.image)
                setCrop(null)
                setRedactions([])
              })
          }}
          onCrop={setCrop}
          onRedactions={setRedactions}
          onRemove={() => {
            image?.bitmap.close()
            setImage(null)
            setCrop(null)
            setRedactions([])
          }}
        />
      )
      actions = (
        <>
          <Button size="l" onClick={() => void toReview()}>
            التالي: المراجعة
          </Button>
          <Button
            variant="secondary"
            size="l"
            data-rasd-cancel=""
            onClick={() => setPhase('describe')}
          >
            السابق
          </Button>
        </>
      )
      break

    case 'review': {
      const rows = payload ? reviewRows(payload) : []
      const problems = payload ? payloadProblems(payload, baked?.bytes.length ?? 0) : []
      const value = (key: string, text: string) =>
        key === 'description' ? (
          <span class={styles.description} dir="auto">
            {text}
          </span>
        ) : (
          <TechnicalValue variant="mono-xs">{text}</TechnicalValue>
        )
      const section = (title: string, keys: (key: string) => boolean) => (
        <div class={sheet.group}>
          <p class={cx(sheet.groupLabel, 't-arabic-label-s')}>{title}</p>
          <div class={sheet.summary} data-report-section={title}>
            {rows
              .filter((r) => keys(r.key))
              .map((r) => (
                <div
                  key={r.key}
                  class={cx(sheet.kv, r.key === 'description' && styles.stacked)}
                  data-report-key={r.key}
                >
                  <span class={sheet.rowLabel}>{LABEL[r.key] ?? r.key}</span>
                  <span class={cx(sheet.rowValue, styles.reviewValue)}>
                    {value(r.key, r.value)}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )
      body = (
        <>
          {thumb ? (
            <figure class={styles.thumbFigure}>
              <img
                src={thumb}
                class={styles.thumb}
                alt="الصورة كما ستُرسَل بعد القصّ والحجب"
                data-report-thumb=""
              />
              <figcaption class={cx(styles.toolHint, 't-arabic-ui-xs')}>
                الصورة كما ستُرسَل — ما حجبته أسود في بياناتها نفسها.
              </figcaption>
            </figure>
          ) : null}
          {section('البلاغ', (k) => !DIAGNOSTIC_KEYS.has(k) && !k.startsWith('diagnostics.'))}
          {section('التشخيص', (k) => DIAGNOSTIC_KEYS.has(k) || k.startsWith('diagnostics.'))}
          <div class={sheet.group}>
            <p class={cx(sheet.groupLabel, 't-arabic-label-s')}>لا يُرسَل</p>
            <div class={sheet.summary}>
              <Row label="رابط الصفحة وعنوانها ومحتواها">لا</Row>
              <Row label="مكتبتك وإعداداتك ومشاريعك">لا</Row>
            </div>
          </div>
          {problems.length > 0 ? (
            <Banner tone="danger">
              البلاغ يتجاوز ما تقبله جهة الدعم. اختصر النصّ أو صغّر الصورة.
            </Banner>
          ) : null}
          <Banner tone="info">
            يصل بلاغك وصورته إلى جهة الدعم وحدها، ولا يُنشر للعامة. والإرسال الآن فقط حين تضغط «أرسل
            البلاغ».
          </Banner>
        </>
      )
      actions = (
        <>
          <Button
            size="l"
            data-rasd-autofocus=""
            data-rasd-confirm=""
            state={problems.length > 0 ? 'disabled' : 'default'}
            onClick={confirm}
          >
            أرسل البلاغ
          </Button>
          <Button
            variant="secondary"
            size="l"
            data-rasd-cancel=""
            onClick={() => setPhase('image')}
          >
            السابق
          </Button>
        </>
      )
      break
    }

    case 'sending':
      body = (
        <div class={dataStyles.status}>
          <Spinner size="l" label="يُرسَل البلاغ" />
          <p class={cx(dataStyles.statusText, 't-arabic-ui-s')}>
            {baked ? 'يُرسَل البلاغ وصورته' : 'يُرسَل البلاغ'}
          </p>
        </div>
      )
      actions = (
        <Button
          variant="secondary"
          size="l"
          data-rasd-cancel=""
          onClick={() => abort.current?.abort()}
        >
          ألغِ
        </Button>
      )
      break

    case 'sent':
      body = (
        <div class={dataStyles.status}>
          <span class={dataStyles.badge} data-tone="success">
            <Icon name="check" size="md" />
          </span>
          <h3 class={cx(dataStyles.statusTitle, 't-arabic-heading-s')}>وصل بلاغك</h3>
          <p class={cx(dataStyles.statusText, 't-arabic-ui-s')}>
            احتفظ برقم البلاغ لتذكره عند المتابعة.
          </p>
          <TechnicalValue
            variant="mono-m"
            class={styles.reportId}
          >{`#${sentId ?? ''}`}</TechnicalValue>
          {copiedNote}
        </div>
      )
      actions = (
        <>
          <Button size="l" data-rasd-autofocus="" onClick={props.onClose}>
            تمّ
          </Button>
          <Button
            variant="secondary"
            size="l"
            icon="copy"
            onClick={() =>
              void deps.copy(`#${sentId ?? ''}`).then((ok) => setCopied(ok ? 'number' : 'failed'))
            }
          >
            انسخ الرقم
          </Button>
        </>
      )
      break

    case 'failed': {
      const err = error ?? { failure: 'unexpected' as const }
      const again = retryable(err.failure)
      const backToImage = err.failure === 'too-large' || err.failure === 'unsupported'
      body = (
        <>
          <Banner tone="danger">{failureMessage(err)}</Banner>
          <div class={sheet.group}>
            <p class={cx(sheet.groupLabel, 't-arabic-label-s')}>المسودة</p>
            <div class={sheet.summary}>
              <Row label="الحالة">
                {draftSaved === false ? 'تعذّر حفظها على هذا الجهاز' : 'محفوظة على هذا الجهاز'}
              </Row>
              <Row label="النصّ والصورة">كما كتبتها وحجبتها</Row>
              <Row label="تُحذف">بعد نجاح الإرسال</Row>
            </div>
          </div>
          {copiedNote}
        </>
      )
      actions = (
        <>
          {again ? (
            <Button
              size="l"
              icon="refresh"
              data-rasd-autofocus=""
              onClick={err.failure === 'settings-unreadable' ? () => void toReview() : confirm}
            >
              أعد المحاولة
            </Button>
          ) : backToImage ? (
            <Button size="l" data-rasd-autofocus="" onClick={() => setPhase('image')}>
              عد إلى الصورة
            </Button>
          ) : null}
          <Button variant="secondary" size="l" icon="copy" onClick={() => void copyReport()}>
            انسخ البلاغ نصًّا
          </Button>
        </>
      )
      break
    }

    case 'local-only':
      body = (
        <>
          <Banner tone="info">
            الوضع المحلّي فقط مفعَّل، فلا يرسل رصد شيئًا خارج هذا الجهاز. انسخ البلاغ نصًّا وأرسله
            بطريقتك، أو أوقف الوضع من الخصوصية.
          </Banner>
          <div class={sheet.summary}>
            <Row label="الوضع المحلّي فقط">مفعَّل</Row>
          </div>
          {copiedNote}
        </>
      )
      actions = (
        <>
          <Button size="l" icon="copy" data-rasd-autofocus="" onClick={() => void copyReport()}>
            انسخ البلاغ نصًّا
          </Button>
          <Button variant="secondary" size="l" onClick={props.onOpenPrivacy}>
            افتح الخصوصية
          </Button>
        </>
      )
      break

    case 'cancelled':
      body = (
        <div class={dataStyles.status}>
          <span class={dataStyles.badge} data-tone="warning">
            <Icon name="close" size="md" />
          </span>
          <h3 class={cx(dataStyles.statusTitle, 't-arabic-heading-s')}>لم يُرسَل البلاغ</h3>
          <p class={cx(dataStyles.statusText, 't-arabic-ui-s')}>
            {draftSaved === false
              ? 'تعذّر حفظ مسودتك على هذا الجهاز — أكمل البلاغ الآن كي لا يضيع.'
              : 'مسودتك محفوظة على هذا الجهاز. أكملها متى شئت.'}
          </p>
        </div>
      )
      actions = (
        <>
          <Button size="l" data-rasd-autofocus="" onClick={() => setPhase('describe')}>
            أكمل البلاغ
          </Button>
          <Button
            variant="ghost"
            size="l"
            onClick={() => void deps.deleteDraft(key.current).then(() => props.onClose())}
          >
            احذف المسودة
          </Button>
        </>
      )
      break
  }

  return (
    <DataDialog
      id="report"
      phase={phase}
      title="أبلغ عن مشكلة"
      subtitle={SUBTITLE[phase]}
      onClose={onClose}
      busy={phase === 'sending' || phase === 'preparing' || phase === 'loading'}
      onEscape={() => abort.current?.abort()}
      actions={actions}
    >
      {body}
    </DataDialog>
  )
}
