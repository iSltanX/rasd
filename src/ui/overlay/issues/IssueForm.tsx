import { useState } from 'preact/hooks'

import { Icon } from '@/ui/icons/Icon'

import type { IssueFormModel, IssueFormValues } from './types'
import type { JSX } from 'preact'

/**
 * `issue / create` و`create-spacing` و`create-colour` و`save-error` — نموذج «سجّل مشكلة» بجوار لوحة الأداة.
 *
 * **«الآن» تُقرأ ولا تُكتب،** و«المتوقَّعة» والسماح يكتبهما المستخدم. والنصّ يبقى في الحالة المحلّية ما دام
 * النموذج مفتوحًا، ففشل الحفظ لا يمسح ما كُتب — وزرّه الوحيد حينها «أعد المحاولة».
 *
 * **والمفاتيح تقف عند حدّ النموذج** (ADR 0032): لا يبلغ حرفٌ مكتوب هنا مستمعي الصفحة في طور الفقاعة، ولا
 * نقرةٌ فيه أداةَ القياس تحته.
 *
 * **فروقٌ عن الإطار لميزانية `content.js`** (مكتوبة في `Docs/Design.md` §5): اللون والتباين خياران في قائمة
 * الخاصية لا تبويبان، ومستوى التباين حدٌّ أدنى يُكتب في «المتوقَّعة» لا قائمة، والمشروع وخطوات الإعادة
 * يُكتبان في تفصيل المشكلة في المكتبة، والإغلاق بـ«إلغاء» و`Esc` لا بزرّ في الرأس.
 */

const TOLERANCES = [0, 1, 2, 4]

const stop = (e: Event): void => e.stopPropagation()

export interface IssueFormProps {
  readonly model: IssueFormModel
  readonly busy: boolean
  readonly error: string | null
  readonly onSubmit: (values: IssueFormValues) => void
  readonly onCancel: () => void
  /** حقلٌ فيه مركَّز — تسأله الاختصارات فلا تبدّل الأداة والمستخدم يكتب. */
  readonly onTyping: (typing: boolean) => void
}

export function IssueForm({
  model,
  busy,
  error,
  onSubmit,
  onCancel,
  onTyping,
}: IssueFormProps): JSX.Element {
  const [index, setIndex] = useState(0)
  const option = model.options[index] ?? model.options[0]
  const contrast = option?.kind === 'contrast'
  const [expected, setExpected] = useState('')
  const [tolerance, setTolerance] = useState(option?.kind === 'spacing' ? 1 : 0)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [withNote, setWithNote] = useState(true)

  const value = (set: (v: string) => void) => (e: Event) =>
    set((e.currentTarget as HTMLInputElement).value)
  const submit = (e: Event): void => {
    e.preventDefault()
    if (option) onSubmit({ option, expected, tolerance, title, body, withNote })
  }

  return (
    <form
      class="rasd-ov-insp rasd-ov-iss-form"
      aria-label="سجّل مشكلة"
      data-rasd-ov="issue-form"
      onSubmit={submit}
      onKeyDown={stop}
      onKeyUp={stop}
      onKeyPress={stop}
      onInput={stop}
      onPointerDown={stop}
      onFocusIn={() => onTyping(true)}
      onFocusOut={() => onTyping(false)}
    >
      <div class="rasd-ov-insp-head rasd-ov-iss-h">سجّل مشكلة</div>

      <bdi class="rasd-ov-iss-sec rasd-ov-iss-mono">{model.subject}</bdi>

      <label class="rasd-ov-iss-sec rasd-ov-iss-field">
        العنوان
        <input value={title} maxLength={200} data-issue-field="title" onInput={value(setTitle)} />
      </label>

      <div class="rasd-ov-iss-sec rasd-ov-iss-grid">
        <label class="rasd-ov-iss-field">
          الخاصية
          <select
            value={String(index)}
            onChange={(e) => {
              const i = Number(e.currentTarget.value)
              setIndex(i)
              // حدّ AA للنصّ العادي افتراضًا — يُعدَّل في الحقل.
              if (model.options[i]?.kind === 'contrast' && !expected) setExpected('4.5')
            }}
          >
            {model.options.map((o, i) => (
              <option key={o.kind + o.property} value={String(i)}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {contrast ? null : (
          <label class="rasd-ov-iss-field">
            السماح
            <select
              value={String(tolerance)}
              onChange={(e) => setTolerance(Number(e.currentTarget.value))}
            >
              {TOLERANCES.map((t) => (
                <option key={t} value={String(t)}>
                  {option?.kind === 'colour' ? `ΔE ${t}` : `±${t}px`}
                </option>
              ))}
            </select>
          </label>
        )}
        <label class="rasd-ov-iss-field">
          الآن
          <output class="rasd-ov-iss-mono">
            {contrast ? `${option.value} : 1` : (option?.value ?? '—')}
          </output>
        </label>
        <label class="rasd-ov-iss-field">
          المتوقَّعة
          <input
            class="rasd-ov-iss-mono"
            dir="ltr"
            value={expected}
            maxLength={400}
            data-issue-field="expected"
            onInput={value(setExpected)}
          />
        </label>
        <label class="rasd-ov-iss-field">
          الملاحظة
          <textarea value={body} maxLength={4000} rows={3} onInput={value(setBody)} />
        </label>
        <label class="rasd-ov-iss-check">
          <input
            type="checkbox"
            checked={withNote}
            onChange={(e) => setWithNote(e.currentTarget.checked)}
          />
          ملاحظة في المحرّر
        </label>
      </div>

      {error ? (
        <p class="rasd-ov-iss-err" role="alert" data-rasd-ov="issue-error">
          {error}
        </p>
      ) : null}

      <div class="rasd-ov-insp-foot">
        <button
          type="submit"
          class="rasd-ov-cp-btn rasd-ov-cp-btn-primary"
          disabled={busy || !option || !title.trim() || !expected.trim()}
          data-rasd-ov="issue-submit"
        >
          <Icon name={error ? 'refresh' : 'check'} size="sm" />
          {busy ? 'جارٍ الحفظ' : error ? 'أعد المحاولة' : 'سجّل المشكلة'}
        </button>
        <button type="button" class="rasd-ov-cp-btn" onClick={onCancel}>
          إلغاء
        </button>
      </div>
    </form>
  )
}

/** زرّ «سجّل مشكلة» في تذييل لوحات الفحص والقياس واللون. */
export function LogIssueButton({
  onClick,
  disabledReason,
}: {
  readonly onClick: () => void
  /** سببٌ مفهوم حين لا يُسجَّل بعد — الزرّ يُعرض معطَّلًا به لا صامتًا. */
  readonly disabledReason?: string | null
}): JSX.Element {
  return (
    <div class="rasd-ov-insp-foot">
      <button
        type="button"
        class="rasd-ov-insp-btn rasd-ov-iss-log"
        data-rasd-ov="log-issue"
        disabled={!!disabledReason}
        onPointerDown={stop}
        onClick={onClick}
      >
        <Icon name="alert" size="sm" />
        سجّل مشكلة
      </button>
    </div>
  )
}
