/**
 * السمة والاتجاه واللغة على جذر المستند.
 *
 * ثلاث حالات للسمة لا اثنتان: `system` (بلا سمة على الجذر، يحكم
 * `prefers-color-scheme`)، و`dark`، و`light`. كتابة `data-theme` تعني اختيارًا
 * صريحًا يتفوّق على تفضيل النظام — لذلك تُمحى السمة في وضع `system` ولا تُكتب
 * قيمة ثالثة.
 *
 * **حين يكون الجذر `hostEl` مضيف الظلّ في طبقة العرض** (`content/host.ts`):
 * سمة `dir` تُكتب كما هي دائمًا، لكنها بلا أثر بصري فعليًّا — `applyCritical()`
 * تُثبِّت `direction: ltr !important` سطريًا على `hostEl` نفسه لعزل الطبقة عن
 * اتجاه الصفحة المضيفة غير الموثوقة، وقواعد RTL في `overlay.css` تكتب
 * `direction: rtl` مباشرةً بلا اعتماد على وراثة `[dir]`. غير خطِر: لا مسار
 * إنتاجي يبدّل `appearance.language` عن `'ar'` بعد (الوحدة 20.1).
 */

import type { Settings } from '@/shared/settings'

export type ThemeMode = 'system' | 'dark' | 'light'
export type UiLanguage = 'ar' | 'en'

export interface AppliedTheme {
  mode: ThemeMode
  language: UiLanguage
  dir: 'rtl' | 'ltr'
}

/** يطبّق السمة واللغة والاتجاه على عنصر الجذر. */
export function applyTheme(
  settings: Pick<Settings, 'appearance'>,
  root: HTMLElement = document.documentElement,
): AppliedTheme {
  const mode = settings.appearance.theme
  const language = settings.appearance.language
  const dir = language === 'ar' ? 'rtl' : 'ltr'

  if (mode === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', mode)

  root.setAttribute('lang', language)
  root.setAttribute('dir', dir)
  root.setAttribute('data-density', settings.appearance.density)

  return { mode, language, dir }
}

/** السمة الفعّالة الآن — تحلّ `system` إلى ما يفرضه النظام. */
export function effectiveTheme(root: HTMLElement = document.documentElement): 'dark' | 'light' {
  const explicit = root.getAttribute('data-theme')
  if (explicit === 'dark' || explicit === 'light') return explicit
  return globalThis.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

/** يراقب تغيّر تفضيل النظام — يهمّ في وضع `system` وحده. */
export function watchSystemTheme(listener: (theme: 'dark' | 'light') => void): () => void {
  const query = globalThis.matchMedia?.('(prefers-color-scheme: light)')
  if (!query) return () => undefined
  const handler = () => listener(query.matches ? 'light' : 'dark')
  query.addEventListener('change', handler)
  return () => query.removeEventListener('change', handler)
}
