/**
 * قسم الاختصارات (`settings / shortcuts`، `281:862`): الالتقاط من أي صفحة، والأدوات داخل
 * الصفحة، والثابتة.
 *
 * **الأربعة العامة تُقرأ حيًّا من `chrome.commands.getAll()`** لا بحرف مفترَض: المتصفّح
 * قد يحجز التركيبة صامتًا على منصّة بعينها (`Docs/Engineering.md §6` الصفّ 99)، والقراءة
 * الحيّة تعرض الفراغ بصدق. وحروف الأدوات تُغيَّر هنا بضغطة حرف، وتسري على الطبقة
 * المفتوحة فورًا بلا إعادة حقن (الصفّ 117).
 */
import { useEffect, useState } from 'preact/hooks'

import { DEFAULT_TOOL_KEYS, MODE_META, type ToolShortcutMode } from '@/shared/modes'
import { isMacPlatform } from '@/shared/platform'
import { Banner } from '@/ui/components/Banner/Banner'
import { Button } from '@/ui/components/Button/Button'
import { SettingRow } from '@/ui/components/SettingRow/SettingRow'
import { KeyCap } from '@/ui/TechnicalValue'

import { Group } from './Group'
import styles from './ShortcutsTab.module.css'

import type { Persist } from '../persist'
import type { Result } from '@/shared/result'
import type { Settings } from '@/shared/settings'

const TOOL_MODES: readonly ToolShortcutMode[] = ['inspect', 'measure', 'colour', 'compare']

const TOOL_LABEL: Readonly<Record<ToolShortcutMode, string>> = {
  inspect: 'فحص',
  measure: 'قياس',
  colour: 'ألوان',
  compare: 'مقارنة',
}

/** أوامر الالتقاط بترتيب القراءة وتسمياتها كما في الإطار. */
const CAPTURE_COMMANDS: readonly { name: string; label: string }[] = [
  { name: 'capture-area', label: 'التقاط منطقة' },
  { name: 'capture-element', label: 'التقاط عنصر' },
  { name: 'capture-viewport', label: 'الجزء الظاهر' },
  { name: 'capture-full-page', label: 'صفحة كاملة' },
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
  persist: Persist
}

export function ShortcutsTab({ settings, onSave, persist }: ShortcutsTabProps) {
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
      persist(() => onSave(mode, code))
    }

    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [listening, settings.shortcuts.toolKeys, onSave, persist])

  const openChromeShortcuts = () => {
    void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' })
  }

  const mac = isMacPlatform()

  return (
    <>
      {error ? (
        <Banner tone="danger" onDismiss={() => setError(null)}>
          {error}
        </Banner>
      ) : null}

      <Group title="الالتقاط من أي صفحة" id="settings-capture-shortcuts">
        {CAPTURE_COMMANDS.map(({ name, label }) => {
          const shortcut = commands?.find((c) => c.name === name)?.shortcut
          return (
            <SettingRow
              key={name}
              label={label}
              divider
              control={
                shortcut ? (
                  <KeyCap>{shortcut}</KeyCap>
                ) : (
                  <span class={styles.none}>{commands ? 'بلا اختصار فعلي' : '…'}</span>
                )
              }
            />
          )
        })}
        <SettingRow
          id="shortcuts-change"
          label="غيّر اختصارات الالتقاط"
          hint="يحفظها المتصفّح نفسه، فتُغيَّر من صفحة اختصاراته"
          control={
            <Button variant="secondary" size="s" onClick={openChromeShortcuts}>
              افتح صفحة الاختصارات
            </Button>
          }
        />
      </Group>

      <Group title="الأدوات داخل الصفحة" id="settings-tool-shortcuts">
        {TOOL_MODES.map((mode, i) => {
          const code = settings.shortcuts.toolKeys[mode] ?? DEFAULT_TOOL_KEYS[mode]
          const letter = letterFromCode(code) ?? code
          const active = listening === mode
          return (
            <SettingRow
              key={mode}
              label={TOOL_LABEL[mode]}
              hint={i === 0 ? 'اضغط الحرف لتغييره. حرف لاتيني واحد، لا رقم ولا رمز' : undefined}
              divider={i < TOOL_MODES.length - 1}
              control={
                <button
                  type="button"
                  class={styles.keyButton}
                  aria-pressed={active}
                  aria-label={`غيّر اختصار ${TOOL_LABEL[mode]}، الحالي ⌥⇧${letter}`}
                  disabled={listening !== null && !active}
                  onClick={() => {
                    setError(null)
                    setListening(active ? null : mode)
                  }}
                >
                  {active ? (
                    <span class={styles.listening}>اضغط حرفًا… (Esc للإلغاء)</span>
                  ) : (
                    <KeyCap>{`⌥⇧${letter}`}</KeyCap>
                  )}
                </button>
              }
            />
          )
        })}
      </Group>

      <Group title="ثابتة" id="settings-fixed-shortcuts">
        <SettingRow
          label="استخراج لوحة الصفحة"
          divider
          control={<KeyCap>{mac ? '⌘K' : 'Ctrl+K'}</KeyCap>}
        />
        <SettingRow label="درجة القياس التالية والسابقة" divider control={<KeyCap>↑ / ↓</KeyCap>} />
        <SettingRow label="خروج من الأداة" divider control={<KeyCap>Esc</KeyCap>} />
        <SettingRow label="ورقة الاختصارات" control={<KeyCap>?</KeyCap>} />
      </Group>
    </>
  )
}
