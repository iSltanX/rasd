/**
 * نافذة المشاركة المحلّية — `share / modal` (`73:361`) وأطوارها: `clipboard` (`291:447`) و`file` (`291:829`)
 * و`guide` (`291:1262`) و`loading` (`291:1658`) و`done` (`129:843`) و`error` (`291:2012`) و`permission-denied`
 * (`291:2381`) و`cancelled` (`319:55644`).
 *
 * **نافذةٌ واحدة بأطوارها لا نوافذ متراكبة**، وهيكل الورقة من `export.module.css` كنوافذ التصدير والتسليم.
 * وهذا الملفّ عرضٌ خالص: لا خبز ولا تنزيل ولا حافظة — المحرّك في `CaptureShare` و`GuideShare`، ولكلٍّ موضوعه
 * (لقطة أو دليل) وما يُعرض تحت البطاقات.
 *
 * **ثلاثة مسارات تعمل ورابعٌ معطَّل بسببه:** صفحة ويب وحافظة وملفّ — والرابط السحابي بطاقةٌ مرئية معطَّلة
 * سببها «قريبًا» ونصٌّ تحت النافذة يقول لماذا (يحتاج خادمًا). لا مخفيّ ولا زرّ صامت (`AGENTS.md` §4).
 *
 * **وسمات `data-share-*` عقد `verify:share`** — على الضوابط الأصلية نفسها لأنها ما يُنقر ويُقرأ.
 */

import { useEffect, useRef } from 'preact/hooks'

import { Banner, Button, Toggle } from '@/ui/components'
import { OptionCard } from '@/ui/components/OptionCard/OptionCard'
import { SettingRow } from '@/ui/components/SettingRow/SettingRow'
import { Spinner } from '@/ui/components/Spinner/Spinner'
import { cx } from '@/ui/cx'
import { Icon, type IconName } from '@/ui/icons/Icon'
import { TechnicalValue } from '@/ui/TechnicalValue'

import styles from '../export/export.module.css'
import local from '../export/guide-export.module.css'

import type { ShareStrip } from './capture-page'
import type { ComponentChildren, JSX } from 'preact'

/** المسارات العاملة بترتيب الإطار من اليمين. */
export const SHARE_PATHS = ['page', 'clipboard', 'file'] as const
export type SharePath = (typeof SHARE_PATHS)[number]

export interface PathCard {
  readonly title: string
  readonly hint: string
  readonly icon: IconName
}

/** سبب تعطيل الرابط السحابي — سطرٌ مرئيّ تحت النافذة، وعنوانٌ على البطاقة. */
export const CLOUD_REASON = 'الرابط السحابي يحتاج خادمًا، وليس في هذا الإصدار.'

/** وعد المشاركة المحلّية — لافتة مسار الصفحة كما في الإطار. */
export const LOCAL_PROMISE = 'المشاركة محلّية. رصد ينشئ الملفّ على جهازك ولا يرفع شيئًا إلى خادم.'

/** لافتة الرفض — صادقةٌ عمّا وقع: الملفّ حُفظ بالطريق الذي لا يحتاج صلاحية. */
export const DENIED_TEXT =
  'رصد لا يملك صلاحية التنزيل، فذهب الملفّ إلى مجلّد التنزيلات الافتراضي باسمه المقترَح بلا اختيار مكان. امنحها ليُسأل عن المكان في المرّة التالية.'

const RUN: Readonly<Record<SharePath, { readonly label: string; readonly icon: IconName }>> = {
  page: { label: 'أنشئ الصفحة', icon: 'file-code' },
  clipboard: { label: 'انسخ', icon: 'copy' },
  file: { label: 'احفظ الملفّ', icon: 'download' },
}

const FAILED: Readonly<Record<SharePath, string>> = {
  page: 'تعذّر إنشاء الصفحة',
  clipboard: 'تعذّر النسخ',
  file: 'تعذّر حفظ الملفّ',
}

export interface ShareRow {
  readonly label: string
  readonly value: string
  /** قيمةٌ تقنية (حجم، مسار) بخطّ القياس. */
  readonly mono?: boolean
}

