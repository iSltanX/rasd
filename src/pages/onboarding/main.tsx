import { render } from 'preact'

import { watchSettings } from '@/shared/settings'
import { applyTheme } from '@/ui/theme'

import { Onboarding } from './Onboarding'

// يُطبَّق فورًا وعند كل تغيّر لاحق — بلا انتظار تركيب أول Preact.
watchSettings((settings) => applyTheme(settings))

const root = document.getElementById('root')
if (root) render(<Onboarding />, root)
