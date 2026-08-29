/**
 * مولَّد من ملف Figma عبر `pnpm tokens:sync` — لا يُحرَّر يدويًا.
 * المصدر: src/tokens/figma-snapshot.json
 */

/** كل توكن دلالي. التوكن الخاطئ خطأ ترجمة لا عطل وقت تشغيل. */
export type SemanticToken =
  | 'surface/canvas'
  | 'surface/default'
  | 'surface/raised'
  | 'surface/overlay'
  | 'surface/sunken'
  | 'surface/hover'
  | 'surface/pressed'
  | 'surface/selected'
  | 'surface/disabled'
  | 'surface/inverse'
  | 'surface/brand'
  | 'surface/brand-subtle'
  | 'text/primary'
  | 'text/secondary'
  | 'text/tertiary'
  | 'text/disabled'
  | 'text/inverse'
  | 'text/brand'
  | 'text/on-brand'
  | 'text/link'
  | 'text/code'
  | 'border/subtle'
  | 'border/default'
  | 'border/strong'
  | 'border/brand'
  | 'border/focus'
  | 'border/inverse'
  | 'icon/primary'
  | 'icon/secondary'
  | 'icon/tertiary'
  | 'icon/disabled'
  | 'icon/brand'
  | 'icon/on-brand'
  | 'action/primary/rest'
  | 'action/primary/hover'
  | 'action/primary/pressed'
  | 'action/primary/disabled'
  | 'action/secondary/rest'
  | 'action/secondary/hover'
  | 'action/secondary/pressed'
  | 'action/danger/rest'
  | 'action/danger/hover'
  | 'action/danger/pressed'
  | 'status/success/fg'
  | 'status/success/surface'
  | 'status/success/border'
  | 'status/success/solid'
  | 'status/warning/fg'
  | 'status/warning/surface'
  | 'status/warning/border'
  | 'status/warning/solid'
  | 'status/danger/fg'
  | 'status/danger/surface'
  | 'status/danger/border'
  | 'status/danger/solid'
  | 'status/info/fg'
  | 'status/info/surface'
  | 'status/info/border'
  | 'status/info/solid'
  | 'tool/capture/fg'
  | 'tool/capture/surface'
  | 'tool/capture/border'
  | 'tool/capture/solid'
  | 'tool/annotate/fg'
  | 'tool/annotate/surface'
  | 'tool/annotate/border'
  | 'tool/annotate/solid'
  | 'tool/inspect/fg'
  | 'tool/inspect/surface'
  | 'tool/inspect/border'
  | 'tool/inspect/solid'
  | 'tool/measure/fg'
  | 'tool/measure/surface'
  | 'tool/measure/border'
  | 'tool/measure/solid'
  | 'tool/compare/fg'
  | 'tool/compare/surface'
  | 'tool/compare/border'
  | 'tool/compare/solid'
  | 'tool/colors/fg'
  | 'tool/colors/surface'
  | 'tool/colors/border'
  | 'tool/colors/solid'
  | 'tool/diff/added'
  | 'tool/diff/removed'
  | 'tool/diff/added-wash'
  | 'tool/diff/removed-wash'
  | 'overlay/scrim'
  | 'overlay/scrim-soft'
  | 'overlay/glass'
  | 'overlay/mask'
  | 'overlay/grid'
  | 'overlay/marquee-fill'
  | 'overlay/highlight'
  | 'overlay/measure-wash'
  | 'overlay/inspect-wash'
  | 'overlay/padding-wash'
  | 'overlay/margin-wash'
  | 'overlay/hairline'
  | 'focus/ring'
  | 'focus/ring-offset'

export type SpaceToken =
  | 'space/0'
  | 'space/2'
  | 'space/4'
  | 'space/6'
  | 'space/8'
  | 'space/10'
  | 'space/12'
  | 'space/16'
  | 'space/20'
  | 'space/24'
  | 'space/28'
  | 'space/32'
  | 'space/40'
  | 'space/48'
  | 'space/56'
  | 'space/64'
  | 'space/80'
  | 'space/96'
  | 'space/120'
  | 'space/160'