export type SharePhase =
  | { readonly kind: 'choose' }
  | { readonly kind: 'running'; readonly text: string }
  | {
      readonly kind: 'done'
      readonly path: 'page' | 'file'
      readonly title: string
      readonly body: string
      /** المسار كما يعرضه المتصفّح، أو الاسم المقترَح وحده على المرساة. */
      readonly shown: string
      readonly downloadId: number | null
      /** ما فُقد بالتدهور (`DEGRADE_NOTE`)، أو `null`. */
      readonly note: string | null
      readonly rows: readonly ShareRow[]
      /** عنوان كائن الملفّ — مقبض فحصٍ يجلبه `verify:share`. */
      readonly blobUrl: string
    }
  | { readonly kind: 'copied'; readonly title: string; readonly hint: string }
  | { readonly kind: 'error'; readonly path: SharePath; readonly message: string }
  | { readonly kind: 'cancelled' }

export interface ShareDialogProps {
  readonly heading: string
  readonly subtitle: string
  readonly phase: SharePhase
  readonly path: SharePath
  readonly cards: Readonly<Record<SharePath, PathCard>>
  readonly onPath: (path: SharePath) => void
  /** ما تحت البطاقات للمسار المختار — الحذف، أو خيارات الملفّ، أو ملخّص الدليل. */
  readonly options?: ComponentChildren
  /** سبب منع التنفيذ (لقطةٌ أكبر من حدود القماش مثلًا)، أو `null`. */
  readonly blocked?: string | null
  /** «اللقطة في المكتبة كما هي.» أو «الدليل لم يتغيّر.» — ذيل الخطأ والإلغاء. */
  readonly keeps: string
  /** **يُستدعى متزامنًا من النقرة** — طلب الصلاحية والحافظة كلاهما يشترط نبضة الإيماءة. */
  readonly onRun: (event: MouseEvent) => void
  readonly onCancelRun: () => void
  readonly onReveal: (downloadId: number) => void
  /** منح صلاحية التنزيل بعد رفضها — من نقرةٍ أيضًا. */
  readonly onGrant: (event: MouseEvent) => void
  /** النسخ إلى الحافظة بديلًا من شاشة الرفض. */
  readonly onCopyInstead: (event: MouseEvent) => void
  readonly onRestart: () => void
  readonly onClose: () => void
}

export function ShareDialog(props: ShareDialogProps): JSX.Element {
  const closeRef = useRef<HTMLButtonElement>(null)
  const { phase } = props

  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      props.onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [props.onClose])

  const subtitle = phase.kind === 'cancelled' ? 'أُلغيت المشاركة' : props.subtitle
  const showCards = phase.kind === 'choose' || phase.kind === 'copied'

  return (
    <div
      class={styles.scrim}
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-title"
      data-share=""
      data-phase={phase.kind}
    >
      <div class={styles.modal}>
        <header class={styles.head}>
          <button
            type="button"
            ref={closeRef}
            class={styles.close}
            aria-label="إغلاق"
            data-share-close=""
            onClick={props.onClose}
          >
            <Icon name="close" size="sm" />
          </button>
          <div class={styles.headText}>
            <h2 id="share-title" class={cx(styles.title, 't-arabic-heading-s')}>
              {props.heading}
            </h2>
            <p class={cx(styles.subtitle, 't-arabic-ui-xs')}>{subtitle}</p>
          </div>
        </header>

        <div
          class={cx(
            styles.body,
            (phase.kind === 'running' || phase.kind === 'cancelled') && local.center,
          )}
        >
          {phase.kind === 'choose' && props.path === 'page' ? (
            <Banner tone="info">{LOCAL_PROMISE}</Banner>
          ) : null}

          {showCards ? (
            <section class={styles.group} aria-labelledby="share-path-label">
              <h3 id="share-path-label" class={cx(styles.groupLabel, 't-arabic-label-xs')}>
                طريقة المشاركة
              </h3>
              <div class={local.formats} role="radiogroup" aria-labelledby="share-path-label">
                {SHARE_PATHS.map((path) => (
                  <OptionCard
                    key={path}
                    name="share-path"
                    value={path}
                    icon={props.cards[path].icon}
                    title={props.cards[path].title}
                    hint={props.cards[path].hint}
                    selected={props.path === path}
                    onSelect={() => props.onPath(path)}
                    data-share-path={path}
                  />
                ))}
                <OptionCard
                  name="share-path"
                  value="cloud"
                  icon="link"
                  title="رابط سحابي"
                  hint="قريبًا"
                  disabled
                  reason={CLOUD_REASON}
                  data-share-cloud=""
                />
              </div>
            </section>
          ) : null}

          {phase.kind === 'choose' ? (
            <>
              {props.options}
              {props.blocked ? (
                <p class={styles.error} data-share-blocked="">
                  {props.blocked}
                </p>
              ) : null}
              <p class={styles.note} data-share-cloud-reason="">
                {CLOUD_REASON}
              </p>
            </>
          ) : phase.kind === 'copied' ? (
            <div class={cx(local.center, styles.group)} data-share-copied="">
              <span class={cx(local.stateIcon, local.success)}>
                <Icon name="copy" size="lg" />
              </span>
              <p class={cx(local.stateTitle, 't-arabic-heading-xs')}>{phase.title}</p>
              <p class={cx(local.centerText, 't-arabic-ui-s')}>{phase.hint}</p>
            </div>
          ) : phase.kind === 'running' ? (
            <div class={local.center} data-share-running="">
              <Spinner size="m" label={phase.text} />
              <p class={cx(local.centerText, 't-arabic-ui-s')}>{phase.text}</p>
            </div>
          ) : phase.kind === 'done' ? (
            <Done phase={phase} />
          ) : phase.kind === 'error' ? (
            <div data-share-error="">
              <Banner tone="danger">
                <strong class="t-arabic-ui-s-strong">{FAILED[phase.path]}</strong>
                <span class={local.block}>{`${phase.message} ${props.keeps}`}</span>
                <span class={local.bannerActions}>
                  <Button
                    variant="secondary"
                    size="s"
                    icon="refresh"
                    onClick={props.onRun}
                    data-share-retry=""
                  >
                    أعد المحاولة
                  </Button>
                </span>
              </Banner>
            </div>
          ) : (
            <div class={local.center} data-share-cancelled="">
              <span class={cx(local.stateIcon, local.warning)}>
                <Icon name="close" size="lg" />
              </span>
              <p class={cx(local.stateTitle, 't-arabic-heading-xs')}>أُلغيت المشاركة</p>
              <p class={cx(local.centerText, 't-arabic-ui-s')}>{`لم يُنشأ ملفّ. ${props.keeps}`}</p>
            </div>
          )}
        </div>

        <footer class={styles.actions}>
          <Footer {...props} />
        </footer>
      </div>
    </div>
  )
}

