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
export { BoxLegend, type BoxLegendProps } from './BoxLegend'
export { BoxModel, type BoxModelProps, type Edges } from './BoxModel'
export { MeasureGap, type MeasureGapProps } from './MeasureGap'
export { AlignGuide, type AlignGuideProps } from './AlignGuide'
export { Toolbar, type ToolbarProps, type ToolbarItem } from './Toolbar'
export { Crosshair, type CrosshairProps } from './Crosshair'
export { FrameBlocked, type FrameBlockedProps } from './FrameBlocked'
export { at, box, type Point, type Rect } from './geometry'
export { FullPageStatus, fullPageRows } from './FullPageStatus'
export type { FullPageStatusProps, FullPageRow } from './FullPageStatus'
export { Loupe, LOUPE_GEOMETRY, type LoupeProps, type LoupePixel } from './Loupe'
export { ColourPanel, ColourIdle, COLOUR_HINTS } from './colour/ColourPanel'
export type {
  ColourPanelProps,
  ColourRow,
  ColourVarView,
  ColourContrastView,
} from './colour/ColourPanel'
export { ScalePanel } from './colour/ScalePanel'
export type {
  ScalePanelProps,
  ScaleStepCount,
  ScaleStripStop,
  ScaleSampleRow,
} from './colour/ScalePanel'
export { PalettePanel } from './colour/PalettePanel'
export type {
  PalettePanelProps,
  PaletteSourceKind,
  PaletteReadMethod,
  PaletteSwatchView,
} from './colour/PalettePanel'
export { ReplacePanel } from './colour/ReplacePanel'
export type { ReplacePanelProps, ReplaceContrastView } from './colour/ReplacePanel'
export { InspectPanel, InspectIdle, INSPECT_TABS, TAB_LABELS } from './inspect/InspectPanel'
export type {
  InspectPanelProps,
  InspectRow,
  InspectGroupView,
  InspectTabId,
} from './inspect/InspectPanel'
export { ReferenceOverlay } from './compare/ReferenceOverlay'
export type { ReferenceOverlayProps } from './compare/ReferenceOverlay'
export { ComparePanel, CompareIdle } from './compare/ComparePanel'
export type { ComparePanelProps, CompareIdleProps } from './compare/ComparePanel'
export { SplitHandle } from './compare/SplitHandle'
export type { SplitHandleProps } from './compare/SplitHandle'
export { ViewportGallery } from './compare/ViewportGallery'
export type { ViewportGalleryProps, ViewportGalleryCard } from './compare/ViewportGallery'
