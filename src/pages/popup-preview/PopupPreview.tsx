/**
 * جولة بصرية بلا `chrome.*` — أداة تطوير داخلية (مثل `gallery/`)، مستبعَدة
 * عمدًا من بناء الإنتاج. تعرض الحالات الاثنتي عشرة جنبًا إلى جنب لمقارنتها بصريًا
 * بإطارات `13 — Extension Popup` في Figma، ولالتقاط لقطة a11y-tree عبر
 * متصفح Claude — كلاهما مطلوب صراحةً في معايير اختبار المرحلة 7.
 *
 * كل حالة تُغذَّى ببيانات ثابتة تمثيلية بدل `chrome.tabs.query`/الرسائل
 * الحقيقية — منطق الاختيار نفسه (`selectPopupState`) وتحميل البيانات
 * (`loadPopupContext`) مختبَران بمعزل في `tests/unit/popup-state.test.ts`
 * و`tests/integration/popup-context.test.ts`؛ هذه الصفحة تختبر العرض
 * البصري وحده.
 */

import { Footer } from '../popup/parts/Footer'
import { Header } from '../popup/parts/Header'
import styles from '../popup/Popup.module.css'
import { Cancelled } from '../popup/views/Cancelled'
import { CaptureError } from '../popup/views/CaptureError'
import { Capturing } from '../popup/views/Capturing'
import { Default } from '../popup/views/Default'
import { FirstRun } from '../popup/views/FirstRun'
import { LiveMode } from '../popup/views/LiveMode'
import { Offline } from '../popup/views/Offline'
import { Permission } from '../popup/views/Permission'
import { Restricted } from '../popup/views/Restricted'
import { Success } from '../popup/views/Success'

import type { RecentEntry } from '../popup/context'
import type { SuccessAction } from '../popup/views/Success'
import type { CaptureRecord } from '@/shared/storage/schema'
import type { JSX } from 'preact'

const noop = () => undefined

const RECENT: RecentEntry[] = [
  {
    record: {
      id: 'r1',
      createdAt: Date.now() - 60_000,
      origin: 'https://figma.com',
      url: 'https://figma.com/file/abc',
      title: 'لوحة رصد — Figma',
      kind: 'full-page',
      status: 'ready',
      projectId: null,
      tags: [],
      width: 1440,
      height: 3820,
      devicePixelRatio: 2,
      favorite: false,
      archived: false,
      trashedAt: null,
    } satisfies CaptureRecord,
    thumbUrl: null,
    withheld: false,
  },
  {
    record: {
      id: 'r2',
      createdAt: Date.now() - 3_600_000,
      origin: 'https://example.com',
      url: 'https://example.com/pricing',
      title: 'صفحة الأسعار',
      kind: 'element',
      status: 'ready',
      projectId: null,
      tags: [],
      width: 640,
      height: 420,
      devicePixelRatio: 2,
      favorite: false,
      archived: false,
      trashedAt: null,
    } satisfies CaptureRecord,
    thumbUrl: null,
    withheld: false,
  },
]

const SUCCESS_ACTIONS: SuccessAction[] = [
  { icon: 'pen', label: 'تعليق', onClick: noop },
  { icon: 'split-view', label: 'مقارنة', onClick: noop },
  { icon: 'copy', label: 'نسخ', onClick: noop },
  { icon: 'share', label: 'مشاركة', onClick: noop },
]

interface FrameProps {
  name: string
  state: string
  status: string
  children: JSX.Element
}

function Frame({ name, state, status, children }: FrameProps): JSX.Element {
  return (
    <div class="frame">
      <span class="label">
        popup/{name} — {state}
      </span>
      <div class="rasd-page" data-popup-state={state}>
        <div class={styles.shell}>
          <Header status={status} onSettings={noop} />
          <div class={styles.body}>{children}</div>
          <Footer version="1.0" onOpenLibrary={noop} />
        </div>
      </div>
    </div>
  )
}

/**
 * `popup/default · light` ليست إطارًا مستقلًّا هنا: توكنز السمة مُنطاقة إلى
 * `:root[data-theme]` وحده (انظر `main.tsx`)، فمعاينتها تتطلّب تحميل هذه
 * الصفحة نفسها بـ`?theme=light` بدل خلط سمتين في تحميل واحد.
 */
export function PopupPreview(): JSX.Element {
  return (
    <>
      <Frame name="default" state="default" status="figma.com / design-systems">
        <Default onTool={noop} recent={RECENT} onOpenRecent={noop} onOpenLibrary={noop} />
      </Frame>

      <Frame name="no-recent" state="default" status="figma.com / design-systems">
        <Default onTool={noop} recent={[]} onOpenRecent={noop} onOpenLibrary={noop} />
      </Frame>

      <Frame name="capturing" state="capturing" status="تجميع المقطع ٤ من ٦">
        <Capturing done={4} total={6} onCancel={noop} />
      </Frame>

      <Frame name="inspect-active" state="inspect-active" status="مرّر فوق أي عنصر لفحصه">
        <LiveMode
          tone="inspect"
          title="وضع الفحص مُفعّل"
          hint="مرّر فوق أي عنصر في الصفحة لفحصه. تفاصيله في لوح الفحص داخل الصفحة."
          exitLabel="إنهاء الفحص"
          onExit={noop}
        />
      </Frame>

      <Frame name="colors" state="colors" status="مرّر فوق أي نقطة والتقط لونها">
        <LiveMode
          tone="colors"
          title="وضع اختيار اللون مُفعّل"
          hint="مرّر فوق أي نقطة في الصفحة والتقط لونها. قيمه وصيغه في لوح الألوان داخل الصفحة."
          exitLabel="إنهاء الاختيار"
          onExit={noop}
        />
      </Frame>

      <Frame name="success" state="success" status="محفوظة محليًا · 1440 × 3820">
        <Success thumbUrl={null} actions={SUCCESS_ACTIONS} onOpenLibrary={noop} />
      </Frame>

      <Frame name="error" state="error" status="تعذّر الالتقاط">
        <CaptureError
          title="لم تُحفظ اللقطة"
          message="توقّفت الصفحة عن الاستجابة قبل اكتمال الالتقاط. أعد المحاولة."
          onRetry={noop}
        />
      </Frame>

      <Frame name="cancelled" state="cancelled" status="أُلغي الالتقاط">
        <Cancelled onRestart={noop} onClose={noop} />
      </Frame>

      <Frame name="first-run" state="first-run" status="جاهز في هذه الصفحة">
        <FirstRun onStart={noop} onTour={noop} />
      </Frame>

      <Frame name="permission" state="permission" status="لم يُمنح الإذن">
        <Permission origin="figma.com" onAllowOrigin={noop} onAllowOnce={noop} />
      </Frame>

      <Frame name="offline" state="offline" status="لا يوجد اتصال">
        <Offline onContinue={noop} onRetry={noop} />
      </Frame>

      <Frame name="restricted" state="restricted" status="chrome://settings">
        <Restricted reason="browser-internal" onManageSites={noop} />
      </Frame>
    </>
  )
}
