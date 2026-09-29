/**
 * صفحة الإعدادات — الحاوية الجذر.
 *
 * ستّة تبويبات: المظهر (20.1)، وأربعة `§12` (التصوير · التعليقات · الألوان ·
 * الاختصارات، الوحدة 20.2)، والخصوصية والصلاحيات (`§11`، الوحدة 20.3).
 * التوجيه لم يُعَد بناؤه في أيٍّ منها — أُضيفت إلى `TAB_ITEMS`/`TAB_VALUES`
 * وحدهما، كما توقّع ملفّ المرحلة 20 السابق (تاريخ Git) §8` تمامًا.
 *
 * **الجذر يُطبَّق عليه المظهر مرّتين لا مرّة**: هذا المكوّن يعيش داخل صفحة
 * امتداد عادية، فتطبيق `applyTheme` هنا (عبر `watchSettings` في `main.tsx`)
 * كافٍ وحده — لا حاجة لتكراره هنا، خلافًا لطبقة العرض فوق الصفحة التي
 * تحتاج جذرًا صريحًا (`hostEl`) لأنها ليست `document.documentElement`.
 */
import { useEffect, useMemo, useState } from 'preact/hooks'

import { Tabs, type TabItem } from '@/ui/components/Tabs/Tabs'

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
  type Settings,
} from './context'
import { AnnotationTab } from './parts/AnnotationTab'
import { AppearanceTab } from './parts/AppearanceTab'
import { CaptureTab } from './parts/CaptureTab'
import { ColorsTab } from './parts/ColorsTab'
import { PrivacyTab } from './parts/PrivacyTab'
import { ShortcutsTab } from './parts/ShortcutsTab'
import styles from './Settings.module.css'

type SettingsTab = 'capture' | 'annotation' | 'colors' | 'appearance' | 'shortcuts' | 'privacy'

const TAB_ITEMS: readonly TabItem[] = [
  { value: 'capture', label: 'التصوير' },
  { value: 'annotation', label: 'التعليقات' },
  { value: 'colors', label: 'الألوان' },
  { value: 'appearance', label: 'المظهر' },
  { value: 'shortcuts', label: 'الاختصارات' },
  { value: 'privacy', label: 'الخصوصية' },
]
const TAB_VALUES: readonly SettingsTab[] = [
  'capture',
  'annotation',
  'colors',
  'appearance',
  'shortcuts',
  'privacy',
]

export function Settings() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [activeTab, setActiveTab] = useState<SettingsTab>('capture')

  useEffect(() => watchSettings(setSettings), [])

  const tabIndex = useMemo(() => Math.max(0, TAB_VALUES.indexOf(activeTab)), [activeTab])
  const switchTab = (index: number) => setActiveTab(TAB_VALUES[index] ?? 'capture')

  if (!settings) return null

  return (
    <div class={styles.page}>
      <h1 class={styles.title}>الإعدادات</h1>
      <Tabs items={TAB_ITEMS} selected={tabIndex} onChange={switchTab} />
      {activeTab === 'capture' ? <CaptureTab settings={settings} onSave={saveCapture} /> : null}
      {activeTab === 'annotation' ? (
        <AnnotationTab settings={settings} onSave={saveAnnotation} />
      ) : null}
      {activeTab === 'colors' ? <ColorsTab settings={settings} onSave={saveColors} /> : null}
      {activeTab === 'appearance' ? (
        <AppearanceTab settings={settings} onSave={saveAppearance} />
      ) : null}
      {activeTab === 'shortcuts' ? (
        <ShortcutsTab settings={settings} onSave={saveShortcut} />
      ) : null}
      {activeTab === 'privacy' ? (
        <PrivacyTab
          settings={settings}
          onSave={savePrivacy}
          onAddSite={addExcludedSite}
          onRemoveSite={removeExcludedSite}
          onImportSites={importExcludedSites}
        />
      ) : null}
    </div>
  )
}