export type RadiusToken =
  | 'radius/none'
  | 'radius/xs'
  | 'radius/sm'
  | 'radius/md'
  | 'radius/lg'
  | 'radius/xl'
  | 'radius/2xl'
  | 'radius/3xl'
  | 'radius/full'

export type TextStyle =
  | 'Latin/Display/2XL'
  | 'Latin/Display/XL'
  | 'Latin/Display/L'
  | 'Latin/Display/M'
  | 'Latin/Display/S'
  | 'Latin/Heading/XL'
  | 'Latin/Heading/L'
  | 'Latin/Heading/M'
  | 'Latin/Heading/S'
  | 'Latin/Heading/XS'
  | 'Latin/Body/L'
  | 'Latin/Body/M'
  | 'Latin/Body/S'
  | 'Latin/Body/L Strong'
  | 'Latin/Body/M Strong'
  | 'Latin/Body/S Strong'
  | 'Latin/UI/L'
  | 'Latin/UI/M'
  | 'Latin/UI/S'
  | 'Latin/UI/XS'
  | 'Latin/UI/L Strong'
  | 'Latin/UI/M Strong'
  | 'Latin/UI/S Strong'
  | 'Latin/UI/XS Strong'
  | 'Latin/Label/M'
  | 'Latin/Label/S'
  | 'Latin/Label/XS'
  | 'Arabic/Display/2XL'
  | 'Arabic/Display/XL'
  | 'Arabic/Display/L'
  | 'Arabic/Display/M'
  | 'Arabic/Display/S'
  | 'Arabic/Heading/XL'
  | 'Arabic/Heading/L'
  | 'Arabic/Heading/M'
  | 'Arabic/Heading/S'
  | 'Arabic/Heading/XS'
  | 'Arabic/Body/L'
  | 'Arabic/Body/M'
  | 'Arabic/Body/S'
  | 'Arabic/Body/L Strong'
  | 'Arabic/Body/M Strong'
  | 'Arabic/Body/S Strong'
  | 'Arabic/UI/L'
  | 'Arabic/UI/M'
  | 'Arabic/UI/S'
  | 'Arabic/UI/XS'
  | 'Arabic/UI/L Strong'
  | 'Arabic/UI/M Strong'
  | 'Arabic/UI/S Strong'
  | 'Arabic/UI/XS Strong'
  | 'Arabic/Label/M'
  | 'Arabic/Label/S'
  | 'Arabic/Label/XS'
  | 'Mono/L'
  | 'Mono/M'
  | 'Mono/S'
  | 'Mono/XS'
  | 'Mono/2XS'
  | 'Mono/M Strong'
  | 'Mono/S Strong'
  | 'Mono/XS Strong'

export type EffectStyle =
  | 'Elevation/1'
  | 'Elevation/2'
  | 'Elevation/3'
  | 'Elevation/4'
  | 'Elevation/5'
  | 'Elevation/Inset'
  | 'Glow/Signal'
  | 'Glow/Measure'
  | 'Glow/Inspect'
  | 'Glow/Danger'
  | 'Focus/Ring'

export type TypeToken =
  | 'family/display'
  | 'family/text'
  | 'family/mono'
  | 'direction'
  | 'align/start'
  | 'tracking/display'
  | 'tracking/heading'
  | 'tracking/body'
  | 'tracking/ui'
  | 'tracking/label'
  | 'tracking/mono'
  | 'leading/display'
  | 'leading/heading'
  | 'leading/body'
  | 'leading/ui'
  | 'leading/label'

/** يحوّل اسم التوكن إلى `var(--rasd-…)` جاهزة للاستخدام في CSS. */
export function cssVar(token: SemanticToken | SpaceToken | RadiusToken): string {
  return `var(--rasd-${token.replace(/\//g, '-')})`
}

