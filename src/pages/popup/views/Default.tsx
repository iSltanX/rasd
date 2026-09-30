import { isMacPlatform } from '@/shared/platform'

import { CaptureCard } from '../parts/CaptureCard'
import { InspectTool } from '../parts/InspectTool'
import { PageIssuesCard } from '../parts/PageIssuesCard'
import { RecentThumb } from '../parts/RecentThumb'
import styles from '../Popup.module.css'

import type { PageIssueCounts, RecentEntry } from '../context'
import type { ToolName } from '@/shared/messaging'
import type { JSX } from 'preact'

export interface DefaultProps {
  onTool: (tool: ToolName) => void
  recent: readonly RecentEntry[]
  onOpenRecent: (id: string) => void
  onOpenLibrary: () => void
  /**
   * مشكلات صفحة التبويب — `null` أو غيابها ⇐ لا قسم لها وتبقى «الأخيرة». وإن وُجدت ظهر «مشكلات هذه
   * الصفحة» **بدل** «الأخيرة» لا معها: النافذة 520 لا تتّسع لهما.
   */
  pageIssues?: PageIssueCounts | null
  onShowIssues?: () => void
  onRecheckIssues?: () => void
}

/**
 * الحالة الافتراضية — ثلاث مجموعات، بترتيب `13 — Extension Popup` نفسه:
 * الالتقاط (شبكة 2×2)، الفحص (صفّ 4)، الأخيرة (بطاقتان أو سطر فراغ `popup / no-recent`) — أو
 * «مشكلات هذه الصفحة» مكانها حين للصفحة مشكلات (`popup / page-issues`).
 *
 * **ترتيب DOM هو ترتيب القراءة من اليمين**، أي عكس ترتيب أبناء الإطار: Figma يرتّب
 * أبناء الصفّ الأفقي من اليسار. فالشبكة `منطقة · عنصر` ثم `الظاهر · صفحة كاملة`، والصفّ
 * `فحص · قياس · ألوان · مقارنة`. وTab يتبع هذا الترتيب بلا `tabIndex` مُدار.
 */
export function Default({
  onTool,
  recent,
  onOpenRecent,
  onOpenLibrary,
  pageIssues = null,
  onShowIssues,
  onRecheckIssues,
}: DefaultProps): JSX.Element {
  // مشكلاتٌ للصفحة **وفعلاها** معًا، وإلا عُرضت «الأخيرة»: قسمٌ يعِد بـ«أعد الفحص» بلا محرّك زرٌّ صامت.
  const showIssues =
    pageIssues !== null && onShowIssues !== undefined && onRecheckIssues !== undefined
  return (
    <>
      <section class={styles.group} aria-label="الالتقاط">
        <div class={styles.groupHead}>
          <span class={styles.groupLabel}>الالتقاط</span>
          {/*
           * ⇧⌘ لا ⌥⌘: ⌥⌘F المصمَّمة قديمًا رفضها مدقّق Chrome («Invalid value for
           * commands[..].mac») — انظر التعليق أعلى `commands` في `manifest.config.ts`.
           */}
          <span class={styles.groupShortcut}>⇧⌘</span>
        </div>
        <div class={styles.captureGrid}>
          {/*
           * ⇧⌘T لا ⇧⌘F على ماك: Chrome يحجز F صامتًا لهذه التركيبة — اكتُشف عبر
           * `scripts/verify-popup.mjs`. وعلى لينكس/ويندوز `T` محجوزة هي الأخرى («إعادة
           * فتح التبويب المغلق»، `Docs/Engineering.md §6` صفّ 99)، فالحرف يتبع المنصّة.
           */}
          <CaptureCard
            shortcutKey={isMacPlatform() ? 'T' : 'Q'}
            icon="capture-area"
            title="منطقة"
            hint="اسحب للقص"
            onClick={() => onTool('area')}
          />
          <CaptureCard
            shortcutKey="E"
            icon="capture-element"
            title="عنصر"
            hint="اختر عنصر DOM"
            onClick={() => onTool('element')}
          />
          <CaptureCard
            shortcutKey="V"
            icon="capture-viewport"
            title="الظاهر"
            hint="العرض الحالي"
            onClick={() => onTool('viewport')}
          />
          <CaptureCard
            shortcutKey="S"
            icon="capture-full"
            title="صفحة كاملة"
            hint="تمرير تلقائي"
            onClick={() => onTool('full-page')}
          />
        </div>
      </section>

      <section class={styles.group} aria-label="الفحص">
        <div class={styles.groupHead}>
          <span class={styles.groupLabel}>الفحص</span>
          <span class={styles.groupShortcut}>⌥⇧</span>
        </div>
        <div class={styles.inspectRow}>
          <InspectTool
            icon="inspect"
            label="فحص"
            tone="inspect"
            onClick={() => onTool('inspect')}
          />
          <InspectTool
            icon="dimension-h"
            label="قياس"
            tone="measure"
            onClick={() => onTool('measure')}
          />
          <InspectTool
            icon="eyedropper"
            label="ألوان"
            tone="colors"
            onClick={() => onTool('colour')}
          />
          <InspectTool
            icon="split-view"
            label="مقارنة"
            tone="compare"
            onClick={() => onTool('compare')}
          />
        </div>
      </section>

      {showIssues ? (
        <section class={styles.group} aria-label="مشكلات هذه الصفحة">
          <div class={styles.groupHead}>
            <span class={styles.groupLabel}>مشكلات هذه الصفحة</span>
            <button type="button" class={styles.groupLink} onClick={onShowIssues}>
              اعرضها
            </button>
          </div>
          <PageIssuesCard counts={pageIssues} onRecheck={onRecheckIssues} />
        </section>
      ) : (
        <section class={styles.group} aria-label="الأخيرة">
          <div class={styles.groupHead}>
            <span class={styles.groupLabel}>الأخيرة</span>
            {/* لا «عرض الكل» بلا لقطات — `popup / no-recent` (`319:56341`) لا يعرضه: لا كلّ يُعرض. */}
            {recent.length > 0 ? (
              <button type="button" class={styles.groupLink} onClick={onOpenLibrary}>
                عرض الكل
              </button>
            ) : null}
          </div>
          {recent.length > 0 ? (
            <div class={styles.recentRow}>
              {recent.map(({ record, thumbUrl, withheld }) => (
                <RecentThumb
                  key={record.id}
                  title={record.title || record.origin}
                  createdAt={record.createdAt}
                  thumbUrl={thumbUrl}
                  withheld={withheld}
                  onClick={() => onOpenRecent(record.id)}
                />
              ))}
            </div>
          ) : (
            <p class={styles.groupEmpty}>لا لقطات بعد. التقط أوّل لقطة لتظهر هنا.</p>
          )}
        </section>
      )}
    </>
  )
}
