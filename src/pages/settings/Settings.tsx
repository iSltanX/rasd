/**
 * صفحة الإعدادات — الحاوية الجذر (`25 — Settings` و`26 — Privacy`).
 *
 * القشرة المشتركة (`App Sidebar`) في بداية الصفحة، ثمّ الرأس، ثمّ `Section Nav` بأقسامه
 * التسعة والمحتوى بجواره (`Docs/Design.md` §7 القرار 15 — كان شريط تبويبات أفقيًّا بستّة،
 * الصفّان 111 و125). القسم يُقرأ من الرابط (`?section=privacy&view=excluded-sites`) فتفتحه
 * صفحة أخرى مباشرةً، ويُكتب فيه عند التنقّل فيبقى بعد إعادة التحميل.
 *
 * **الحفظ يُعلَن مرّة واحدة هنا** (`persist`): «حُفظ الإعداد» يختفي بعد أربع ثوانٍ، و«تعذّر
 * حفظ الإعداد» يبقى بإعادة محاولة تعيد العملية نفسها (`settings / saved` و`save-error`).
 */
import { useCallback, useEffect, useRef, useState } from 'preact/hooks'

import { SectionNav, type SectionNavEntry } from '@/ui/components/SectionNav/SectionNav'
import { Toast } from '@/ui/components/Toast/Toast'

import { AppShell } from '../shell/AppShell'

import {
  addExcludedSite,
  importExcludedSites,
  removeExcludedSite,
  saveAnnotation,
  saveAppearance,
  saveCapture,
  saveColors,
  savePrivacy,
  saveShortcut,
  watchSettings,
  type Settings as SettingsValue,
} from './context'
import { AboutSection } from './parts/AboutSection'
import { AnnotationTab } from './parts/AnnotationTab'
import { AppearanceTab } from './parts/AppearanceTab'
import { CaptureTab } from './parts/CaptureTab'
import { ColorsTab } from './parts/ColorsTab'
import { DataSection } from './parts/DataSection'
import { IntegrationsSection } from './parts/IntegrationsSection'
import { PrivacyTab, type PrivacyView } from './parts/PrivacyTab'
import { ShortcutsTab } from './parts/ShortcutsTab'
import styles from './Settings.module.css'

import type { Persist } from './persist'
import type { Result } from '@/shared/result'

type SectionId =
  | 'capture'
  | 'annotation'
  | 'colors'
  | 'appearance'
  | 'shortcuts'
  | 'privacy'
  | 'data'
  | 'integrations'
  | 'about'

/** الأقسام التسعة بأيقوناتها كما في `Section Nav` (`280:740`). */
const SECTIONS: readonly (SectionNavEntry & { id: SectionId })[] = [
  { id: 'capture', label: 'التصوير', icon: 'capture-area' },
  { id: 'annotation', label: 'التعليقات', icon: 'pen' },
  { id: 'colors', label: 'الألوان', icon: 'eyedropper' },
  { id: 'appearance', label: 'المظهر', icon: 'swatches' },
  { id: 'shortcuts', label: 'الاختصارات', icon: 'keyboard' },
  { id: 'privacy', label: 'الخصوصية', icon: 'shield' },
  { id: 'data', label: 'البيانات', icon: 'folder' },
  { id: 'integrations', label: 'التكاملات', icon: 'plug' },
  { id: 'about', label: 'عن رصد', icon: 'info' },
]

const DEFAULT_HEADER = { title: 'الإعدادات', subtitle: 'كل تفضيل محفوظ على هذا الجهاز وحده.' }

/** رأس الصفحة لكل قسم وصفحة فرعية — نصوص رؤوس الإطارات. */
function headerFor(section: SectionId, view: PrivacyView) {
  if (section !== 'privacy') return DEFAULT_HEADER
  if (view === 'excluded-sites')
    return {
      title: 'المواقع المستثناة',
      subtitle: 'رصد لا يُحقَن في هذه المواقع ولا يلتقط منها. القائمة محفوظة على هذا الجهاز.',
    }
  if (view === 'permissions')
    return {
      title: 'صلاحيات المتصفّح',
      subtitle: 'رصد يطلب أقلّ ما يلزمه. كل صلاحية اختيارية تُمنح حين تحتاجها وتُسحب متى شئت.',
    }
  return {
    title: 'الخصوصية',
    subtitle: 'رصد يعمل على الصفحة حين تطلبه أنت، ويحفظ ما يلتقطه على هذا الجهاز.',
  }
}

function readLocation(): { section: SectionId; view: PrivacyView } {
  const params = new URLSearchParams(location.search)
  const section = SECTIONS.find((s) => s.id === params.get('section'))?.id ?? 'capture'
  const view = params.get('view')
  return {
    section,
    view: view === 'excluded-sites' || view === 'permissions' ? view : 'controls',
  }
}

type Notice =
  | { tone: 'success'; title?: string; detail?: string }
  | { tone: 'danger'; retry: () => Promise<Result<SettingsValue>> }
  | null

