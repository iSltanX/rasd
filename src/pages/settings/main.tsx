import { render } from 'preact'

import { watchSettings } from '@/shared/settings'
import { applyTheme } from '@/ui/theme'

import { Settings } from './Settings'

// يُطبَّق فورًا وعند كل تغيّر لاحق — بلا انتظار تركيب أول React/Preact.
watchSettings((settings) => applyTheme(settings))

const root = document.getElementById('root')
if (root) render(<Settings />, root)
