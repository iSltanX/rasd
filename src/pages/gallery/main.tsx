import { render } from 'preact'

import { Gallery } from './Gallery'

const root = document.getElementById('root')
if (root) render(<Gallery />, root)