/**
 * الإشعار بسطرين كما في `settings / saved` و`save-error` (`319:12812` · `319:12777`): ما حدث، ثمّ
 * أثره أخفّ تحته. كان سطرًا عريضًا واحدًا يجمعهما بشرطة، و`Toast` يحمل السطر الثاني أصلًا.
 */
export function SettingsNotice({
  notice,
  onRetry,
  onDismiss,
}: {
  notice: Exclude<Notice, null>
  onRetry: () => void
  onDismiss: () => void
}) {
  return notice.tone === 'success' ? (
    <Toast
      tone="success"
      detail={notice.detail ?? 'يسري على كل صفحات رصد المفتوحة.'}
      onDismiss={onDismiss}
    >
      {notice.title ?? 'حُفظ الإعداد'}
    </Toast>
  ) : (
    <Toast
      tone="danger"
      action="with-action"
      actionLabel="أعد المحاولة"
      detail="لم يتغيّر شيء، والقيمة السابقة باقية."
      onAction={onRetry}
      onDismiss={onDismiss}
    >
      تعذّر حفظ الإعداد
    </Toast>
  )
}

export function Settings() {
  const [settings, setSettings] = useState<SettingsValue | null>(null)
  const [{ section, view }, setPlace] = useState(readLocation)
  const [notice, setNotice] = useState<Notice>(null)
  /** يزيد حين تتغيّر المكتبة من هنا (استعادة أو حذف كامل) — فيُعاد عدّ الشريط الجانبي. */
  const [revision, setRevision] = useState(0)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => watchSettings(setSettings), [])

  const go = (next: SectionId, nextView: PrivacyView = 'controls') => {
    setPlace({ section: next, view: nextView })
    const params = new URLSearchParams({ section: next })
    if (next === 'privacy' && nextView !== 'controls') params.set('view', nextView)
    history.replaceState(null, '', `?${params.toString()}`)
  }

  /** نجاحٌ بنصّ يخصّه — إضافة موقع مستثنى وحذفه — بمهلة الإشعار العامّ نفسها. */
  const announce = useCallback((title: string, detail: string) => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    setNotice({ tone: 'success', title, detail })
    hideTimer.current = setTimeout(() => setNotice(null), 4000)
  }, [])

  const persist = useCallback<Persist>((op) => {
    void op().then((result) => {
      if (hideTimer.current) clearTimeout(hideTimer.current)
      if (result.ok) {
        setNotice({ tone: 'success' })
        hideTimer.current = setTimeout(() => setNotice(null), 4000)
      } else {
        setNotice({ tone: 'danger', retry: op })
      }
    })
  }, [])

  if (!settings) return null

  const header = headerFor(section, view)
  const onSub = section === 'privacy' && view !== 'controls'

  let content
  switch (section) {
    case 'capture':
      content = <CaptureTab settings={settings} onSave={saveCapture} persist={persist} />
      break
    case 'annotation':
      content = <AnnotationTab settings={settings} onSave={saveAnnotation} persist={persist} />
      break
    case 'colors':
      content = <ColorsTab settings={settings} onSave={saveColors} persist={persist} />
      break
    case 'appearance':
      content = <AppearanceTab settings={settings} onSave={saveAppearance} persist={persist} />
      break
    case 'shortcuts':
      content = <ShortcutsTab settings={settings} onSave={saveShortcut} persist={persist} />
      break
    case 'privacy':
      content = (
        <PrivacyTab
          settings={settings}
          view={view}
          onView={(v) => go('privacy', v)}
          onSave={savePrivacy}
          onAddSite={addExcludedSite}
          onRemoveSite={removeExcludedSite}
          onImportSites={importExcludedSites}
          persist={persist}
          onAnnounce={announce}
        />
      )
      break
    case 'data':
      content = (
        <DataSection
          settings={settings}
          onAnnounce={announce}
          onLibraryChanged={() => setRevision((n) => n + 1)}
        />
      )
      break
    case 'integrations':
      content = <IntegrationsSection onOpenPrivacy={() => go('privacy')} />
      break
    case 'about':
      content = <AboutSection version={chrome.runtime.getManifest().version} />
      break
  }

  return (
    <AppShell activeId="settings" revision={revision}>
      <header class={styles.header}>
        {onSub ? (
          <button type="button" class={styles.back} onClick={() => go('privacy')}>
            الخصوصية
          </button>
        ) : null}
        <h1 class={`${styles.title} t-arabic-heading-l`}>{header.title}</h1>
        <p class={`${styles.subtitle} t-arabic-ui-s`}>{header.subtitle}</p>
      </header>
      <div class={styles.body}>
        <SectionNav
          entries={SECTIONS}
          activeId={section}
          onSelect={(id) => go(id as SectionId)}
          aria-label="أقسام الإعدادات"
        />
        <main class={styles.pane}>{content}</main>
      </div>
      {notice ? (
        <div class={styles.toastRegion}>
          <SettingsNotice
            notice={notice}
            onRetry={() => {
              if (notice.tone === 'danger') persist(notice.retry)
            }}
            onDismiss={() => setNotice(null)}
          />
        </div>
      ) : null}
    </AppShell>
  )
}
