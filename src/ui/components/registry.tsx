/**
 * سجلّ العرض — يربط كل مصفوفة variant في `matrices.ts` بدالة عرض حقيقية.
 *
 * **مستهلكان لسجلّ واحد:** صفحة المعرض تستدعي `render(combo)` لكل تركيبة
 * وتضعها في الشبكة، واختبار `render-all.test.tsx` يستدعي الدالّة نفسها
 * ويؤكّد أنها لا ترمي. لا فرصة لانحراف بين ما يُعرض وما يُختبر.
 */
import { MATRICES, type ComponentMatrix } from './matrices'

import {
  Avatar,
  Banner,
  Button,
  Checkbox,
  Chip,
  EmptyState,
  IconButton,
  Input,
  Menu,
  ProgressBar,
  Radio,
  SegmentedControl,
  Skeleton,
  Slider,
  Spinner,
  Tabs,
  Toast,
  Toggle,
  ToolCard,
  Tooltip,
} from './index'

import type { JSX } from 'preact'

export type RenderFn = (combo: Record<string, string>) => JSX.Element

const SEGMENTS = [
  { value: 'a', label: 'أ' },
  { value: 'b', label: 'ب' },
  { value: 'c', label: 'ج' },
]
const TABS = [
  { value: 't1', label: 'اللقطات' },
  { value: 't2', label: 'الألوان' },
  { value: 't3', label: 'المشاريع' },
  { value: 't4', label: 'الأدلة' },
]

export const RENDERERS: Record<string, RenderFn> = {
  Button: (c) => (
    <Button
      variant={c.variant as never}
      size={c.size as never}
      state={c.state as never}
      icon="capture-area"
    >
      التقاط
    </Button>
  ),
  'Icon Button': (c) => (
    <IconButton
      icon="settings"
      aria-label="الإعدادات"
      variant={c.variant as never}
      size={c.size as never}
      state={c.state as never}
    />
  ),
  Input: (c) => (
    <Input
      placeholder="ابحث في المكتبة"
      size={c.size as never}
      state={c.state as never}
      aria-label="بحث"
    />
  ),
  Checkbox: (c) => (
    <Checkbox
      checked={c.checked as never}
      state={c.state as never}
      label="إخفاء الألوان الحيادية"
    />
  ),
  Toggle: (c) => <Toggle on={c.on === 'on'} state={c.state as never} label="الحفظ المحلي" />,
  Chip: (c) => (
    <Chip tone={c.tone as never} style={c.style as never}>
      خطأ بصري
    </Chip>
  ),
  'Progress Bar': (c) => <ProgressBar value={Number(c.value)} label="تقدّم الالتقاط" />,
  'Segmented Control': (c) => (
    <SegmentedControl
      options={SEGMENTS}
      selected={Number(c.selected) - 1}
      aria-label="عرض المكتبة"
    />
  ),
  Spinner: (c) => <Spinner size={c.size as never} tone={c.tone as never} />,
  Radio: (c) => (
    <Radio
      selected={c.selected as never}
      state={c.state as never}
      label="سطح المكتب"
      name={`r-${c.selected}-${c.state}`}
    />
  ),
  Slider: (c) => <Slider value={Number(c.value)} state={c.state as never} aria-label="الشفافية" />,
  Tabs: (c) => {
    const selected = Number(c.selected) - 1
    return (
      <div>
        <Tabs items={TABS} selected={selected} />
        {/* لوحات حقيقية تطابق `aria-controls` — بلا هذا يشير كل تبويب إلى
            معرّف لا وجود له في شجرة الصفحة. */}
        {TABS.map((tab, i) => (
          <div
            key={tab.value}
            role="tabpanel"
            id={`rasd-panel-${tab.value}`}
            aria-labelledby={`rasd-tab-${tab.value}`}
            hidden={i !== selected}
          />
        ))}
      </div>
    )
  },
  Avatar: (c) => <Avatar name="سارة أحمد" size={c.size as never} type={c.type as never} />,
  Tooltip: (c) => (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <Tooltip side={c.side as never} type={c.type as never} shortcut="⌥⇧I" forceOpen>
        فحص العنصر
      </Tooltip>
    </span>
  ),
  Toast: (c) => (
    <Toast
      tone={c.tone as never}
      action={c.action as never}
      actionLabel="تراجع"
      onDismiss={() => undefined}
    >
      تم حفظ اللقطة في المكتبة
    </Toast>
  ),
  Banner: (c) => <Banner tone={c.tone as never}>وضع التصفّح الخاص نشط — لا حفظ تلقائي</Banner>,
  'Empty State': (c) => <EmptyState kind={c.kind as never} />,
  Skeleton: (c) => <Skeleton kind={c.kind as never} />,
  Menu: (c) => (
    <Menu
      type={c.type as never}
      sections={
        c.type === 'with-sections'
          ? [
              { title: 'الالتقاط', items: [{ value: 'a', label: 'منطقة', icon: 'capture-area' }] },
              { title: 'الفحص', items: [{ value: 'b', label: 'عنصر', icon: 'inspect' }] },
            ]
          : [
              {
                items: [
                  { value: 'a', label: 'نسخ', icon: 'copy' },
                  { value: 'b', label: 'تنزيل', icon: 'download' },
                  { value: 'c', label: 'حذف', icon: 'trash', disabled: true },
                ],
              },
            ]
      }
    />
  ),
  'Tool Card': (c) => (
    <ToolCard
      icon={c.tool === 'capture' ? 'capture-area' : 'inspect'}
      title={c.tool === 'capture' ? 'تصوير جزء' : 'فحص عنصر'}
      hint="اختصار ⌥⇧"
      tool={c.tool as never}
      state={c.state as never}
    />
  ),
}

export function rendererFor(matrix: ComponentMatrix): RenderFn {
  const fn = RENDERERS[matrix.name]
  if (!fn) throw new Error(`لا دالّة عرض مسجَّلة للمجموعة ${matrix.name}`)
  return fn
}

export { MATRICES }