/** يحوّل اسم نمط النص إلى اسم فئته. */
export function textClass(style: TextStyle): string {
  return `t-${style.replace(/\//g, '-').replace(/\s+/g, '-').toLowerCase()}`
}

/**
 * القيم المحسومة لكل توكن دلالي في الوضعين.
 *
 * ضرورية للشيفرة التي ترسم على Canvas (المرحلة 15) ولا تصلها متغيّرات CSS.
 * الاستخدام في CSS يبقى `var(--rasd-…)`، لا هذه الخريطة.
 */
export const SEMANTIC_HEX: Record<SemanticToken, { dark: string; light: string }> = {
  "surface/canvas": {
    "dark": "#070b0d",
    "light": "#f4f7f9"
  },
  "surface/default": {
    "dark": "#0e1416",
    "light": "#ffffff"
  },
  "surface/raised": {
    "dark": "#192024",
    "light": "#ffffff"
  },
  "surface/overlay": {
    "dark": "#283237",
    "light": "#ffffff"
  },
  "surface/sunken": {
    "dark": "#070b0d",
    "light": "#e8eef1"
  },
  "surface/hover": {
    "dark": "#192024",
    "light": "#e8eef1"
  },
  "surface/pressed": {
    "dark": "#283237",
    "light": "#d3dce2"
  },
  "surface/selected": {
    "dark": "#002620",
    "light": "#dffff8"
  },
  "surface/disabled": {
    "dark": "#192024",
    "light": "#e8eef1"
  },
  "surface/inverse": {
    "dark": "#f4f7f9",
    "light": "#070b0d"
  },
  "surface/brand": {
    "dark": "#00e3c9",
    "light": "#007063"
  },
  "surface/brand-subtle": {
    "dark": "#002620",
    "light": "#dffff8"
  },
  "text/primary": {
    "dark": "#f4f7f9",
    "light": "#192024"
  },
  "text/secondary": {
    "dark": "#b8c7cf",
    "light": "#52636d"
  },
  "text/tertiary": {
    "dark": "#7f94a0",
    "light": "#687c87"
  },
  "text/disabled": {
    "dark": "#52636d",
    "light": "#9baeb9"
  },
  "text/inverse": {
    "dark": "#070b0d",
    "light": "#f4f7f9"
  },
  "text/brand": {
    "dark": "#00e3c9",
    "light": "#007063"
  },
  "text/on-brand": {
    "dark": "#070b0d",
    "light": "#ffffff"
  },
  "text/link": {
    "dark": "#00e3c9",
    "light": "#007063"
  },
  "text/code": {
    "dark": "#00fde1",
    "light": "#007063"
  },
  "border/subtle": {
    "dark": "#192024",
    "light": "#e8eef1"
  },
  "border/default": {
    "dark": "#283237",
    "light": "#d3dce2"
  },
  "border/strong": {
    "dark": "#3c4a52",
    "light": "#b8c7cf"
  },
  "border/brand": {
    "dark": "#008c7c",
    "light": "#00a895"
  },
  "border/focus": {
    "dark": "#00e3c9",
    "light": "#008c7c"
  },
  "border/inverse": {
    "dark": "#f4f7f9",
    "light": "#070b0d"
  },
  "icon/primary": {
    "dark": "#f4f7f9",
    "light": "#192024"
  },
  "icon/secondary": {
    "dark": "#b8c7cf",
    "light": "#52636d"
  },
  "icon/tertiary": {
    "dark": "#7f94a0",
    "light": "#687c87"
  },
  "icon/disabled": {
    "dark": "#52636d",
    "light": "#9baeb9"
  },
  "icon/brand": {
    "dark": "#00e3c9",
    "light": "#007063"
  },
  "icon/on-brand": {
    "dark": "#070b0d",
    "light": "#ffffff"
  },
  "action/primary/rest": {
    "dark": "#00e3c9",
    "light": "#007063"
  },
  "action/primary/hover": {
    "dark": "#00fde1",
    "light": "#00544a"
  },
  "action/primary/pressed": {
    "dark": "#00c6af",
    "light": "#003932"
  },
  "action/primary/disabled": {
    "dark": "#283237",
    "light": "#d3dce2"
  },
  "action/secondary/rest": {
    "dark": "#192024",
    "light": "#e8eef1"
  },
  "action/secondary/hover": {
    "dark": "#283237",
    "light": "#d3dce2"
  },
  "action/secondary/pressed": {
    "dark": "#3c4a52",
    "light": "#b8c7cf"
  },
  "action/danger/rest": {
    "dark": "#ff7f73",
    "light": "#e30018"
  },
  "action/danger/hover": {
    "dark": "#ffaba1",
    "light": "#b70011"
  },
  "action/danger/pressed": {
    "dark": "#ff3b38",
    "light": "#8b000a"
  },
  "status/success/fg": {
    "dark": "#00ea6e",
    "light": "#007533"
  },
  "status/success/surface": {
    "dark": "#00280c",
    "light": "#e5ffe9"
  },
  "status/success/border": {
    "dark": "#005724",
    "light": "#62fe90"
  },
  "status/success/solid": {
    "dark": "#00cd5f",
    "light": "#009141"
  },
  "status/warning/fg": {
    "dark": "#fdb500",
    "light": "#7e5900"
  },
  "status/warning/surface": {
    "dark": "#2c1c00",
    "light": "#fff6e6"
  },
  "status/warning/border": {
    "dark": "#5f4200",
    "light": "#ffd48a"
  },
  "status/warning/solid": {
    "dark": "#dd9e00",
    "light": "#9d6f00"
  },
  "status/danger/fg": {
    "dark": "#ffaba1",
    "light": "#b70011"
  },
  "status/danger/surface": {
    "dark": "#440001",
    "light": "#fff4f2"
  },
  "status/danger/border": {
    "dark": "#8b000a",
    "light": "#ffcdc6"
  },
  "status/danger/solid": {
    "dark": "#ff7f73",
    "light": "#e30018"
  },
  "status/info/fg": {
    "dark": "#98c8ff",
    "light": "#0061b0"
  },
  "status/info/surface": {
    "dark": "#001f41",
    "light": "#f1f8ff"
  },
  "status/info/border": {
    "dark": "#004886",
    "light": "#c1deff"
  },
  "status/info/solid": {
    "dark": "#65afff",
    "light": "#0079da"
  },
  "tool/capture/fg": {
    "dark": "#00e3c9",
    "light": "#007063"
  },
  "tool/capture/surface": {
    "dark": "#002620",
    "light": "#dffff8"
  },
  "tool/capture/border": {
    "dark": "#007063",
    "light": "#00e3c9"
  },
  "tool/capture/solid": {
    "dark": "#00c6af",
    "light": "#00a895"
  },
  "tool/annotate/fg": {
    "dark": "#ffb257",
    "light": "#885300"
  },
  "tool/annotate/surface": {
    "dark": "#301900",
    "light": "#fff5eb"
  },
  "tool/annotate/border": {
    "dark": "#885300",
    "light": "#ffb257"
  },
  "tool/annotate/solid": {
    "dark": "#ed9400",
    "light": "#c97d00"
  },
  "tool/inspect/fg": {
    "dark": "#ceb5ff",
    "light": "#7d00da"
  },
  "tool/inspect/surface": {
    "dark": "#2b0052",
    "light": "#f8f5ff"
  },
  "tool/inspect/border": {
    "dark": "#7d00da",
    "light": "#ceb5ff"
  },
  "tool/inspect/solid": {
    "dark": "#bb91ff",
    "light": "#a867ff"
  },
  "tool/measure/fg": {
    "dark": "#ffa4cc",
    "light": "#ad006c"
  },
  "tool/measure/surface": {
    "dark": "#3f0024",
    "light": "#fff3f8"
  },
  "tool/measure/border": {
    "dark": "#ad006c",
    "light": "#ffa4cc"
  },
  "tool/measure/solid": {
    "dark": "#ff72b7",
    "light": "#fe00a2"
  },
  "tool/compare/fg": {
    "dark": "#98c8ff",
    "light": "#0061b0"
  },
  "tool/compare/surface": {
    "dark": "#001f41",
    "light": "#f1f8ff"
  },
  "tool/compare/border": {
    "dark": "#0061b0",
    "light": "#98c8ff"
  },
  "tool/compare/solid": {
    "dark": "#65afff",
    "light": "#1592ff"
  },
  "tool/colors/fg": {
    "dark": "#ffb257",
    "light": "#885300"
  },
  "tool/colors/surface": {
    "dark": "#301900",
    "light": "#fff5eb"
  },
  "tool/colors/border": {
    "dark": "#885300",
    "light": "#ffb257"
  },
  "tool/colors/solid": {
    "dark": "#ed9400",
    "light": "#c97d00"
  },
  "tool/diff/added": {
    "dark": "#00ea6e",
    "light": "#009141"
  },
  "tool/diff/removed": {
    "dark": "#ffaba1",
    "light": "#e30018"
  },
  "tool/diff/added-wash": {
    "dark": "#00ea6e2e",
    "light": "#00914124"
  },
  "tool/diff/removed-wash": {
    "dark": "#ffaba12e",
    "light": "#e3001824"
  },
  "overlay/scrim": {
    "dark": "#070b0d9e",
    "light": "#070b0d7a"
  },
  "overlay/scrim-soft": {
    "dark": "#070b0d59",
    "light": "#070b0d3d"
  },
  "overlay/glass": {
    "dark": "#0e1416c7",
    "light": "#ffffffd1"
  },
  "overlay/mask": {
    "dark": "#070b0d8c",
    "light": "#070b0d66"
  },
  "overlay/grid": {
    "dark": "#00e3c91a",
    "light": "#0070631f"
  },
  "overlay/marquee-fill": {
    "dark": "#00e3c91a",
    "light": "#00e3c924"
  },
  "overlay/highlight": {
    "dark": "#00e3c929",
    "light": "#00e3c933"
  },
  "overlay/measure-wash": {
    "dark": "#fe00a229",
    "light": "#fe00a229"
  },
  "overlay/inspect-wash": {
    "dark": "#a867ff29",
    "light": "#a867ff29"
  },
  "overlay/padding-wash": {
    "dark": "#00ea6e33",
    "light": "#00ea6e38"
  },
  "overlay/margin-wash": {
    "dark": "#ffb25733",
    "light": "#ffb25738"
  },
  "overlay/hairline": {
    "dark": "#ffffff14",
    "light": "#070b0d14"
  },
  "focus/ring": {
    "dark": "#00e3c98c",
    "light": "#008c7c8c"
  },
  "focus/ring-offset": {
    "dark": "#070b0d",
    "light": "#ffffff"
  }
}

