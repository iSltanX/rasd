import { render } from 'preact'

import { Library } from './Library'

const root = document.getElementById('root')
if (root) render(<Library />, root)
