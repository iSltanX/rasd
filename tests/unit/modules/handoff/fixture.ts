import type { HandoffMeta, HandoffOptions } from '@/modules/handoff/model'
import type { ElementIdentity, IssueRecord } from '@/shared/issue-schema'

/**
 * المشكلة المعروفة — مدخل لقطة Markdown المرجعية (`tests/fixtures/handoff/known-issue.md`).
 *
 * سجلٌّ صريح لا مبنيٌّ بـ`buildIssue`: اللقطة المرجعية عقدٌ على المخرَج، فلا يتبدّل مدخلها لأن دالّة بناءٍ
 * أخرى تغيّرت. والرابط يحمل استعلامًا عمدًا — الحزمة تحذفه افتراضيًّا، واللقطة تثبت ذلك.
 */

const at = (day: number, hour: number, minute = 0): number => Date.UTC(2026, 8, day, hour, minute)

export function identity(over: Partial<ElementIdentity> = {}): ElementIdentity {
  return {
    selector: '.cta-btn',
    unique: true,
    positional: false,
    inShadow: false,
    hosts: [],
    fingerprint: { tag: 'button', attrs: ['class', 'type'], textHash: '1a2b3c4d', textLength: 9 },
    rect: { x: 628, y: 412, width: 184, height: 48 },
    ...over,
  }
}

export const KNOWN_ISSUE: IssueRecord = {
  id: 'issue-cta-padding',
  schemaVersion: 1,
  projectId: 'project-platform',
  createdAt: at(28, 10, 12),
  updatedAt: at(30, 9),
  page: {
    url: 'https://northwind.com/pricing?plan=pro&utm_source=mail',
    origin: 'https://northwind.com',
    path: '/pricing',
    title: 'Pricing — Northwind',
    viewport: { width: 1440, height: 900, dpr: 2 },
  },
  element: identity(),
  pair: null,
  check: {
    kind: 'style',
    property: 'padding',
    actual: '14px 24px',
    expected: '12px 24px',
    tolerance: 0,
  },
  status: 'open',
  lastCheck: { at: at(30, 9), outcome: 'mismatch', observed: '14px 24px', reason: null },
  history: [
    {
      kind: 'check',
      at: at(30, 9),
      status: 'open',
      outcome: 'mismatch',
      observed: '14px 24px',
      reason: null,
    },
    { kind: 'created', at: at(28, 10, 12), status: 'open', observed: '14px 24px' },
  ],
  evidence: {
    captureId: 'capture-cta',
    snapshot: {
      padding: '14px 24px',
      margin: '0px',
      gap: 'normal',
      width: '184px',
      height: '48px',
      'font-size': '16px',
      'font-weight': '600',
      'line-height': '24px',
      color: '#FFFFFF',
      'background-color': '#2563EB',
      'border-radius': '8px',
    },
    crop: { x: 48, y: 48, width: 368, height: 96 },
  },
  note: { captureId: 'capture-cta', noteId: 'note-cta' },
  title: 'حشوة الزرّ الرئيسي أكبر من التصميم',
  body: 'الحشوة الرأسية أكبر بـ2px من إطار Figma.\nالأفقية مطابقة.',
  steps: [
    'افتح صفحة الأسعار على مقاس سطح المكتب.',
    'مرّر إلى بطاقة الخطّة الاحترافية.',
    'قارن حشوة زرّ «ابدأ الآن» بالتصميم.',
  ],
}

/** مشكلة مسافة بين عنصرين — لا خصائص CSS فيها، والعنصر الثاني موضعيّ. */
export const SPACING_ISSUE: IssueRecord = {
  ...KNOWN_ISSUE,
  id: 'issue-hero-gap',
  element: identity({ selector: '.hero-actions .primary' }),
  pair: identity({ selector: '.hero-actions > a:nth-child(2)', positional: true, unique: true }),
  check: { kind: 'spacing', property: 'gap-left', actual: '12px', expected: '16px', tolerance: 1 },
  status: 'needs-verification',
  lastCheck: { at: at(30, 9), outcome: 'not-found', observed: null, reason: 'missing' },
  evidence: {
    captureId: 'capture-gap',
    snapshot: { 'gap-top': '0px', 'gap-left': '12px' },
    crop: { x: 48, y: 48, width: 600, height: 120 },
  },
  note: null,
  title: 'الفجوة بين زرّي البطل أصغر من التصميم',
  body: '',
  steps: [],
}

/** مشكلة تباين داخل جذر ظلّ — المتوقَّعة حدٌّ أدنى. */
export const CONTRAST_ISSUE: IssueRecord = {
  ...KNOWN_ISSUE,
  id: 'issue-badge-contrast',
  element: identity({ selector: 'span.badge', inShadow: true, hosts: ['pricing-card'] }),
  check: {
    kind: 'contrast',
    property: 'color/background-color',
    actual: '3.68',
    expected: '4.5',
    tolerance: 0,
  },
  status: 'resolved',
  lastCheck: { at: at(30, 9), outcome: 'match', observed: '4.61', reason: null },
  evidence: {
    captureId: 'capture-badge',
    snapshot: { color: '#6D28D9', 'background-color': '#EDE9FE', 'color/background-color': '3.68' },
    crop: { x: 48, y: 48, width: 120, height: 40 },
  },
  title: 'تباين الشارة دون الحدّ',
  body: '',
  steps: [],
}

/** مشكلة لون — لونها المتوقَّع يخرج متغيّرًا عبر `exportPalette`. */
export const COLOUR_ISSUE: IssueRecord = {
  ...KNOWN_ISSUE,
  id: 'issue-link-colour',
  element: identity({ selector: 'a.more' }),
  check: {
    kind: 'colour',
    property: 'color',
    actual: '#2563EB',
    expected: '#6D28D9',
    tolerance: 2,
  },
  lastCheck: null,
  evidence: {
    captureId: 'capture-link',
    snapshot: { 'background-color': '#FFFFFF', color: '#2563EB', 'border-top-color': '#2563EB' },
    crop: { x: 48, y: 48, width: 90, height: 30 },
  },
  title: 'لون رابط «المزيد» لا يطابق',
  body: '',
  steps: [],
}

export const OPTIONS: HandoffOptions = { images: true, properties: true, keepQuery: false }

export const META: HandoffMeta = {
  source: 'مشروع «منصّة ٢٫٠»',
  generatedAt: at(30, 12),
  version: '0.1.0',
}
