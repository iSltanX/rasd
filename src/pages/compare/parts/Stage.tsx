/**
 * المسرح — حاوية واحدة بنسبة عرض:ارتفاع `stageSize()`، تُفوِّض لمكوّن كل
 * طريقة عرض. القياس (`measureExtent`) يُحقن في `AdjacentView`/`PageSplitHandle`
 * من هنا لأن الحاوية نفسها مملوكة لهذا المكوّن.
 */

import { useCallback, useRef } from 'preact/hooks'

import { AdjacentView } from './AdjacentView'
import { BlinkView } from './BlinkView'
import { DiffView } from './DiffView'
import styles from './Stage.module.css'

import type { PixelSize } from '@/pages/compare/layout'
import type { RegionItem } from '@/pages/compare/region-format'
import type { DiffOutcome } from '@/pages/compare/worker-client'
import type { JSX } from 'preact'

export type CompareMode = 'adjacent' | 'diff' | 'blink'

export interface StageImage {
  readonly url: string
  readonly title: string
  /**
   * مقاس الصورة **الأصلي** بالبكسل — لا مقاسها المعروض.
   *
   * لازمٌ لأن الصورة تُموضَع بـ`imageBox()` في فضاء المسرح، لا تُفرَش على
   * الحاوية بـ`object-fit`. صورةٌ لا تبلغ الحدّ الأقصى في أيّ محور كانت
   * تُرسَم مكبَّرةً (قِيس 1.400×) فتنفصل عن كل ما يُرسَم فوقها.
   */
  readonly size: PixelSize
}

export interface StageProps {
  readonly mode: CompareMode
  readonly stageSizePx: PixelSize
  readonly a: StageImage
  readonly b: StageImage
  readonly splitPosition: number
  readonly onSplitPositionChange: (percent: number) => void
  readonly blinkShowingA: boolean
  readonly blinkPlaying: boolean
  readonly onBlinkTogglePlay: () => void
  readonly onBlinkStep: () => void
  readonly diffOutcome: DiffOutcome | null
  readonly regionItems: readonly RegionItem[]
  readonly selectedRegionIndex: number | null
  readonly onSelectRegion: (index: number) => void
}

export function Stage({
  mode,
  stageSizePx,
  a,
  b,
  splitPosition,
  onSplitPositionChange,
  blinkShowingA,
  blinkPlaying,
  onBlinkTogglePlay,
  onBlinkStep,
  diffOutcome,
  regionItems,
  selectedRegionIndex,
  onSelectRegion,
}: StageProps): JSX.Element {
  const stageRef = useRef<HTMLDivElement | null>(null)
  const measureExtent = useCallback(() => stageRef.current?.getBoundingClientRect().width ?? 0, [])

  return (
    <div
      ref={stageRef}
      class={styles.box}
      style={{
        aspectRatio: `${stageSizePx.width} / ${stageSizePx.height}`,
        // نفس النسبة عددًا، لأن `calc()` لا يقبل صيغة `W / H` الوصفية.
        '--rasd-stage-ratio': `${stageSizePx.width / stageSizePx.height}`,
      }}
    >
      {mode === 'adjacent' ? (
        <AdjacentView
          urlA={a.url}
          urlB={b.url}
          titleA={a.title}
          titleB={b.title}
          sizeA={a.size}
          sizeB={b.size}
          stage={stageSizePx}
          splitPosition={splitPosition}
          onSplitPositionChange={onSplitPositionChange}
          measureExtent={measureExtent}
        />
      ) : null}
      {mode === 'blink' ? (
        <BlinkView
          urlA={a.url}
          urlB={b.url}
          titleA={a.title}
          titleB={b.title}
          sizeA={a.size}
          sizeB={b.size}
          stage={stageSizePx}
          showingA={blinkShowingA}
          isPlaying={blinkPlaying}
          onTogglePlay={onBlinkTogglePlay}
          onStep={onBlinkStep}
        />
      ) : null}
      {mode === 'diff' && diffOutcome ? (
        <DiffView
          baseUrl={b.url}
          baseTitle={b.title}
          baseSize={b.size}
          stage={stageSizePx}
          diff={diffOutcome.diff}
          overlap={diffOutcome.overlap}
          extraInA={diffOutcome.extraInA}
          extraInB={diffOutcome.extraInB}
          regionItems={regionItems}
          selectedIndex={selectedRegionIndex}
          onSelectRegion={onSelectRegion}
        />
      ) : null}
    </div>
  )
}