/** يحوّل توكنًا دلاليًّا إلى قيمة سداسية في وضع محدَّد. */
export function resolveColor(token: SemanticToken, mode: 'dark' | 'light' = 'dark'): string {
  return SEMANTIC_HEX[token][mode]
}

export const SEMANTIC_TOKENS = [
  "surface/canvas",
  "surface/default",
  "surface/raised",
  "surface/overlay",
  "surface/sunken",
  "surface/hover",
  "surface/pressed",
  "surface/selected",
  "surface/disabled",
  "surface/inverse",
  "surface/brand",
  "surface/brand-subtle",
  "text/primary",
  "text/secondary",
  "text/tertiary",
  "text/disabled",
  "text/inverse",
  "text/brand",
  "text/on-brand",
  "text/link",
  "text/code",
  "border/subtle",
  "border/default",
  "border/strong",
  "border/brand",
  "border/focus",
  "border/inverse",
  "icon/primary",
  "icon/secondary",
  "icon/tertiary",
  "icon/disabled",
  "icon/brand",
  "icon/on-brand",
  "action/primary/rest",
  "action/primary/hover",
  "action/primary/pressed",
  "action/primary/disabled",
  "action/secondary/rest",
  "action/secondary/hover",
  "action/secondary/pressed",
  "action/danger/rest",
  "action/danger/hover",
  "action/danger/pressed",
  "status/success/fg",
  "status/success/surface",
  "status/success/border",
  "status/success/solid",
  "status/warning/fg",
  "status/warning/surface",
  "status/warning/border",
  "status/warning/solid",
  "status/danger/fg",
  "status/danger/surface",
  "status/danger/border",
  "status/danger/solid",
  "status/info/fg",
  "status/info/surface",
  "status/info/border",
  "status/info/solid",
  "tool/capture/fg",
  "tool/capture/surface",
  "tool/capture/border",
  "tool/capture/solid",
  "tool/annotate/fg",
  "tool/annotate/surface",
  "tool/annotate/border",
  "tool/annotate/solid",
  "tool/inspect/fg",
  "tool/inspect/surface",
  "tool/inspect/border",
  "tool/inspect/solid",
  "tool/measure/fg",
  "tool/measure/surface",
  "tool/measure/border",
  "tool/measure/solid",
  "tool/compare/fg",
  "tool/compare/surface",
  "tool/compare/border",
  "tool/compare/solid",
  "tool/colors/fg",
  "tool/colors/surface",
  "tool/colors/border",
  "tool/colors/solid",
  "tool/diff/added",
  "tool/diff/removed",
  "tool/diff/added-wash",
  "tool/diff/removed-wash",
  "overlay/scrim",
  "overlay/scrim-soft",
  "overlay/glass",
  "overlay/mask",
  "overlay/grid",
  "overlay/marquee-fill",
  "overlay/highlight",
  "overlay/measure-wash",
  "overlay/inspect-wash",
  "overlay/padding-wash",
  "overlay/margin-wash",
  "overlay/hairline",
  "focus/ring",
  "focus/ring-offset"
] as const

