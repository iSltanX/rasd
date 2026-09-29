/**
 * سجلّ العرض — يربط كل مصفوفة variant في `matrices.ts` بدالة عرض حقيقية.
 *
 * **مستهلكان لسجلّ واحد:** صفحة المعرض تستدعي `render(combo)` لكل تركيبة
 * وتضعها في الشبكة، واختبار `render-all.test.tsx` يستدعي الدالّة نفسها
 * ويؤكّد أنها لا ترمي. لا فرصة لانحراف بين ما يُعرض وما يُختبر.
 */
import { KeyCap } from '../TechnicalValue'

import { MATRICES, type ComponentMatrix } from './matrices'

import {
  AppSidebar,
  Avatar,
  Banner,
  Button,
  Checkbox,
  Chip,
  EmptyState,
  ErrorMessage,
  Field,
  Footer,
  IconButton,
  Input,
  Menu,
  NavItem,
  OptionCard,
  ProgressBar,
  Radio,
  SectionNav,
  SegmentedControl,
  Select,
  SettingRow,
  Skeleton,
  Slider,
  Spinner,
  StorageMeter,
  Tab,
  TabRow,
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
      detail="محفوظة على هذا الجهاز"
      onDismiss={() => undefined}
    >
      حُفظت اللقطة في المكتبة
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

/** أقسام الإعدادات التسعة بأيقوناتها كما في `Section Nav` (`280:740`). */
const SECTIONS = [
  { id: 'capture', label: 'التصوير', icon: 'capture-area' },
  { id: 'annotation', label: 'التعليقات', icon: 'pen' },
  { id: 'colors', label: 'الألوان', icon: 'eyedropper' },
  { id: 'appearance', label: 'المظهر', icon: 'swatches' },
  { id: 'shortcuts', label: 'الاختصارات', icon: 'keyboard' },
  { id: 'privacy', label: 'الخصوصية', icon: 'shield' },
  { id: 'data', label: 'البيانات', icon: 'folder' },
  { id: 'integrations', label: 'التكاملات', icon: 'plug' },
  { id: 'about', label: 'عن رصد', icon: 'info' },
] as const

const MB = 1024 * 1024

const NEW_RENDERERS: Record<string, RenderFn> = {
  'Nav Item': (c) => (
    <NavItem
      icon="grid-view"
      label="كل اللقطات"
      count={c.count === 'on' ? 248 : undefined}
      state={c.state as never}
    />
  ),
  Select: (c) => (
    <Select
      value="png"
      options={[
        { value: 'png', label: 'PNG' },
        { value: 'webp', label: 'WebP' },
      ]}
      state={c.state as never}
      aria-label="الصيغة الافتراضية"
    />
  ),
  'Storage Meter': (c) => (
    <div style={{ inlineSize: 'calc(var(--rasd-space-160) + var(--rasd-space-56))' }}>
      <StorageMeter
        usage={c.level === 'unknown' ? null : c.level === 'near-full' ? 900 * MB : 184 * MB}
        quota={c.level === 'unknown' ? null : 1024 * MB}
        level={c.level as never}
      />
    </div>
  ),
  'Setting Row': (c) => (
    <SettingRow
      label="افتح المحرّر بعد الالتقاط"
      hint="انتقل مباشرة إلى التعليق"
      divider={c.divider === 'on'}
      control={
        c.control === 'toggle' ? (
          <Toggle on aria-label="افتح المحرّر بعد الالتقاط" />
        ) : c.control === 'select' ? (
          <Select value="png" options={[{ value: 'png', label: 'PNG' }]} aria-label="الصيغة" />
        ) : c.control === 'key' ? (
          <KeyCap>⇧⌘T</KeyCap>
        ) : c.control === 'chip' ? (
          <Chip tone="neutral">قريبًا</Chip>
        ) : c.control === 'button' ? (
          <Button variant="secondary" size="s">
            استعِد
          </Button>
        ) : undefined
      }
    />
  ),
  Footer: (c) => <Footer layout={c.layout as never} showRepo={c.repo === 'shown'} />,
  'Error Message': (c) => (
    <ErrorMessage
      layout={c.layout as never}
      title="تعذّر حفظ اللقطة"
      body="المساحة على هذا الجهاز لا تكفي. احذف لقطات قديمة ثمّ أعد المحاولة."
      onRetry={() => undefined}
    />
  ),
  Tab: (c) => (
    <TabRow aria-label="أقسام اللوح">
      <Tab label="الأنماط" state={c.state as never} />
    </TabRow>
  ),
  'Option Card': (c) => (
    <div role="radiogroup" aria-label="الصيغة">
      <OptionCard
        icon="image"
        title="PNG"
        hint={c.state === 'disabled' ? 'قريبًا' : 'بلا فقد'}
        name={`format-${c.state}`}
        value="png"
        state={c.state as never}
      />
    </div>
  ),
  Field: (c) => (
    <Field
      id={`field-${c.lines}-${c.state}`}
      label="عنوان المشكلة"
      value=""
      placeholder="اكتب هنا"
      hint={c.state === 'error' ? 'اكتب عنوانًا من كلمتين على الأقل' : 'تلميح'}
      multiline={c.lines === 'multi'}
      state={c.state as never}
    />
  ),
  'Section Nav': () => (
    <SectionNav
      entries={SECTIONS}
      activeId="capture"
      onSelect={() => undefined}
      aria-label="أقسام الإعدادات"
    />
  ),
  'App Sidebar': () => (
    <AppSidebar
      activeId="all"
      primaryAction={{ label: 'لقطة جديدة', icon: 'capture-area', onClick: () => undefined }}
      groups={[
        {
          entries: [
            { id: 'all', icon: 'grid-view', label: 'كل اللقطات', count: 248 },
            { id: 'favorites', icon: 'star', label: 'المميّزة', count: 12 },
            { id: 'recent', icon: 'history', label: 'الأخيرة', count: 36 },
          ],
        },
        {
          title: 'المجموعات',
          entries: [
            { id: 'palettes', icon: 'swatches', label: 'اللوحات', count: 19 },
            { id: 'references', icon: 'image', label: 'المراجع', count: 8 },
            { id: 'guides', icon: 'file-code', label: 'أدلة الخطوات', count: 5 },
          ],
        },
      ]}
      storage={{ usage: 184 * MB, quota: 1024 * MB }}
      settings={{ id: 'settings', icon: 'settings', label: 'الإعدادات' }}
    />
  ),
}

Object.assign(RENDERERS, NEW_RENDERERS)

export function rendererFor(matrix: ComponentMatrix): RenderFn {
  const fn = RENDERERS[matrix.name]
  if (!fn) throw new Error(`لا دالّة عرض مسجَّلة للمجموعة ${matrix.name}`)
  return fn
}

export { MATRICES }
