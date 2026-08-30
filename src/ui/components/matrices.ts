/**
 * محاور الـvariant لكل مجموعة، كما في `12 — Components` بالضبط.
 *
 * **مصدر واحد يستهلكه طرفان:** صفحة المعرض تعرض حاصل الضرب الديكارتي لكل
 * مصفوفة (فتُطابق عدد variants في Figma حرفيًا)، واختبار الوحدة يُشغّل نفس
 * الحاصل على كل مكوّن ويؤكّد أنه يُصيّر بلا خطأ. لا عدّ مزدوج ولا نسيان.
 *
 * الأعداد مذكورة هنا كتوثيق يقارنه الاختبار بالحاصل الفعلي — لا اعتماد عليها
 * مباشرة.
 */

export interface VariantAxis {
  readonly prop: string
  readonly values: readonly string[]
}

export interface ComponentMatrix {
  readonly name: string
  /** عدد الـvariants في Figma — يقارنه الاختبار بحاصل ضرب المحاور. */
  readonly figmaCount: number
  readonly axes: readonly VariantAxis[]
}

export const MATRICES: readonly ComponentMatrix[] = [
  {
    name: 'Button',
    figmaCount: 72,
    axes: [
      { prop: 'variant', values: ['primary', 'secondary', 'ghost', 'danger'] },
      { prop: 'size', values: ['s', 'm', 'l'] },
      { prop: 'state', values: ['default', 'hover', 'pressed', 'disabled', 'focused', 'loading'] },
    ],
  },
  {
    name: 'Icon Button',
    figmaCount: 36,
    axes: [
      { prop: 'variant', values: ['ghost', 'solid'] },
      { prop: 'size', values: ['s', 'm', 'l'] },
      { prop: 'state', values: ['default', 'hover', 'pressed', 'disabled', 'focused', 'selected'] },
    ],
  },
  {
    name: 'Input',
    figmaCount: 10,
    axes: [
      { prop: 'size', values: ['m', 'l'] },
      { prop: 'state', values: ['default', 'hover', 'focus', 'error', 'disabled'] },
    ],
  },
  {
    name: 'Checkbox',
    figmaCount: 12,
    axes: [
      { prop: 'checked', values: ['off', 'on', 'mixed'] },
      { prop: 'state', values: ['default', 'hover', 'focus', 'disabled'] },
    ],
  },
  {
    name: 'Toggle',
    figmaCount: 8,
    axes: [
      { prop: 'on', values: ['off', 'on'] },
      { prop: 'state', values: ['default', 'hover', 'focus', 'disabled'] },
    ],
  },
  {
    name: 'Chip',
    figmaCount: 18,
    axes: [
      {
        prop: 'tone',
        values: [
          'neutral',
          'brand',
          'capture',
          'annotate',
          'inspect',
          'measure',
          'success',
          'warning',
          'danger',
        ],
      },
      { prop: 'style', values: ['soft', 'solid'] },
    ],
  },
  {
    name: 'Progress Bar',
    figmaCount: 4,
    axes: [{ prop: 'value', values: ['0', '35', '65', '100'] }],
  },
  {
    name: 'Segmented Control',
    figmaCount: 3,
    axes: [{ prop: 'selected', values: ['1', '2', '3'] }],
  },
  {
    name: 'Spinner',
    figmaCount: 9,
    axes: [
      { prop: 'size', values: ['s', 'm', 'l'] },
      { prop: 'tone', values: ['brand', 'neutral', 'inverse'] },
    ],
  },
  {
    name: 'Radio',
    figmaCount: 8,
    axes: [
      { prop: 'selected', values: ['off', 'on'] },
      { prop: 'state', values: ['default', 'hover', 'focus', 'disabled'] },
    ],
  },
  {
    name: 'Slider',
    figmaCount: 16,
    axes: [
      { prop: 'value', values: ['0', '35', '70', '100'] },
      { prop: 'state', values: ['default', 'hover', 'focus', 'disabled'] },
    ],
  },
  { name: 'Tabs', figmaCount: 4, axes: [{ prop: 'selected', values: ['1', '2', '3', '4'] }] },
  {
    name: 'Avatar',
    figmaCount: 8,
    axes: [
      { prop: 'size', values: ['xs', 's', 'm', 'l'] },
      { prop: 'type', values: ['initials', 'colour'] },
    ],
  },
  {
    name: 'Tooltip',
    figmaCount: 8,
    axes: [
      { prop: 'side', values: ['top', 'bottom', 'left', 'right'] },
      { prop: 'type', values: ['plain', 'shortcut'] },
    ],
  },
  {
    name: 'Toast',
    figmaCount: 8,
    axes: [
      { prop: 'tone', values: ['success', 'info', 'warning', 'danger'] },
      { prop: 'action', values: ['with-action', 'plain'] },
    ],
  },
  {
    name: 'Banner',
    figmaCount: 4,
    axes: [{ prop: 'tone', values: ['info', 'warning', 'danger', 'success'] }],
  },
  {
    // المرحلة 18 أضافت variant خامس `no-projects` (§10.2) في EmptyState.tsx
    // نفسها — بلا إطار Figma مقابل بعد، فبقي خارج هذه المصفوفة عمدًا: إدراجه
    // هنا يعني ادّعاء تطابق مع Figma لا وجود له. يُضاف حين يُرسَم الإطار في
    // المرحلة 26 (Visual QA مقابل Figma) — لا يُخترَع هنا.
    name: 'Empty State',
    figmaCount: 4,
    axes: [{ prop: 'kind', values: ['no-captures', 'no-results', 'no-reference', 'no-palette'] }],
  },
  { name: 'Skeleton', figmaCount: 3, axes: [{ prop: 'kind', values: ['card', 'row', 'panel'] }] },
  { name: 'Menu', figmaCount: 2, axes: [{ prop: 'type', values: ['default', 'with-sections'] }] },
  {
    name: 'Tool Card',
    figmaCount: 12,
    axes: [
      { prop: 'tool', values: ['capture', 'inspect'] },
      {
        prop: 'state',
        values: ['default', 'hover', 'pressed', 'focused', 'selected', 'disabled'],
      },
    ],
  },
]

/** حاصل الضرب الديكارتي لمحاور مصفوفة — كل تركيبة variant ممكنة. */
export function cartesian(axes: readonly VariantAxis[]): Record<string, string>[] {
  return axes.reduce<Record<string, string>[]>(
    (acc, axis) =>
      acc.flatMap((combo) => axis.values.map((value) => ({ ...combo, [axis.prop]: value }))),
    [{}],
  )
}

/** عدد التركيبات لمصفوفة — يجب أن يساوي `figmaCount`. */
export function combinationCount(axes: readonly VariantAxis[]): number {
  return axes.reduce((n, axis) => n * axis.values.length, 1)
}