export const TEXT_STYLES = [
  "Latin/Display/2XL",
  "Latin/Display/XL",
  "Latin/Display/L",
  "Latin/Display/M",
  "Latin/Display/S",
  "Latin/Heading/XL",
  "Latin/Heading/L",
  "Latin/Heading/M",
  "Latin/Heading/S",
  "Latin/Heading/XS",
  "Latin/Body/L",
  "Latin/Body/M",
  "Latin/Body/S",
  "Latin/Body/L Strong",
  "Latin/Body/M Strong",
  "Latin/Body/S Strong",
  "Latin/UI/L",
  "Latin/UI/M",
  "Latin/UI/S",
  "Latin/UI/XS",
  "Latin/UI/L Strong",
  "Latin/UI/M Strong",
  "Latin/UI/S Strong",
  "Latin/UI/XS Strong",
  "Latin/Label/M",
  "Latin/Label/S",
  "Latin/Label/XS",
  "Arabic/Display/2XL",
  "Arabic/Display/XL",
  "Arabic/Display/L",
  "Arabic/Display/M",
  "Arabic/Display/S",
  "Arabic/Heading/XL",
  "Arabic/Heading/L",
  "Arabic/Heading/M",
  "Arabic/Heading/S",
  "Arabic/Heading/XS",
  "Arabic/Body/L",
  "Arabic/Body/M",
  "Arabic/Body/S",
  "Arabic/Body/L Strong",
  "Arabic/Body/M Strong",
  "Arabic/Body/S Strong",
  "Arabic/UI/L",
  "Arabic/UI/M",
  "Arabic/UI/S",
  "Arabic/UI/XS",
  "Arabic/UI/L Strong",
  "Arabic/UI/M Strong",
  "Arabic/UI/S Strong",
  "Arabic/UI/XS Strong",
  "Arabic/Label/M",
  "Arabic/Label/S",
  "Arabic/Label/XS",
  "Mono/L",
  "Mono/M",
  "Mono/S",
  "Mono/XS",
  "Mono/2XS",
  "Mono/M Strong",
  "Mono/S Strong",
  "Mono/XS Strong"
] as const
