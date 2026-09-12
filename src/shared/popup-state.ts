/**
 * منطق اختيار حالة النافذة — دالّة نقيّة، بلا `chrome.*`.
 *
 * عشر حالات من `13 — Extension Popup`، وترتيب الفحص بينها **ثابت ومقصود**:
 * كل شرط يُقصي كل ما بعده، فلا حالتان تتنافسان على الأولوية بصمت. الأولوية
 * من الأكثر تعطيلًا إلى الأقلّ: مقيّد ← بلا اتصال ← الجولة الأولى ← إذن ←
 * مهمّة جارية ← وضع حيّ ← الافتراضي.
 *
 * `shared/` طبقة قاعدية: لا تستورد من أي طبقة أعلى منها ولا تلمس `chrome.*` —
 * هذا ما يجعلها قابلة للاختبار بمدخلات مصطنعة بلا أي محاكاة للمتصفح.
 */

import type { GateReason } from './injection-gate'
import type { ActiveMode } from './storage/session'

export type PopupStateName =
  | 'restricted'
  | 'offline'
  | 'first-run'
  | 'permission'
  | 'capturing'
  | 'inspect-active'
  | 'colors'
  | 'default'

/** كل ما يلزم لاختيار حالة واحدة — يصل مُجمَّعًا لا مُستقصًى داخل الدالّة. */
export interface PopupContext {
  readonly restriction:
    { readonly injectable: true } | { readonly injectable: false; readonly reason: GateReason }
  readonly online: boolean
  readonly firstRun: boolean
  /** `null` يعني: لا حاجة إلى إذن الآن — لا ميزة نشطة تطلبه. */
  readonly permissionNeeded: { readonly origin: string } | null
  /**
   * مهمّة تجميع جارية على هذا التبويب — الالتقاط الكامل وحده يستغرق وقتًا
   * يستحقّ شريط تقدّم. `capturing` في `13 — Extension Popup` تعرض بالضبط
   * هذا: تقدّم تجميع بلاطات، لا وضعًا تفاعليًا نشطًا.
   */
  readonly job: { readonly kind: string; readonly done: number; readonly total: number } | null
  /**
   * وضع الطبقة الحيّ في هذا التبويب، من `session.modes[tabId]`.
   *
   * `area`/`element` **لا تُنتجان** `capturing`: كلاهما تحديد تفاعلي على
   * الصفحة نفسها — والتفاعل مع الصفحة يُغلق النافذة أصلًا (سلوك المتصفح
   * القياسي)، فإعادة فتحها أثناء السحب حالة نادرة تسقط على `default` بأمان.
   * الحالتان الوحيدتان المرتبطتان بوضع حيّ فعليًا هما `inspect` و`colour`،
   * لأن الفحص واختيار اللون يُعادان فتح النافذة أثناءهما لقراءة نتيجتهما.
   */
  readonly liveMode: ActiveMode | null
}

/**
 * `success` ليست ناتج هذه الدالّة عمدًا: لا مدخل ثابت يُنتجها، بل حدث لحظي
 * (اكتمال التقاط) يعرضه `Popup.tsx` فوق ما تختاره هذه الدالّة، لا بدلًا
 * منه.
 *
 * `measure` و`compare` لا مِعاينة مخصَّصة لهما في `13 — Extension Popup` —
 * يبقيان على `default` حتى تُصمَّم شاشتاهما.
 */
export function selectPopupState(context: PopupContext): PopupStateName {
  if (!context.restriction.injectable) return 'restricted'
  if (!context.online) return 'offline'
  if (context.firstRun) return 'first-run'
  if (context.permissionNeeded) return 'permission'
  if (context.job) return 'capturing'

  switch (context.liveMode) {
    case 'inspect':
      return 'inspect-active'
    case 'colour':
      return 'colors'
    default:
      return 'default'
  }
}
