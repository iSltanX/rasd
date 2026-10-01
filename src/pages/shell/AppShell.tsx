import { useCallback, useEffect, useState } from 'preact/hooks'

import { requestPersistence } from '@/shared/storage/persistence'
import { quotaState } from '@/shared/storage/quota'
import { AppSidebar, type SidebarGroup } from '@/ui/components/AppSidebar/AppSidebar'

import styles from './AppShell.module.css'
import { hrefFor, SETTINGS_HREF, type LibraryView } from './library-views'
import { ShortcutsSheet } from './ShortcutsSheet'
import { loadSidebarData, type SidebarData } from './sidebar-data'
import { claimPendingWhatsNew, type ChangelogEntry } from './whats-new'
import { WhatsNewDialog } from './WhatsNewDialog'

import type { ComponentChildren, JSX } from 'preact'

export interface AppShellProps {
  /** معرّف العنصر الحالي في الشريط: عرض مكتبة (`viewId`) أو `settings`. */
  activeId: string
  /**
   * المكتبة تبدّل عرضها في مكانها بلا تنقّل، فتمرّر هذا. غيابه يعني أن العناصر روابط
   * تفتح المكتبة على عرضها — كما في الإعدادات.
   */
  onNavigate?: ((view: LibraryView) => void) | undefined
  /** يتغيّر حين تتغيّر البيانات فيُعاد عدّ الشريط (حذف، نقل، إنشاء مشروع). */
  revision?: number
  /** «مشروع جديد» — في المكتبة وحدها، حيث محرّر المشاريع. */
  onNewProject?: (() => void) | undefined
  children: ComponentChildren
}

/** هل الحدث داخل حقل كتابة؟ فلا يُفتح شيء بحرف يكتبه المستخدم. */
function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))
}

/**
 * قشرة صفحات الإضافة: `App Sidebar` في بداية الصفحة والمحتوى بعده، وورقة الاختصارات
 * بـ`?` من أي مكان فيها. **وعنصر واحد ليس في الإطار:** «الألوان» في «المجموعات» — نوع
 * سجلّات قائم لا مدخل له في شريط الإطار. «لقطة جديدة» تفتح الورقة نفسها: صفحة الإضافة لا
 * تلتقط صفحة أخرى — `activeTab` يُمنح بإيماءة على الصفحة المراد التقاطها — فالزرّ يدلّ على
 * الطريق.
 *
 * **وبطاقة «ما الجديد» بعد الترقية** تظهر هنا مرّة واحدة، في أوّل صفحة إضافة يفتحها المستخدم بعدها
 * (المكتبة أو الإعدادات) — لا تبويبٌ يُفتح عليه من تلقاء نفسه وهو في عمله.
 */
export function AppShell({
  activeId,
  onNavigate,
  revision = 0,
  onNewProject,
  children,
}: AppShellProps): JSX.Element {
  const [data, setData] = useState<SidebarData | null>(null)
  const [storage, setStorage] = useState<SidebarData['storage'] | null>(null)
  const [sheet, setSheet] = useState(false)
  const closeSheet = useCallback(() => setSheet(false), [])
  const [whatsNew, setWhatsNew] = useState<ChangelogEntry | null>(null)
  const closeWhatsNew = useCallback(() => setWhatsNew(null), [])

  useEffect(() => {
    let cancelled = false
    void claimPendingWhatsNew().then((entry) => {
      if (!cancelled && entry) setWhatsNew(entry)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void loadSidebarData().then(async (result) => {
      if (!cancelled && result.ok) setData(result.value)
      /*
       * المكتبة المقفلة (ADR 0043) لا تُعدّ، لكنّ المساحة ليست منها: «تعذّر قياس المساحة» تحت قفلٍ مقصود كان
       * سيقول عطلًا لم يقع. فتُقاس وحدها.
       */
      if (!result.ok && result.error.code === 'library-locked') {
        const quota = await quotaState()
        if (!cancelled && quota.quotaBytes > 0) {
          setStorage({ usage: quota.usageBytes, quota: quota.quotaBytes })
        }
      }
      // مكتبةٌ غير فارغة حُفظ فيها شيء: يُطلب التخزين الدائم إن لم يُمنح (`persistence.ts`).
      if (result.ok && result.value.all > 0) void requestPersistence()
    })
    return () => {
      cancelled = true
    }
  }, [revision])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '?' || typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return
      e.preventDefault()
      setSheet(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const entry = (
    view: LibraryView,
    id: string,
    icon: SidebarGroup['entries'][number]['icon'],
    label: string,
    count?: number,
  ) => ({
    id,
    icon,
    label,
    count,
    href: hrefFor(view),
    ...(onNavigate
      ? {
          onClick: () => onNavigate(view),
        }
      : {}),
  })

  const groups: SidebarGroup[] = [
    {
      entries: [
        entry({ kind: 'all' }, 'all', 'grid-view', 'كل اللقطات', data?.all),
        entry({ kind: 'favorites' }, 'favorites', 'star', 'المميّزة', data?.favorites),
        entry({ kind: 'recent' }, 'recent', 'history', 'الأخيرة', data?.recent),
      ],
    },
    {
      title: 'المشاريع',
      entries: [
        // نظرة المشاريع العامّة (`72:2`) — لا مدخل لها في شريط الإطار، والعنوان نصٌّ لا رابط.
        entry({ kind: 'projects' }, 'projects', 'folder', 'كل المشاريع', data?.projects.length),
        ...(data?.projects ?? []).map((p) =>
          entry({ kind: 'project', id: p.id }, `project:${p.id}`, 'project', p.name, p.count),
        ),
        ...(onNewProject
          ? [
              {
                id: 'new-project',
                icon: 'plus' as const,
                label: 'مشروع جديد',
                onClick: onNewProject,
              },
            ]
          : []),
      ],
    },
    {
      title: 'المجموعات',
      entries: [
        entry({ kind: 'palettes' }, 'palettes', 'swatches', 'اللوحات', data?.palettes),
        entry({ kind: 'colors' }, 'colors', 'eyedropper', 'الألوان', data?.colors),
        entry({ kind: 'references' }, 'references', 'image', 'المراجع', data?.references),
        entry({ kind: 'guides' }, 'guides', 'file-code', 'أدلة الخطوات', data?.guides),
        // آخر «المجموعات» كما في شريط الإطار — مدخل مكتبة المشكلات بعدّاده.
        entry({ kind: 'issues' }, 'issues', 'alert', 'المشكلات', data?.issues),
      ],
    },
  ].filter((g) => g.entries.length > 0)

  return (
    <div class={styles.shell}>
      <AppSidebar
        groups={groups}
        activeId={activeId}
        homeHref={hrefFor({ kind: 'all' })}
        primaryAction={{ label: 'لقطة جديدة', icon: 'capture-area', onClick: () => setSheet(true) }}
        storage={data?.storage ?? storage ?? { usage: null, quota: null }}
        settings={{ id: 'settings', icon: 'settings', label: 'الإعدادات', href: SETTINGS_HREF }}
      />
      <div class={styles.main}>{children}</div>
      {sheet ? <ShortcutsSheet onClose={closeSheet} /> : null}
      {whatsNew ? (
        <WhatsNewDialog entry={whatsNew} origin="update" onClose={closeWhatsNew} />
      ) : null}
    </div>
  )
}
