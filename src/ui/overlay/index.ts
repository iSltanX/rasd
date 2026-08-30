/**
 * بدائيّات الطبقة داخل الصفحة — سبع بدائيّات من `06 — Visual Language`،
 * وعلامة الإطار خارج النطاق.
 *
 * كلّها **تعرض ولا تحسب**: تستقبل هندسة جاهزة بإحداثيات النافذة. التحويل
 * بين الفضاءات الثلاثة يحدث في `content/coords.ts` قبل أن يصل إلى هنا،
 * وإدارة الحالة في `content/mode-manager.ts` — فتبقى هذه الطبقة قابلة
 * للعرض في معرض ثابت بلا تشغيل أي منها داخل صفحة.
 */
export { Marquee, type MarqueeProps } from './Marquee'
export { NodeLabel, type NodeLabelProps, type NodeLabelAnchor } from './NodeLabel'
export { ElementHover, type ElementHoverProps, type QuickAction } from './ElementHover'
export { Dimension, type DimensionProps } from './Dimension'
export { DimensionVertical, type DimensionVerticalProps } from './DimensionVertical'
export { BoxModel, type BoxModelProps, type Edges } from './BoxModel'
export { MeasureGap, type MeasureGapProps } from './MeasureGap'
export { AlignGuide, type AlignGuideProps } from './AlignGuide'
export { Toolbar, type ToolbarProps, type ToolbarItem } from './Toolbar'
export { Crosshair, type CrosshairProps } from './Crosshair'
export { FrameBlocked, type FrameBlockedProps } from './FrameBlocked'
export { at, box, type Point, type Rect } from './geometry'
export { FullPageStatus, fullPageRows } from './FullPageStatus'
export type { FullPageStatusProps, FullPageRow } from './FullPageStatus'
export { InspectPanel, InspectIdle, INSPECT_TABS, TAB_LABELS } from './inspect/InspectPanel'
export type {
  InspectPanelProps,
  InspectRow,
  InspectGroupView,
  InspectTabId,
} from './inspect/InspectPanel'
