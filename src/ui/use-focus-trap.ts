import { useEffect, useState } from 'preact/hooks'

import type { RefObject } from 'preact'

/**
 * حبس التركيز داخل حوارٍ مشروط (`aria-modal`) — **النمط الواحد لكل حوارات صفحات الإضافة**.
 *
 * `aria-modal="true"` يعد قارئ الشاشة بأن ما وراء الحوار غير قائم، فإن خرج `Tab` منه إلى الصفحة خلفه صار
 * التركيز في مكانٍ لا يُرى ولا يُقرأ. و`axe` لا يلتقط هذا (لا قاعدة له)؛ كشفته جولة لوحة المفاتيح الحقيقية
 * (`pnpm design:shots --keys`، `STAGES/24`): نافذتا التصدير و«مغادرة بلا حفظ» في المحرّر كان `Tab` يخرج منهما
 * إلى أزرار المحرّر وراءهما — وقد كان حوارا الحذف والبيانات وحدهما يحبسانه، كلٌّ بنسخته.
 *
 * - `Tab` من آخر عنصرٍ إلى أوّله و`Shift+Tab` من أوّله إلى آخره، وتركيزٌ خارج الحوار (نقرةٌ على الحاجب مثلًا)
 *   يعود إلى أوّل عنصر. حوارٌ بلا عنصرٍ قابل للتركيز يُبقي التركيز عليه هو.
 * - **حوارٌ واحد يعمل**: حين يُفتح حوارٌ فوق حوار يحكم الأعلى وحده — مكدّس لا مستمعان يتنازعان.
 * - عند الإغلاق يعود التركيز إلى ما كان عليه قبل الفتح (الزرّ الذي فتحه) إن بقي في الصفحة.
 *
 * التركيز الأوّلي و`Esc` يبقيان عند كل حوار: أوّل تركيزٍ يختلف (الإلغاء في الحذف، حقل التأكيد في غيره).
 */

const FOCUSABLE = [
  'a[href]',
  'button:not(:disabled)',
  'input:not(:disabled):not([type="hidden"])',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/**
 * الحوارات المفتوحة، الأعلى آخرها. مراجعُ لا عناصر: مكوّنٌ يُرسم `null` في طورٍ ثمّ حوارًا في آخر يبقى في
 * المكدّس بمرجعه، ويُقرأ عنصره لحظة الضغط.
 */
const open: RefObject<HTMLElement>[] = []

/** عناصر الحوار القابلة للتركيز بترتيب المستند — دون المخفيّ بـ`hidden` أو `display:none` أو `visibility`. */
export function focusableIn(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => {
    if (el.closest('[hidden], [inert]')) return false
    const style = getComputedStyle(el)
    return style.display !== 'none' && style.visibility !== 'hidden'
  })
}

export function useFocusTrap(ref: RefObject<HTMLElement>): void {
  // ما كان مركَّزًا قبل الفتح يُقرأ في أوّل رسمٍ لا في الأثر: أثرُ ابنٍ أو حقلٌ بـ`autofocus` قد يسبقه فيُحسب
  // الحقلُ فاتحًا والتركيز يعود إليه بعد أن يزول.
  const [opener] = useState(() =>
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  )
  useEffect(() => {
    open.push(ref)

    const onKey = (e: KeyboardEvent): void => {
      const root = ref.current
      if (e.key !== 'Tab' || !root || open[open.length - 1] !== ref) return
      const items = focusableIn(root)
      const first = items[0]
      const last = items[items.length - 1]
      if (!first || !last) {
        e.preventDefault()
        root.focus()
        return
      }
      const current = document.activeElement
      if (!(current instanceof Node) || !root.contains(current)) {
        e.preventDefault()
        ;(e.shiftKey ? last : first).focus()
      } else if (e.shiftKey && current === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && current === last) {
        e.preventDefault()
        first.focus()
      }
    }
    // الالتقاط قبل أي معالج `Tab` آخر في الصفحة، ومن `window` أوّل من يسمع فيسبق مستمعي المحرّر.
    window.addEventListener('keydown', onKey, true)

    return () => {
      window.removeEventListener('keydown', onKey, true)
      const at = open.lastIndexOf(ref)
      if (at !== -1) open.splice(at, 1)
      if (opener?.isConnected) opener.focus()
    }
  }, [ref, opener])
}
