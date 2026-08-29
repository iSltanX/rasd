import { useMemo, useState } from 'preact/hooks'

import { cartesian, combinationCount } from '@/ui/components/matrices'
import { MATRICES, rendererFor } from '@/ui/components/registry'
import { SegmentedControl } from '@/ui/components/SegmentedControl/SegmentedControl'
import { STATE_MATRIX, STATES, SURFACES } from '@/ui/components/state-matrix'
import { effectiveTheme } from '@/ui/theme'

import { ErrorBoundary } from './ErrorBoundary'
import styles from './Gallery.module.css'
import { OverlayStages } from './OverlayStage'

import '@/ui/overlay/overlay.css'

import type { JSX } from 'preact'

type Theme = 'dark' | 'light'
type Direction = 'rtl' | 'ltr'

/** يعرض تركيبة واحدة، محصورة الخطأ، ومعلَّمة للقياس الآلي. */
function Cell({
  groupName,
  combo,
}: {
  groupName: string
  combo: Record<string, string>
}): JSX.Element {
  const render = rendererFor(MATRICES.find((m) => m.name === groupName)!)
  return (
    <div class={styles.cell} data-gallery-cell={groupName}>
      <div class={styles.cellPreview}>
        <ErrorBoundary>{render(combo)}</ErrorBoundary>
      </div>
      <div class={styles.cellCombo}>
        {Object.entries(combo)
          .map(([k, v]) => `${k}=${v}`)
          .join(' · ')}
      </div>
    </div>
  )
}

function GroupSection({ matrix }: { matrix: (typeof MATRICES)[number] }): JSX.Element {
  const combos = useMemo(() => cartesian(matrix.axes), [matrix])
  const count = combinationCount(matrix.axes)
  const mismatch = count !== matrix.figmaCount

  return (
    <section class={styles.group} data-gallery-group={matrix.name}>
      <div class={styles.groupHeader}>
        <h2 class={styles.groupTitle}>{matrix.name}</h2>
        <span class={[styles.groupCount, mismatch ? styles.mismatch : ''].join(' ')}>
          {count} / {matrix.figmaCount} variant
        </span>
      </div>
      <div class={styles.grid}>
        {combos.map((combo, i) => (
          <Cell key={i} groupName={matrix.name} combo={combo} />
        ))}
      </div>
    </section>
  )
}

function StateMatrixTable(): JSX.Element {
  return (
    <section class={styles.group}>
      <h2 class={styles.groupTitle}>مصفوفة الحالات — 14 حالة × 8 أسطح</h2>
      <div
        class={styles.stateMatrix}
        tabIndex={0}
        role="group"
        aria-label="مصفوفة الحالات — قابلة للتمرير أفقيًا"
      >
        <table class={styles.matrixTable}>
          <thead>
            <tr>
              <th>السطح</th>
              {STATES.map((s) => (
                <th key={s}>{s}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SURFACES.map((surface) => (
              <tr key={surface}>
                <td>{surface}</td>
                {STATES.map((state) => {
                  const cell = STATE_MATRIX[surface][state]
                  return (
                    <td key={state} title={cell.reason}>
                      <span class={cell.applicable ? styles.dotYes : styles.dotNo}>
                        {cell.applicable ? '●' : '—'}
                      </span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export function Gallery(): JSX.Element {
  // بلا سمة صريحة على الجذر عند التحميل الأول، يحكم `prefers-color-scheme`
  // العرض الفعلي — تهيئة الحالة بقيمة ثابتة هنا تُخالف تفضيل النظام أحيانًا،
  // فيُظهر المفتاح «داكن» محدَّدًا بينما الصفحة تُعرَض فعليًا فاتحة (أو
  // العكس). `effectiveTheme()` تقرأ الحالة الفعلية فتُبقي المفتاح صادقًا.
  const [theme, setTheme] = useState<Theme>(() => effectiveTheme())
  const [direction, setDirection] = useState<Direction>('rtl')

  const applyTheme = (t: Theme) => {
    setTheme(t)
    document.documentElement.setAttribute('data-theme', t)
  }
  const applyDirection = (d: Direction) => {
    setDirection(d)
    document.documentElement.setAttribute('dir', d)
    document.documentElement.setAttribute('lang', d === 'rtl' ? 'ar' : 'en')
  }

  const totalVariants = MATRICES.reduce((n, m) => n + combinationCount(m.axes), 0)

  return (
    <main class={styles.page} data-gallery-ready="true">
      <header class={styles.header}>
        <div>
          <h1 class={styles.title}>معرض المكوّنات</h1>
          <p class={styles.subtitle}>
            {MATRICES.length} مجموعة · {totalVariants} variant · مستبعَد من بناء الإنتاج
          </p>
        </div>
        <div class={styles.controls}>
          <SegmentedControl
            aria-label="الوضع"
            options={[
              { value: 'dark', label: 'داكن' },
              { value: 'light', label: 'فاتح' },
            ]}
            selected={theme === 'dark' ? 0 : 1}
            onChange={(i) => applyTheme(i === 0 ? 'dark' : 'light')}
          />
          <SegmentedControl
            aria-label="الاتجاه"
            options={[
              { value: 'rtl', label: 'RTL' },
              { value: 'ltr', label: 'LTR' },
            ]}
            selected={direction === 'rtl' ? 0 : 1}
            onChange={(i) => applyDirection(i === 0 ? 'rtl' : 'ltr')}
          />
        </div>
      </header>

      <StateMatrixTable />

      <OverlayStages />

      {MATRICES.map((matrix) => (
        <GroupSection key={matrix.name} matrix={matrix} />
      ))}
    </main>
  )
}
