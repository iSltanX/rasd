import { Button } from '@/ui/components/Button/Button'

import { RedactPanel } from '../parts/RedactPanel'

import type { History } from '@/modules/editor/history'
import type { Palette } from '@/modules/editor/renderer'
import type { NodeId } from '@/modules/editor/scene'
import type { JSX } from 'preact'

export interface RedactViewProps {
  readonly history: History
  readonly selection: ReadonlySet<NodeId>
  readonly palette: Palette
  readonly onChange: () => void
  readonly onExit: () => void
}

/**
 * حالة `redact` — وضعُ الحجب والطمس.
 *
 * **وضعٌ لا صفحة.** المسرح يبقى كما هو ويبقى قابلًا للتحرير؛ والذي يتغيّر
 * أداةُ الرسم واللوحةُ الجانبية. وجعلها صفحةً كاملة كان سيعني مسرحًا ثانيًا:
 * قماشين آخرين، وذاكرة تخطيط أخرى، وإعادة فكّ الصورة عند كل دخول وخروج —
 * على لقطة قد تبلغ 2560×28,672.
 *
 * ولذلك يُمرَّر هذا العرض إلى `Annotating` لوحةً جانبية، ويحمل معه ما يميّز
 * الوضع: أداة الحجب مختارة، ومخرجٌ صريح.
 */
export function RedactView(props: RedactViewProps): JSX.Element {
  return (
    <div data-editor-mode="redact" style={{ display: 'contents' }}>
      <RedactPanel
        history={props.history}
        selection={props.selection}
        palette={props.palette}
        onChange={props.onChange}
      />
      <Button variant="secondary" size="m" data-redact-exit="" onClick={props.onExit}>
        إنهاء وضع الحجب
      </Button>
    </div>
  )
}
