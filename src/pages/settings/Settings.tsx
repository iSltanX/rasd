/**
 * صفحة الإعدادات — الحاوية الجذر.
 *
 * تبويبٌ واحد اليوم («المظهر»). الهيكل جاهز لاستقبال الأربعة الباقية
 * (`§12`: التصوير · التعليقات · الألوان · الاختصارات) في الوحدة 20.2 —
 * تُضاف إلى `TAB_ITEMS`/`TAB_VALUES` وحدهما، بلا إعادة بناء التوجيه.
 *
 * **الجذر يُطبَّق عليه المظهر مرّتين لا مرّة**: هذا المكوّن يعيش داخل صفحة
 * امتداد عادية، فتطبيق `applyTheme` هنا (عبر `watchSettings` في `main.tsx`)
 * كافٍ وحده — لا حاجة لتكراره هنا، خلافًا لطبقة العرض فوق الصفحة التي
 * تحتاج جذرًا صريحًا (`hostEl`) لأنها ليست `document.documentElement`.
 */
import { useEffect, useMemo, useState } from 'preact/hooks'

import { Tabs, type TabItem } from '@/ui/components/Tabs/Tabs'

import { saveAppearance, watchSettings, type Settings } from './context'
import { AppearanceTab } from './parts/AppearanceTab'
import styles from './Settings.module.css'

type SettingsTab = 'appearance'

const TAB_ITEMS: readonly TabItem[] = [{ value: 'appearance', label: 'المظهر' }]
const TAB_VALUES: readonly SettingsTab[] = ['appearance']

export function Settings() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [activeTab, setActiveTab] = useState<SettingsTab>('appearance')

  useEffect(() => watchSettings(setSettings), [])

  const tabIndex = useMemo(() => Math.max(0, TAB_VALUES.indexOf(activeTab)), [activeTab])
  const switchTab = (index: number) => setActiveTab(TAB_VALUES[index] ?? 'appearance')

  if (!settings) return null

  return (
    <div class={styles.page}>
      <h1 class={styles.title}>الإعدادات</h1>
      <Tabs items={TAB_ITEMS} selected={tabIndex} onChange={switchTab} />
      {activeTab === 'appearance' ? (
        <AppearanceTab settings={settings} onSave={saveAppearance} />
      ) : null}
    </div>
  )
}
