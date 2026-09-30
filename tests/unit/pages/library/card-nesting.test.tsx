/**
 * بطاقات المكتبة الخمس بلا تفاعليّ داخل تفاعليّ (axe `nested-interactive`، `STAGES/04`): كانت كلٌّ
 * `<button>` في داخله مربّع تحديد — عنصر لا يبلغه قارئ الشاشة ولا يُعرف دوره. صارت حاوية فيها زرّ
 * الفتح والمربّع شقيقين، والنقر على البطاقة يفتح كما كان، والمربّع يحدّد وحده.
 */
import { render } from 'preact'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Card } from '@/pages/library/parts/Card'
import { ColorCard } from '@/pages/library/parts/ColorCard'
import { GuideCard } from '@/pages/library/parts/GuideCard'
import { PaletteCard } from '@/pages/library/parts/PaletteCard'
import { ReferenceCard } from '@/pages/library/parts/ReferenceCard'

import type { ComponentChild } from 'preact'

const NOW = 1_700_000_000_000
let container: HTMLDivElement | null = null

afterEach(() => {
  if (container) {
    render(null, container)
    container.remove()
    container = null
  }
})

type Hooks = { onToggleSelect: () => void; onOpen: () => void }
const common = (h: Hooks) => ({ selectionMode: false, selected: false, now: NOW, ...h })

const CARDS: readonly [string, string, (h: Hooks) => ComponentChild][] = [
  [
    'اللقطة',
    'data-capture-id',
    (h) => (
      <Card
        {...common(h)}
        thumbnailUrl={null}
        projectName={null}
        record={{
          id: 'x',
          createdAt: NOW,
          origin: 'https://example.com',
          url: 'https://example.com/',
          title: 'لقطة',
          kind: 'area',
          status: 'ready',
          projectId: null,
          tags: [],
          width: 10,
          height: 10,
          devicePixelRatio: 1,
          favorite: false,
          archived: false,
          trashedAt: null,
        }}
      />
    ),
  ],
  [
    'اللون',
    'data-color-id',
    (h) => (
      <ColorCard
        {...common(h)}
        record={{
          id: 'x',
          hex: '#3B82F6',
          name: '',
          note: '',
          source: 'pixel',
          projectId: null,
          sourceUrl: null,
          createdAt: NOW,
        }}
      />
    ),
  ],
  [
    'اللوحة',
    'data-palette-id',
    (h) => (
      <PaletteCard
        {...common(h)}
        record={{ id: 'x', name: 'لوحة', colors: ['#3B82F6'], projectId: null, createdAt: NOW }}
      />
    ),
  ],
  [
    'المرجع',
    'data-reference-id',
    (h) => (
      <ReferenceCard
        {...common(h)}
        record={{
          id: 'x',
          projectId: null,
          origin: 'https://example.com',
          path: '/',
          viewport: 'desktop',
          blobId: 'b',
          createdAt: NOW,
        }}
      />
    ),
  ],
  [
    'الدليل',
    'data-guide-id',
    (h) => (
      <GuideCard
        {...common(h)}
        record={{ id: 'x', title: 'دليل', projectId: null, captureIds: [], createdAt: NOW }}
      />
    ),
  ],
]

describe.each(CARDS)('بطاقة %s', (_, attr, make) => {
  function mount() {
    const hooks = { onToggleSelect: vi.fn(), onOpen: vi.fn() }
    container = document.createElement('div')
    document.body.appendChild(container)
    render(make(hooks), container)
    return { root: container.querySelector(`[${attr}]`) as HTMLElement, ...hooks }
  }

  it('لا عنصر تفاعليّ داخل زرّ', () => {
    const { root } = mount()
    expect(root.querySelectorAll('button :is(button, input, a, [tabindex])')).toHaveLength(0)
    expect(root.querySelector('button')).not.toBeNull()
    expect(root.querySelector('input[type="checkbox"]')).not.toBeNull()
  })

  it('زرّ البطاقة يفتح، والمربّع يحدّد وحده', () => {
    const { root, onOpen, onToggleSelect } = mount()
    root.querySelector('button')!.click()
    expect(onOpen).toHaveBeenCalledOnce()
    root.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click()
    expect(onToggleSelect).toHaveBeenCalledOnce()
    expect(onOpen).toHaveBeenCalledOnce()
  })
})
