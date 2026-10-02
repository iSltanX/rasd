import { useEffect, useRef, useState } from 'preact/hooks'

import { DEFAULT_TOOL_KEYS, type ToolShortcutMode } from '@/shared/modes'
import { isMacPlatform } from '@/shared/platform'
import { watchSettings, type Settings } from '@/shared/settings'
import { Button } from '@/ui/components/Button/Button'
import { IconButton } from '@/ui/components/IconButton/IconButton'
import { SettingRow } from '@/ui/components/SettingRow/SettingRow'
import { KeyCap } from '@/ui/TechnicalValue'
import { useFocusTrap } from '@/ui/use-focus-trap'

import { CAPTURE_COMMANDS } from './capture-commands'
import { AssignShortcut, useOpenShortcuts } from './open-shortcuts'
import styles from './ShortcutsSheet.module.css'

import type { JSX } from 'preact'

const TOOLS: readonly { mode: ToolShortcutMode; label: string }[] = [
  { mode: 'inspect', label: 'فحص' },
  { mode: 'measure', label: 'قياس' },
  { mode: 'colour', label: 'ألوان' },
  { mode: 'compare', label: 'مقارنة' },
]

const letterOf = (code: string): string => /^Key([A-Z])$/.exec(code)?.[1] ?? code

export interface ShortcutsSheetProps {
  onClose: () => void
}

/**
 * ورقة الاختصارات (`shortcuts / sheet`) — تُفتح بـ`?` من أي صفحة إضافة، وتعرض الاختصارات
 * **الفعلية** لا المرسومة: أوامر الالتقاط من `chrome.commands.getAll()` (المتصفّح قد
 * يحجز تركيبة صامتًا، `Docs/Engineering.md §6` الصفّ 99)، وحروف الأدوات من الإعدادات.
 */
export function ShortcutsSheet({ onClose }: ShortcutsSheetProps): JSX.Element {
  const [commands, setCommands] = useState<readonly chrome.commands.Command[] | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const dialog = useRef<HTMLDivElement>(null)
  useFocusTrap(dialog)
  const shortcutsPage = useOpenShortcuts()

  useEffect(() => {
    void chrome.commands.getAll().then(setCommands)
    return watchSettings(setSettings)
  }, [])

  useEffect(() => {
    dialog.current?.querySelector<HTMLElement>('button')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const mac = isMacPlatform()
  const toolKey = (mode: ToolShortcutMode) =>
    `⌥⇧${letterOf(settings?.shortcuts.toolKeys[mode] ?? DEFAULT_TOOL_KEYS[mode])}`

  return (
    <div class={styles.scrim} onClick={onClose}>
      <div
        ref={dialog}
        class={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rasd-shortcuts-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div class={styles.head}>
          <div class={styles.titles}>
            <h2 class={`${styles.title} t-arabic-heading-s`} id="rasd-shortcuts-title">
              الاختصارات
            </h2>
            <p class={`${styles.subtitle} t-arabic-ui-xs`}>
              {mac
                ? 'اختصارات macOS كما سجّلها المتصفّح.'
                : 'اختصارات هذا الجهاز كما سجّلها المتصفّح.'}
            </p>
          </div>
          <IconButton icon="close" aria-label="أغلق" size="m" onClick={onClose} />
        </div>

        <div class={styles.body}>
          <section class={styles.group} aria-labelledby="rasd-sheet-capture">
            <p class={styles.groupTitle} id="rasd-sheet-capture">
              الالتقاط من أي صفحة
            </p>
            <div class={styles.card}>
              {CAPTURE_COMMANDS.map(({ name, label }, i) => {
                const shortcut = commands?.find((c) => c.name === name)?.shortcut
                return (
                  <SettingRow
                    key={name}
                    label={label}
                    divider={i < CAPTURE_COMMANDS.length - 1}
                    control={
                      shortcut ? (
                        <KeyCap>{shortcut}</KeyCap>
                      ) : (
                        <AssignShortcut ready={commands !== null} {...shortcutsPage} />
                      )
                    }
                  />
                )
              })}
            </div>
          </section>

          <section class={styles.group} aria-labelledby="rasd-sheet-tools">
            <p class={styles.groupTitle} id="rasd-sheet-tools">
              الأدوات داخل الصفحة
            </p>
            <div class={styles.card}>
              {TOOLS.map(({ mode, label }) => (
                <SettingRow
                  key={mode}
                  label={label}
                  divider
                  control={<KeyCap>{toolKey(mode)}</KeyCap>}
                />
              ))}
              <SettingRow
                label="لوحة الصفحة"
                divider
                control={<KeyCap>{mac ? '⌘K' : 'Ctrl+K'}</KeyCap>}
              />
              <SettingRow label="خروج من الأداة" control={<KeyCap>Esc</KeyCap>} />
            </div>
          </section>
        </div>

        <div class={styles.actions}>
          <Button variant="secondary" size="l" icon="keyboard" onClick={shortcutsPage.open}>
            غيّر اختصارات الالتقاط
          </Button>
        </div>
      </div>
    </div>
  )
}
