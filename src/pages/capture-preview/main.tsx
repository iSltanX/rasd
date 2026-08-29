import { render } from 'preact'

/*
 * ورقة الطبقة تُستورَد صراحةً.
 *
 * في المنتج تُتبنّى داخل جذر الظلّ (`host.ts`)، فلا تصل إلى مستند عادي.
 * وبدونها تنهار البدائيّات كلّها فوق بعضها في الزاوية: `.rasd-ov-place`
 * هي التي تعطيها `position: absolute` والإزاحة من المتغيّرين.
 */
import '@/ui/overlay/overlay.css'

import { CapturePreview } from './CapturePreview'

const theme = new URLSearchParams(location.search).get('theme')
if (theme === 'light' || theme === 'dark') {
  document.documentElement.setAttribute('data-theme', theme)
}

const root = document.getElementById('root')
if (root) render(<CapturePreview />, root)
