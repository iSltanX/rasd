/**
 * إدارة المواقع المستثناة — `§11.2`.
 *
 * **بلا إطار في Figma.** إطار `privacy / controls` يرسم رقاقة عدّاد
 * («٧ مواقع مستثناة») ولا يرسم إضافةً ولا حذفًا ولا استيرادًا ولا تصديرًا ولا
 * قائمةً مقترحة — بينما نصّ الوحدة 20.3 يوجب الخمسة. فبُنيت هنا على نمط
 * `card/row` القائم نفسه، والانحراف مُسجَّل ليُرسم في Figma عند الوحدة 26.1
 * (‏`Rasd_Plan.md §6` صفّ 125) — لا يُرقَّع الكود لاحقًا ليطابق رسمًا ناقصًا.
 *
 * **ولماذا صفُّ قائمةٍ لا `Chip` قابلة للإزالة.** `Chip.onRemove` يبني زرًّا
 * تسميته مثبَّتة نصًّا: «إزالة الوسم» — بلا خاصّية تغيّرها. فقارئ الشاشة كان
 * سيقول «إزالة الوسم» عن موقعٍ مصرفيّ، ويُسمِع المستخدمَ الشيء نفسه عن كل
 * صفّ. `IconButton` بتسمية تحمل اسم الموقع هو النمط القائم في
 * `library/parts/ProjectsPanel.tsx`، وهو ما اتُّبع.
 */
import { useRef, useState } from 'preact/hooks'

import { plural } from '@/shared/bidi'
import { Banner } from '@/ui/components/Banner/Banner'
import { Button } from '@/ui/components/Button/Button'
import { IconButton } from '@/ui/components/IconButton/IconButton'
import { Input } from '@/ui/components/Input/Input'

import { savedFormOf } from '../context'

import listStyles from './ExcludedSites.module.css'
import styles from './SettingsTab.module.css'

import type { JSX } from 'preact'

/**
 * القائمة المقترحة — «المواقع البنكية والبريد ولوحات الإدارة» (`§11.2`).
 *
 * أنماطٌ عامّة لا أسماء نطاقات بعينها: قائمةٌ تسمّي مصارف بلدٍ واحد تكون
 * زينةً لمن هو خارجه. والثلاثة هنا أنماط يكتبها المستخدم عادةً بنفسه، تُعرض
 * أمثلةً جاهزة يضيفها بنقرة ويعدّلها كما شاء.
 */
const SUGGESTED: readonly string[] = ['*.bank.com', 'mail.google.com', '*.admin.example.com']

/**
 * نصّ الرفض — يسمّي ما يُقبل، لا «قيمة غير صالحة» وحدها.
 *
 * وبلا مقاطع لاتينية عارية: `chrome://` و`file://` داخل جملة عربية تنقلب
 * نقطتاها ومائلاتها بصريًّا بلا عزل، و`errorMessage` نصٌّ خام لا JSX فلا
 * سبيل لـ`<bdi>` فيه. رصدته مراجعة Gate B، وحُلّ بإزالة الحاجة إليهما:
 * الجملة تصف الصنف بالعربية بدل أن تكتب البادئتين.
 */
const INVALID_HINT =
  'نمطٌ لا يصلح. اكتب نطاقًا مثل bank.com أو ‎*.bank.com — ولا تُقبل عناوين صفحات المتصفّح الداخلية ولا الملفّات المحلّية.'

export interface ExcludedSitesProps {
  sites: readonly string[]
  onAdd: (raw: string) => Promise<'invalid' | 'ok' | 'failed'>
  onRemove: (value: string) => Promise<boolean>
  onImport: (entries: readonly unknown[]) => Promise<{ added: number; rejected: number } | 'failed'>
}

type Notice = { tone: 'danger' | 'success' | 'warning'; text: string } | null

