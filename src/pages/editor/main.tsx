import { render } from 'preact'

import { Editor } from './Editor'

const root = document.getElementById('root')
if (root) render(<Editor />, root)
