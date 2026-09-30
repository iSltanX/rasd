import { render } from 'preact'

import { watchSettings } from '@/shared/settings'
import { applyTheme } from '@/ui/theme'

import { loadPopup, POPUP_MARKS } from './context'
import { Popup } from './Popup'

performance.mark(POPUP_MARKS.boot)

// الجلب يبدأ مع تقييم الحزمة لا بعد أول تركيب — انظر `loadPopup`. والرفض يُقرأ
// «لا تبويب» فتبقى القشرة الفارغة، كما كان الجلب الساقط داخل المكوّن.
const initial = loadPopup().catch(() => null)

// يُطبَّق فورًا وعند كل تغيّر لاحق — بلا انتظار تركيب أول React/Preact.
watchSettings((settings) => applyTheme(settings))

const root = document.getElementById('root')
if (root) render(<Popup initial={initial} />, root)
