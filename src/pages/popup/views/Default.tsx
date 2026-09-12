import { isMacPlatform } from '@/shared/platform'

import { CaptureCard } from '../parts/CaptureCard'
import { InspectTool } from '../parts/InspectTool'
import { RecentThumb } from '../parts/RecentThumb'
import styles from '../Popup.module.css'

import type { RecentEntry } from '../context'
import type { ToolName } from '@/shared/messaging'
import type { JSX } from 'preact'

export interface DefaultProps {
  onTool: (tool: ToolName) => void
  recent: readonly RecentEntry[]
  onOpenRecent: (id: string) => void
  onOpenLibrary: () => void
}

/**
 * الحالة الافتراضية — ثلاث مجموعات، بترتيب `13 — Extension Popup` نفسه:
 * الالتقاط (شبكة 2×2)، الفحص (صفّ 4)، الأخيرة (بطاقتان).
 *
 * ترتيب البطاقات في DOM هو **ترتيب القراءة في RTL نفسه** يمينًا فيسارًا —
 * تمامًا كما التقطته صفحة Figma: `عنصر · منطقة` أعلى، `صفحة كاملة · الظاهر`
 * أسفل. Tab يتبع هذا الترتيب بلا حاجة لأي `tabIndex` مُدار يدويًا.
 */
export function Default({
  onTool,
  recent,
  onOpenRecent,
  onOpenLibrary,
}: DefaultProps): JSX.Element {
  return (
    <>
      <section class={styles.group} aria-label="الالتقاط">
        <div class={styles.groupHead}>
          {/*
           * ⇧⌘ لا ⌥⌘: ⌥⌘F المصمَّمة في Figma رفضها مدقّق Chrome («Invalid
           * value for commands[..].mac») واستُبدلت في المرحلة 3 — انظر
           * التعليق أعلى `commands` في `manifest.config.ts`. البادجة هنا
           * تعرض الاختصار الحقيقي المسجَّل، لا رسم Figma الأصلي المرفوض.
           */}
          <span class={styles.groupShortcut}>⇧⌘</span>
          <span class={styles.groupLabel}>الالتقاط</span>
        </div>
        <div class={styles.captureGrid}>
          <CaptureCard
            shortcutKey="E"
            icon="capture-element"
            title="عنصر"
            hint="اختر عنصر DOM"
            onClick={() => onTool('element')}
          />
          {/*
           * ⇧⌘T لا ⇧⌘F على ماك: Chrome يحجز F صامتًا لهذه التركيبة — اكتُشف
           * تجريبيًا عبر `scripts/verify-popup.mjs`. وعلى لينكس/ويندوز `T`
           * محجوزة هي الأخرى («إعادة فتح التبويب المغلق») — قِيس على عدّاء
           * Linux حقيقي في الوحدة 20.2 (`Rasd_Plan.md §6` صفّ 99)، فالحرف هنا
           * يتبع المنصّة الفعلية لا حرفًا واحدًا مفترَضًا للجميع. انظر تعليق
           * `commands` في `manifest.config.ts` لقائمة الحروف المحجوزة كاملةً.
           */}
          <CaptureCard
            shortcutKey={isMacPlatform() ? 'T' : 'Q'}
            icon="capture-area"
            title="منطقة"
            hint="اسحب للقص"
            onClick={() => onTool('area')}
          />
          <CaptureCard
            shortcutKey="S"
            icon="capture-full"
            title="صفحة كاملة"
            hint="تمرير تلقائي"
            onClick={() => onTool('full-page')}
          />
          <CaptureCard
            shortcutKey="V"
            icon="capture-viewport"
            title="الظاهر"
            hint="العرض الحالي"
            onClick={() => onTool('viewport')}
          />
        </div>
      </section>

      <section class={styles.group} aria-label="الفحص">
        <div class={styles.groupHead}>
          <span class={styles.groupShortcut}>⌥⇧</span>
          <span class={styles.groupLabel}>الفحص</span>
        </div>
        {/*
         * الترتيب هنا هو ترتيب DOM **الفعلي** في `13 — Extension Popup`:
         * مقارنة أوّلًا (أقصى اليمين في RTL) ثم ألوان فقياس ففحص. نصّ الخطة
         * يصف الترتيب معكوسًا («فحص، قياس، ألوان، مقارنة») — الملفّ يحسم؛
         * انظر التناقض المُسجَّل في `Rasd_Plan.md §6`.
         */}
        <div class={styles.inspectRow}>
          <InspectTool
            icon="split-view"
            label="مقارنة"
            tone="compare"
            onClick={() => onTool('compare')}
          />
          <InspectTool
            icon="eyedropper"
            label="ألوان"
            tone="colors"
            onClick={() => onTool('colour')}
          />
          <InspectTool
            icon="dimension-h"
            label="قياس"
            tone="measure"
            onClick={() => onTool('measure')}
          />
          <InspectTool
            icon="inspect"
            label="فحص"
            tone="inspect"
            onClick={() => onTool('inspect')}
          />
        </div>
      </section>

      {recent.length > 0 ? (
        <section class={styles.group} aria-label="الأخيرة">
          <div class={styles.groupHead}>
            <button type="button" class={styles.groupLink} onClick={onOpenLibrary}>
              عرض الكل
            </button>
            <span class={styles.groupLabel}>الأخيرة</span>
          </div>
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
        </section>
      ) : null}
    </>
  )
}
