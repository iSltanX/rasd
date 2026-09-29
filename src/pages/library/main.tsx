import { render } from 'preact'

import { watchSettings } from '@/shared/settings'
import { applyTheme } from '@/ui/theme'

import { Library } from './Library'

// السمة والكثافة واللغة على الجذر فورًا وعند كل تغيّر — كالنافذة والإعدادات (الصفّ 110).
watchSettings((settings) => applyTheme(settings))

const root = document.getElementById('root')
if (root) render(<Library />, root)
