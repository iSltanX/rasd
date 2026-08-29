import { render } from 'preact'

import { PopupPreview } from './PopupPreview'

// توكنز السمة مُنطاقة إلى `:root[data-theme]` — لا تأثير لسمة على `div`
// متداخل. `?theme=light` يُبدِّل الجذر كلّه لهذا التحميل، فتُعاين حالة
// `default · light` بمقارنة تحميلين لا بإطار واحد مُختلَط السمتين.
const theme = new URLSearchParams(location.search).get('theme')
if (theme === 'light' || theme === 'dark') {
  document.documentElement.setAttribute('data-theme', theme)
}

const root = document.getElementById('root')
if (root) render(<PopupPreview />, root)