function Done({ phase }: { readonly phase: Extract<SharePhase, { kind: 'done' }> }): JSX.Element {
  return (
    <div
      class={local.center}
      data-share-done={phase.path}
      data-share-blob={phase.blobUrl}
      data-share-route={phase.downloadId === null ? 'anchor' : 'managed'}
    >
      {phase.note ? (
        <div class={local.stretch} data-share-degraded="">
          <Banner tone="warning">{DENIED_TEXT}</Banner>
        </div>
      ) : (
        <span class={cx(local.stateIcon, local.success)}>
          <Icon name="check" size="lg" />
        </span>
      )}
      <p class={cx(local.stateTitle, 't-arabic-heading-xs')}>{phase.title}</p>
      <p class={cx(local.centerText, 't-arabic-ui-s')}>{phase.body}</p>
      <TechnicalValue kind="path" variant="mono-s" class={local.path}>
        {phase.shown}
      </TechnicalValue>
      <div class={cx(styles.summary, local.stretch)}>
        {phase.rows.map((row) => (
          <div key={row.label} class={styles.kv}>
            <span class={cx(styles.rowLabel, 't-arabic-ui-xs')}>{row.label}</span>
            {row.mono ? (
              <TechnicalValue kind="dimension" variant="mono-xs">
                {row.value}
              </TechnicalValue>
            ) : (
              <span class={cx(styles.rowValue, 't-arabic-ui-xs-strong')}>{row.value}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/** الأفعال في طرف السطر، والأساسيّ آخرها كما في الإطارات. */
function Footer(props: ShareDialogProps): JSX.Element {
  const { phase } = props
  switch (phase.kind) {
    case 'choose': {
      const run = RUN[props.path]
      return (
        <>
          <Button variant="secondary" size="l" onClick={props.onClose} data-share-dismiss="">
            ألغِ
          </Button>
          <Button
            variant="primary"
            size="l"
            icon={run.icon}
            onClick={props.onRun}
            data-share-run={props.path}
            {...(props.blocked ? { state: 'disabled' as const } : {})}
          >
            {run.label}
          </Button>
        </>
      )
    }
    case 'running':
      return (
        <Button variant="secondary" size="l" onClick={props.onCancelRun} data-share-cancel="">
          ألغِ
        </Button>
      )
    case 'copied':
      return (
        <Button variant="primary" size="l" onClick={props.onClose} data-share-finish="">
          تمّ
        </Button>
      )
    case 'done':
      if (phase.note) {
        return (
          <>
            <Button variant="secondary" size="l" onClick={props.onClose} data-share-finish="">
              أغلق
            </Button>
            <Button
              variant="secondary"
              size="l"
              icon="copy"
              onClick={props.onCopyInstead}
              data-share-copy-instead=""
            >
              انسخ إلى الحافظة
            </Button>
            <Button
              variant="primary"
              size="l"
              icon="shield"
              onClick={props.onGrant}
              data-share-grant=""
            >
              امنح الصلاحية
            </Button>
          </>
        )
      }
      return (
        <>
          <Button
            variant={phase.downloadId === null ? 'primary' : 'secondary'}
            size="l"
            onClick={props.onClose}
            data-share-finish=""
          >
            أغلق
          </Button>
          {phase.downloadId === null ? null : (
            <Button
              variant="primary"
              size="l"
              icon="folder"
              onClick={() => {
                if (phase.downloadId !== null) props.onReveal(phase.downloadId)
              }}
              data-share-reveal=""
            >
              اعرض في المجلّد
            </Button>
          )}
        </>
      )
    case 'error':
      return (
        <Button variant="secondary" size="l" onClick={props.onClose} data-share-finish="">
          أغلق
        </Button>
      )
    case 'cancelled':
      return (
        <>
          <Button variant="secondary" size="l" onClick={props.onClose} data-share-finish="">
            أغلق
          </Button>
          <Button variant="primary" size="l" onClick={props.onRestart} data-share-restart="">
            شارك من جديد
          </Button>
        </>
      )
  }
}

export interface StripTogglesProps {
  readonly strip: ShareStrip
  /** «احذف البيانات الوصفية عند التصدير» مفعَّل — الثلاثة محذوفة ومعطَّلة بسببه. */
  readonly forced: boolean
  readonly onChange: (strip: ShareStrip) => void
}

/** سبب تعطيل مفاتيح الحذف — الإعداد الذي يفرضها باسمه. */
export const FORCED_REASON = 'محذوفة — «احذف البيانات الوصفية عند التصدير» مفعَّل في الخصوصية.'

const STRIP_ROWS = [
  { key: 'url', label: 'رابط الصفحة' },
  { key: 'title', label: 'عنوان الصفحة' },
  { key: 'time', label: 'وقت الالتقاط' },
] as const

/**
 * «يُحذف قبل المشاركة» — **المفتاح المفعَّل يعني محذوفًا** كما يقول عنوان المجموعة. والمفروض بالخصوصية يُعرض
 * مفعَّلًا معطَّلًا وسببه نصٌّ مرئيّ: ما لا يُكتب لا يبدو قابلًا للكتابة.
 */
export function StripToggles(props: StripTogglesProps): JSX.Element {
  return (
    <section class={styles.group} aria-labelledby="share-strip-label" data-share-strip="">
      <h3 id="share-strip-label" class={cx(styles.groupLabel, 't-arabic-label-xs')}>
        يُحذف قبل المشاركة
      </h3>
      <div class={styles.card}>
        {STRIP_ROWS.map((row, i) => (
          <div key={row.key} data-share-strip-field={row.key}>
            <SettingRow
              id={`share-strip-${row.key}`}
              label={row.label}
              {...(props.forced ? { hint: FORCED_REASON } : {})}
              divider={i < STRIP_ROWS.length - 1}
              control={
                <Toggle
                  on={props.forced || props.strip[row.key]}
                  aria-label={`احذف ${row.label}`}
                  {...(props.forced
                    ? { state: 'disabled' as const }
                    : {
                        onChange: (on: boolean) =>
                          props.onChange({ ...props.strip, [row.key]: on }),
                      })}
                />
              }
            />
          </div>
        ))}
      </div>
    </section>
  )
}

/** صفوف ملخّص تحت البطاقات — ملخّص الدليل وخيارات الملفّ. */
export function SummaryRows(props: {
  readonly rows: readonly ShareRow[]
  readonly data?: string
}): JSX.Element {
  return (
    <div class={styles.summary} data-share-summary={props.data ?? ''}>
      {props.rows.map((row) => (
        <div key={row.label} class={styles.kv}>
          <span class={cx(styles.rowLabel, 't-arabic-ui-xs')}>{row.label}</span>
          <span class={cx(styles.rowValue, 't-arabic-ui-xs-strong')}>{row.value}</span>
        </div>
      ))}
    </div>
  )
}
