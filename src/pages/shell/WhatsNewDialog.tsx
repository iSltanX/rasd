import { useEffect, useRef } from 'preact/hooks'

import { REPO_URL, SHOW_REPO_LINK } from '@/shared/links'
import { Button } from '@/ui/components/Button/Button'
import { IconButton } from '@/ui/components/IconButton/IconButton'
import { Icon } from '@/ui/icons/Icon'
import { useFocusTrap } from '@/ui/use-focus-trap'

import { displayVersion, type ChangelogEntry } from './whats-new'
import styles from './WhatsNewDialog.module.css'

import type { JSX } from 'preact'

export interface WhatsNewDialogProps {
  entry: ChangelogEntry
  /**
   * `update` بعد الترقية مرّة (قشرة الصفحات)، و`about` بطلب المستخدم من «عن رصد» — فلا تقول له
   * البطاقة إنها تظهر مرّة وهو يفتحها للمرّة الخامسة.
   */
  origin: 'update' | 'about'
  onClose: () => void
}

const SUBTITLE: Record<WhatsNewDialogProps['origin'], string> = {
  update: 'يظهر مرّة واحدة بعد التحديث',
  about: 'ما تغيّر في هذا الإصدار',
}

/**
 * بطاقة «ما الجديد» (`whats-new / card`، `293:5723`) — بنود الإصدار من `CHANGELOG.md` نفسه.
 *
 * **العلامات زخرفة لا مربّعات اختيار.** الإطار يرسمها بمكوّن `Checkbox` مفعَّلًا، وهي هنا شكلُه
 * بلا دوره: البند خبرٌ لا خيار، ومربّع اختيار حقيقي يُعلَن لقارئ الشاشة عنصرًا يُنقر فلا يفعل شيئًا.
 *
 * و«اقرأ سجلّ التغييرات» يفتح الملفّ في المستودع — **فلا يُعرض إلا مع رابط المستودع**
 * (`SHOW_REPO_LINK`): المستودع خاصّ اليوم، ورابطٌ يعطي زائره 404 لا يُعرض (`AGENTS.md` §7).
 */
export function WhatsNewDialog({ entry, origin, onClose }: WhatsNewDialogProps): JSX.Element {
  const dialog = useRef<HTMLDivElement>(null)
  useFocusTrap(dialog)

  useEffect(() => {
    dialog.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div class={styles.scrim} onClick={onClose}>
      <div
        ref={dialog}
        class={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rasd-whats-new-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div class={styles.head}>
          <div class={styles.titles}>
            <h2 class={`${styles.title} t-arabic-heading-s`} id="rasd-whats-new-title">
              ما الجديد في رصد <bdi dir="ltr">{displayVersion(entry.version)}</bdi>
            </h2>
            <p class={`${styles.subtitle} t-arabic-ui-xs`}>{SUBTITLE[origin]}</p>
          </div>
          <IconButton icon="close" aria-label="أغلق" size="m" onClick={onClose} />
        </div>

        <div class={styles.body}>
          <ul class={styles.card}>
            {entry.items.map((item) => (
              <li key={item} class={styles.item}>
                <span class={styles.tick} aria-hidden="true">
                  <Icon name="check" size="xs" />
                </span>
                <span class={`${styles.text} t-arabic-ui-s`}>{item}</span>
              </li>
            ))}
          </ul>
          <p class={`${styles.note} t-arabic-ui-xs`}>القائمة من سجلّ التغييرات نفسه.</p>
        </div>

        <div class={styles.actions}>
          {SHOW_REPO_LINK ? (
            <Button
              variant="secondary"
              size="l"
              icon="external"
              iconPosition="end"
              onClick={() => void chrome.tabs.create({ url: `${REPO_URL}/blob/main/CHANGELOG.md` })}
            >
              اقرأ سجلّ التغييرات
            </Button>
          ) : null}
          <Button variant="primary" size="l" onClick={onClose} data-autofocus="">
            تمّ
          </Button>
        </div>
      </div>
    </div>
  )
}
