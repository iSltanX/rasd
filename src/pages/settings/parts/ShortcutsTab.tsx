/**
 * تبويب الاختصارات — `§12.4`: عرض الخريطة الكاملة، تعديل اختصارات الأدوات
 * داخل الصفحة، ورابط `chrome://extensions/shortcuts` للأربعة العامة مع شرح
 * سبب القيد.
 *
 * **الأربعة العامة تُقرأ حيًّا من `chrome.commands.getAll()`** لا بحرف مفترَض
 * ثابت — بالضبط العلّة التي كشفها `Rasd_Plan.md §6` صفّ 99: شارة ثابتة يمكن
 * أن تكذب حين يحجز المتصفّح التركيبة صامتًا على منصّة بعينها. القراءة الحيّة
 * تعرض الفراغ بصدق بدل حرفٍ لا يعمل.
 */
import { useEffect, useState } from 'preact/hooks'

import { DEFAULT_TOOL_KEYS, MODE_META, type ToolShortcutMode } from '@/shared/modes'
import { Banner } from '@/ui/components/Banner/Banner'
import { Button } from '@/ui/components/Button/Button'
import { KeyCap } from '@/ui/TechnicalValue'

import styles from './SettingsTab.module.css'

import type { Result } from '@/shared/result'
import type { Settings } from '@/shared/settings'

const TOOL_MODES: readonly ToolShortcutMode[] = ['inspect', 'measure', 'colour', 'compare']

/** أسماء الأوامر الأربعة وتسمياتها — تطابق `pages/popup/views/Default.tsx` حرفًا بحرف. */
const CAPTURE_COMMAND_LABEL: Readonly<Record<string, string>> = {
  'capture-element': 'عنصر',
  'capture-area': 'منطقة',
  'capture-full-page': 'صفحة كاملة',
  'capture-viewport': 'الظاهر',
}
const CAPTURE_COMMAND_ORDER = [
  'capture-element',
  'capture-area',
  'capture-full-page',
  'capture-viewport',
]

const KEY_LETTER = /^Key([A-Z])$/

/** حرف فعليّ صالح لإعادة التعيين — لا `Escape`/`Shift` ولا رقم ولا رمز. */
function letterFromCode(code: string): string | null {
  const m = KEY_LETTER.exec(code)
  return m ? (m[1] ?? null) : null
}

export interface ShortcutsTabProps {
  settings: Settings
  onSave: (mode: ToolShortcutMode, code: string) => Promise<Result<Settings>>
}

export function ShortcutsTab({ settings, onSave }: ShortcutsTabProps) {
  const [failed, setFailed] = useState(false)
  const [commands, setCommands] = useState<readonly chrome.commands.Command[] | null>(null)
  const [listening, setListening] = useState<ToolShortcutMode | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void chrome.commands.getAll().then(setCommands)
  }, [])

  useEffect(() => {
    if (!listening) return
    const mode = listening

    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.code === 'Escape') {
        setListening(null)
        return
      }
      const letter = letterFromCode(e.code)
      if (!letter) {
        setError('اختر حرفًا لاتينيًّا واحدًا — لا رقمًا ولا رمزًا.')
        return
      }
      const code = `Key${letter}`
      const taken = TOOL_MODES.find(
        (m) => m !== mode && (settings.shortcuts.toolKeys[m] ?? DEFAULT_TOOL_KEYS[m]) === code,
      )
      if (taken) {
        setError(`الحرف ${letter} مُستخدَم أصلًا لأداة «${MODE_META[taken].label}».`)
        return
      }
      setError(null)
      setListening(null)
      void onSave(mode, code).then((result) => setFailed(!result.ok))
    }

    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [listening, settings.shortcuts.toolKeys, onSave])

  const startListening = (mode: ToolShortcutMode) => {
    setError(null)
    setListening(mode)
  }

  const openChromeShortcuts = () => {
    void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' })
  }

  return (
    <section class={styles.tab}>
      {failed ? (
        <Banner tone="danger">تعذّر حفظ الإعداد — أُعيد المعروض إلى آخر قيمة محفوظة.</Banner>
      ) : null}
      {error ? <Banner tone="danger">{error}</Banner> : null}

      <div class={styles.section}>
        <span class={styles.sectionTitle}>الاختصارات العامة</span>
        <span class={styles.rowHint}>
          يقبل Chrome أربعة اختصارات عامة فقط لكل إضافة — وهذا حدّ المنصّة لا اختيار رصد. عدِّلها من
          صفحة اختصارات Chrome نفسها.
        </span>
      </div>
      {CAPTURE_COMMAND_ORDER.map((name) => {
        const command = commands?.find((c) => c.name === name)
        return (
          <div class={styles.row} key={name}>
            <span class={styles.rowLabel}>{CAPTURE_COMMAND_LABEL[name]}</span>
            {command?.shortcut ? (
              <KeyCap>{command.shortcut}</KeyCap>
            ) : (
              <span class={styles.rowHint}>{commands ? 'بلا اختصار فعلي' : '…'}</span>
            )}
          </div>
        )
      })}
      <div class={styles.row}>
        <Button variant="secondary" size="s" onClick={openChromeShortcuts}>
          فتح صفحة اختصارات Chrome
        </Button>
      </div>

      <div class={styles.section}>
        <span class={styles.sectionTitle}>اختصارات الأدوات</span>
        <span class={styles.rowHint}>مُعدِّل ⌥⇧ ثابت لكل الأدوات؛ الحرف وحده قابل للتغيير.</span>
      </div>
      {TOOL_MODES.map((mode) => {
        const code = settings.shortcuts.toolKeys[mode] ?? DEFAULT_TOOL_KEYS[mode]
        const letter = letterFromCode(code) ?? code
        return (
          <div class={styles.row} key={mode}>
            <span class={styles.rowLabel}>{MODE_META[mode].label}</span>
            <div class={styles.rowControl}>
              {listening === mode ? (
                <span class={styles.rowHint}>بانتظار ضغطة مفتاح… (Esc للإلغاء)</span>
              ) : (
                <KeyCap>{`⌥⇧${letter}`}</KeyCap>
              )}
              <Button
                variant="ghost"
                size="s"
                state={listening !== null ? 'disabled' : 'default'}
                onClick={() => startListening(mode)}
                aria-label={`تغيير اختصار أداة ${MODE_META[mode].label}`}
              >
                تعديل
              </Button>
            </div>
          </div>
        )
      })}

      <div class={styles.section}>
        <span class={styles.sectionTitle}>اختصارات ثابتة</span>
      </div>
      <div class={styles.row}>
        <span class={styles.rowLabel}>لوحة استخراج الألوان</span>
        <KeyCap>⌘K · Ctrl+K</KeyCap>
      </div>
      <div class={styles.row}>
        <span class={styles.rowLabel}>إلغاء الوضع النشط</span>
        <KeyCap>Esc</KeyCap>
      </div>
      <div class={styles.row}>
        <span class={styles.rowLabel}>تبديل درجة القياس</span>
        <KeyCap>↑ / ↓</KeyCap>
      </div>
    </section>
  )
}