export function ExcludedSites({
  sites,
  onAdd,
  onRemove,
  onImport,
}: ExcludedSitesProps): JSX.Element {
  const [draft, setDraft] = useState('')
  const [invalid, setInvalid] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  /**
   * `fromForm` يفصل مصدر الإضافة — والفرق ليس تجميليًّا: تصفيرُ الحقل بعد
   * نقرة اقتراح كان يمحو ما كتبه المستخدم بيده ولم يُضِفه بعد. رصدته مراجعة
   * Gate B، وكذلك أن الرفض كان يُعلَّم على الحقل حتى حين لا يكون مصدرُه الحقل.
   */
  const add = async (raw: string, fromForm: boolean) => {
    const trimmed = raw.trim()
    if (trimmed === '') return
    const outcome = await onAdd(trimmed)
    if (outcome === 'invalid') {
      if (fromForm) setInvalid(true)
      setNotice(fromForm ? null : { tone: 'danger', text: `«${trimmed}» نمطٌ لا يصلح.` })
      return
    }
    setInvalid(false)
    setNotice(
      outcome === 'failed'
        ? { tone: 'danger', text: 'تعذّر حفظ القائمة — لم يُضَف الموقع.' }
        : null,
    )
    if (outcome === 'ok' && fromForm) setDraft('')
  }

  const submit = (event: Event) => {
    event.preventDefault()
    void add(draft, true)
  }

  /**
   * التصدير مرساةٌ على عنوان كائن — لا `chrome.downloads`.
   *
   * صلاحية `downloads` اختيارية وتُظهر تحذير «إدارة تنزيلاتك»، وطلبها لحفظ
   * ملفّ نصّي من صفحة إضافة لا مبرّر له: `<a download>` يكفي بلا صلاحية
   * أصلًا (‏`Docs/ADR/permissions.md`). والعنوان يُحرَّر بعد النقر لا يُترك
   * معلَّقًا على عمر الصفحة.
   */
  const exportList = () => {
    const blob = new Blob([JSON.stringify({ excludedSites: [...sites] }, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'rasd-excluded-sites.json'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  /**
   * الاستيراد يقبل الشكلين: `{ "excludedSites": [...] }` كما نُصدّره، و
   * مصفوفةً عارية كما قد يكتبها المستخدم بيده. ورفضُ ملفٍّ صالحٍ لأن شكله
   * الخارجيّ اختلف تعنّتٌ لا تحقّق.
   */
  const importFile = async (file: File) => {
    let entries: readonly unknown[]
    try {
      const parsed: unknown = JSON.parse(await file.text())
      const wrapped = (parsed as { excludedSites?: unknown }).excludedSites
      entries = Array.isArray(parsed) ? parsed : Array.isArray(wrapped) ? wrapped : []
    } catch {
      setNotice({ tone: 'danger', text: 'الملفّ ليس JSON صالحًا — لم يتغيّر شيء.' })
      return
    }

    if (entries.length === 0) {
      setNotice({ tone: 'warning', text: 'لا مواقع في هذا الملفّ — لم يتغيّر شيء.' })
      return
    }

    const outcome = await onImport(entries)
    if (outcome === 'failed') {
      setNotice({ tone: 'danger', text: 'تعذّر حفظ القائمة — لم يتغيّر شيء.' })
      return
    }
    const rejected =
      outcome.rejected === 0
        ? ''
        : ` وتُخُطّي ${plural(outcome.rejected, 'نمط', 'نمطان', 'أنماط')} لا تصلح.`
    setNotice({
      tone: outcome.rejected > 0 ? 'warning' : 'success',
      text: `أُضيف ${plural(outcome.added, 'موقع', 'موقعان', 'مواقع')}.${rejected}`,
    })
  }

  // مقارنةٌ مِثلًا بمِثل: `*.bank.com` يُحفَظ `bank.com`، فمقارنة الخام
  // بالمحفوظ تُبقي الاقتراح ظاهرًا بعد إضافته (رصدته مراجعة Gate B).
  const missing = SUGGESTED.filter((suggestion) => {
    const saved = savedFormOf(suggestion)
    return saved === null || !sites.includes(saved)
  })

  return (
    <div class={listStyles.panel}>
      {notice ? (
        <Banner tone={notice.tone} onDismiss={() => setNotice(null)}>
          {notice.text}
        </Banner>
      ) : null}

      <form class={listStyles.addForm} onSubmit={submit}>
        <Input
          value={draft}
          onInput={(value) => {
            setDraft(value)
            setInvalid(false)
          }}
          state={invalid ? 'error' : 'default'}
          {...(invalid ? { errorMessage: INVALID_HINT } : {})}
          placeholder="bank.com أو ‎*.bank.com"
          aria-label="نمط موقع يُستثنى"
        />
        <Button type="submit" variant="primary" size="s" icon="plus">
          استثنِ
        </Button>
      </form>

      {sites.length === 0 ? (
        <p class={listStyles.empty}>
          لا مواقع مستثناة بعد — رصد يعمل في كل موقع تفتحه فيه أداةً بنفسك.
        </p>
      ) : (
        <ul class={listStyles.list}>
          {sites.map((site) => (
            <li key={site} class={listStyles.item}>
              <bdi class={listStyles.host} dir="ltr">
                {site}
              </bdi>
              <IconButton
                icon="trash"
                aria-label={`احذف ${site} من المواقع المستثناة`}
                onClick={() =>
                  void onRemove(site).then((ok) => {
                    // الحذف كان يفشل صامتًا بينما الإضافة تُعلن فشلها — والصفّ
                    // يبقى معروضًا فيبدو أن شيئًا لم يقع. رصدته مراجعة Gate B.
                    if (!ok)
                      setNotice({ tone: 'danger', text: 'تعذّر حفظ القائمة — لم يُحذف الموقع.' })
                  })
                }
              />
            </li>
          ))}
        </ul>
      )}

      {missing.length > 0 ? (
        <div class={listStyles.suggested}>
          <span class={styles.rowHint}>أنماط شائعة — أضِفها بنقرة ثم عدّلها:</span>
          <div class={listStyles.suggestedRow}>
            {missing.map((suggestion) => (
              <Button
                key={suggestion}
                variant="ghost"
                size="s"
                icon="plus"
                onClick={() => void add(suggestion, false)}
              >
                <bdi dir="ltr">{suggestion}</bdi>
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      <div class={listStyles.transferRow}>
        <Button variant="secondary" size="s" icon="download" onClick={exportList}>
          صدِّر القائمة
        </Button>
        <Button variant="secondary" size="s" icon="folder" onClick={() => fileRef.current?.click()}>
          استورد قائمة
        </Button>
        {/*
         * حقل الملفّ مخفيّ بصريًّا ويُنقر برمجيًّا من زرٍّ حقيقي: مظهر
         * `input[type=file]` غير قابل للتنسيق بما يطابق نظام التصميم، وهذا
         * أوّل حقل ملفّ في المشروع كلّه فلا نمط سابق يُتبع.
         *
         * و`rasd-sr-only` القائم في `public/assets/base.css` لا نسخةٌ منه:
         * إخفاءٌ بلا `display: none` — وعنصرٌ بـ`display: none` لا يقبل
         * `.click()` في كل المتصفّحات. ومُخرَجٌ من ترتيب Tab بـ`tabIndex`
         * و`aria-hidden`، فالزرّ الحقيقي هو نقطة الوصول الوحيدة.
         */}
        <input
          ref={fileRef}
          class="rasd-sr-only"
          type="file"
          accept="application/json,.json"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            const input = event.currentTarget
            const file = input.files?.[0]
            if (file) void importFile(file)
            // تصفير القيمة كي يُقبل اختيار الملفّ نفسه مرّتين متتاليتين.
            input.value = ''
          }}
        />
      </div>
    </div>
  )
}
