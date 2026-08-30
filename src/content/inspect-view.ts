/**
 * يحوّل لقطة الفحص إلى صفوف اللوحة.
 *
 * **يعيش في `content/` لا في `ui/`**: البناء يحتاج القاعدة الفائزة وتتبّع
 * المتغيّر، وكلاهما من `modules/` — و`ui/` مسموح له بالاستيراد منها لكنّ
 * اللوحة يجب أن تبقى عرضًا خالصًا يقبل صفوفًا جاهزة، فتُختبَر بلا محرّك.
 */

import { GROUP_LABELS, INSPECT_GROUPS, type InspectGroup } from '@/shared/inspect-schema'

import type { InspectDetail } from './tools/inspect'
import type { InspectGroupView, InspectRow, InspectTabId } from '@/ui/overlay'

/** التسميات العربية لكل خاصّية — ما يراه المستخدم بدل اسم CSS الخام. */
const LABELS: Record<string, string> = {
  display: 'العرض',
  position: 'الموضع',
  width: 'العرض',
  height: 'الارتفاع',
  'z-index': 'التكديس',
  opacity: 'الشفافية',
  'font-family': 'الخط',
  'font-size': 'الحجم',
  'font-weight': 'الوزن',
  'line-height': 'السطر',
  'letter-spacing': 'التباعد',
  'text-align': 'المحاذاة',
  direction: 'الاتجاه',
  color: 'لون النص',
  'background-color': 'الخلفية',
  'border-block-start-color': 'لون الحد',
  'outline-color': 'لون الإطار',
  'box-shadow': 'الظل',
  'background-image': 'التدرّج',
  'row-gap': 'الفجوة',
  'column-gap': 'الفجوة الأفقية',
}

const label = (prop: string): string => LABELS[prop] ?? prop

/** هل القيمة تستحقّ العرض؟ الابتدائية عديمة المعنى تُطوى. */
function meaningful(value: string): boolean {
  const v = value.trim()
  return v !== '' && v !== 'none' && v !== 'normal' && v !== 'auto' && v !== '0px'
}

const COLOUR_PROPS = new Set([
  'color',
  'background-color',
  'border-block-start-color',
  'outline-color',
])

function rowsOf(detail: InspectDetail, group: InspectGroup): InspectRow[] {
  const out: InspectRow[] = []

  for (const prop of INSPECT_GROUPS[group]) {
    const entry = detail.snapshot.styles[prop]
    if (!entry || !meaningful(entry.value)) continue

    const row: InspectRow = { label: label(prop), value: entry.value }
    const trace = detail.vars.get(prop)
    const link = trace?.chain[0]

    out.push({
      ...row,
      ...(COLOUR_PROPS.has(prop) ? { swatch: entry.value } : {}),
      ...(link ? { varName: link.name } : {}),
      ...(trace ? { varAt: describeProvenance(trace) } : {}),
    })
  }

  return out
}

/**
 * يصف مكان تعريف المتغيّر بالعربية.
 *
 * **يميّز «لا نعرف» عن «لا يوجد»** — وهو ما يمنع الفاحص من الكذب فوق
 * الأوراق المحجوبة، حيث الاسم والقيمة معروفان والمكان لا.
 */
function describeProvenance(
  trace: InspectDetail['vars'] extends ReadonlyMap<string, infer V> ? V : never,
): string {
  const p = trace.provenance
  switch (p.kind) {
    case 'declared': {
      const el = p.at
      const where = el.id
        ? `#${el.id}`
        : el === el.ownerDocument.documentElement
          ? ':root'
          : el.localName
      return p.rule?.selector ?? where
    }
    case 'opaque':
      return `تعذّر تحديد المكان — ${p.unreadableSheets} ورقة محجوبة`
    case 'unverified':
      return 'تعذّر تحديد المكان'
    case 'none':
      return 'بلا متغيّر'
  }
}

/** يبني محتوى التبويبات الخمسة. */
export function buildGroups(
  detail: InspectDetail,
): Readonly<Record<InspectTabId, readonly InspectGroupView[]>> {
  const g = (name: InspectGroup): InspectGroupView => ({
    title: GROUP_LABELS[name],
    rows: rowsOf(detail, name),
  })

  const nonEmpty = (views: InspectGroupView[]) => views.filter((v) => v.rows.length > 0)

  return {
    // `الأنماط` ملخّص: يجمع الثلاثة كما في الملفّ، رغم أن اثنتين منها
    // تبويبان مستقلّان أيضًا. عيبٌ في الملفّ يُسجَّل ولا يُصلَح هنا.
    styles: nonEmpty([g('element'), g('text'), g('colour')]),
    box: nonEmpty([g('spacing')]),
    text: nonEmpty([g('text')]),
    colour: nonEmpty([g('colour')]),
    a11y: [],
  }
}
