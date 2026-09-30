/**
 * عارض JSON لحزمة التسليم — مخطّط `rasd.handoff/1` المنشور (ADR 0036 §4، `Docs/Handoff.md`).
 *
 * **عقدٌ خارجي:** أي تغيير هنا يرفع رقم المخطّط، ولا يُحذف حقل في نسخة واحدة. والغائب `null` لا حقلٌ
 * محذوف، والأزمنة ISO 8601 بـUTC. ويقرأ النموذج وحده كعارض Markdown.
 *
 * `modules/` منطق خالص: لا DOM ولا `chrome.*`.
 */

import { HANDOFF_SCHEMA } from './schema'

import type { HandoffElement, HandoffEntry, HandoffModel, HandoffOptions } from './model'
import type { HandoffProperties } from './properties'
import type {
  CheckKind,
  CheckOutcome,
  IssueStatus,
  PageBox,
  RecheckReason,
} from '@/shared/issue-schema'

export interface HandoffJsonIssue {
  readonly id: string
  readonly ordinal: number
  readonly title: string
  readonly body: string
  readonly status: IssueStatus
  readonly createdAt: string
  readonly lastCheck: {
    readonly at: string
    readonly outcome: CheckOutcome
    readonly observed: string | null
    readonly reason: RecheckReason | null
  } | null
  readonly page: {
    readonly url: string
    readonly title: string
    readonly viewport: { readonly width: number; readonly height: number; readonly dpr: number }
  }
  readonly element: HandoffElement
  readonly pair: HandoffElement | null
  readonly check: {
    readonly kind: CheckKind
    readonly property: string
    readonly actual: string
    readonly expected: string
    readonly tolerance: number
    readonly current: string | null
  }
  readonly steps: readonly string[]
  readonly properties: HandoffProperties | null
  readonly evidence: { readonly image: string; readonly crop: PageBox } | null
}

export interface HandoffJson {
  readonly schema: typeof HANDOFF_SCHEMA
  readonly generatedAt: string
  readonly generator: { readonly name: 'rasd'; readonly version: string }
  readonly source: string
  readonly options: HandoffOptions
  readonly issues: readonly HandoffJsonIssue[]
}

const iso = (at: number): string => new Date(at).toISOString()

function elementJson(element: HandoffElement): HandoffElement {
  return {
    selector: element.selector,
    unique: element.unique,
    positional: element.positional,
    inShadow: element.inShadow,
    hosts: [...element.hosts],
    rect: { ...element.rect },
  }
}

function issueJson(entry: HandoffEntry): HandoffJsonIssue {
  const { check, lastCheck, page, properties } = entry
  return {
    id: entry.id,
    ordinal: entry.ordinal,
    title: entry.title,
    body: entry.body,
    status: entry.status,
    createdAt: iso(entry.createdAt),
    lastCheck: lastCheck
      ? {
          at: iso(lastCheck.at),
          outcome: lastCheck.outcome,
          observed: lastCheck.observed,
          reason: lastCheck.reason,
        }
      : null,
    page: { url: page.url, title: page.title, viewport: { ...page.viewport } },
    element: elementJson(entry.element),
    pair: entry.pair ? elementJson(entry.pair) : null,
    check: {
      kind: check.kind,
      property: check.property,
      actual: check.actual,
      expected: check.expected,
      tolerance: check.tolerance,
      current: check.current,
    },
    steps: [...entry.steps],
    properties: properties
      ? {
          css: properties.css,
          tailwind: properties.tailwind,
          rootPx: properties.rootPx,
          palette: properties.palette,
          inspect: properties.inspect,
        }
      : null,
    evidence: entry.image ? { image: entry.image.name, crop: { ...entry.image.crop } } : null,
  }
}

export function toHandoffJson(model: HandoffModel): HandoffJson {
  return {
    schema: HANDOFF_SCHEMA,
    generatedAt: iso(model.generatedAt),
    generator: { name: 'rasd', version: model.version },
    source: model.source,
    options: { ...model.options },
    issues: model.entries.map(issueJson),
  }
}

/** النصّ كما يُنسخ ويُكتب في الحزمة — بإزاحة مسافتين وسطرٍ أخير. */
export function renderJson(model: HandoffModel): string {
  return `${JSON.stringify(toHandoffJson(model), null, 2)}\n`
}
