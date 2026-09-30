import { render } from 'preact'

import { watchSettings } from '@/shared/settings'
import { requestPersistence } from '@/shared/storage/persistence'
import { applyTheme } from '@/ui/theme'

import { Editor } from './Editor'

// السمة والكثافة واللغة على الجذر فورًا وعند كل تغيّر — كالنافذة والإعدادات (الصفّ 110).
watchSettings((settings) => applyTheme(settings))

const root = document.getElementById('root')
if (root) render(<Editor />, root)

// المحرّر أوّل صفحةٍ بعد الحفظ (يُفتح بعد الالتقاط افتراضيًّا) — والمكتبة فيها لقطةٌ إذن (`persistence.ts`).
void requestPersistence()
