import { render } from 'preact'

import { ComparePage } from './ComparePage'

const root = document.getElementById('root')
if (root) render(<ComparePage />, root)
