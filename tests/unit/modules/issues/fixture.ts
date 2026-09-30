import { buildIssue } from '@/modules/issues/build'

import type { ElementIdentity, IssueDraft, IssueRecord } from '@/shared/issue-schema'

/** هوية عنصرٍ ثابتة للاختبارات — بلا DOM. */
export function identityFixture(over: Partial<ElementIdentity> = {}): ElementIdentity {
  return {
    selector: '.cta-btn',
    unique: true,
    positional: false,
    inShadow: false,
    hosts: [],
    fingerprint: { tag: 'button', attrs: ['data-cta'], textHash: '0a1b2c3d', textLength: 11 },
    rect: { x: 100, y: 200, width: 184, height: 48 },
    ...over,
  }
}

export function draftFixture(over: Partial<IssueDraft> = {}): IssueDraft {
  return {
    element: identityFixture(),
    pair: null,
    check: {
      kind: 'style',
      property: 'padding',
      actual: '14px 24px',
      expected: '12px 24px',
      tolerance: 0,
    },
    snapshot: { padding: '14px 24px' },
    title: 'حشوة الزرّ الرئيسي أكبر من التصميم',
    body: 'الحشوة الرأسية في التصميم 12 بكسل.',
    steps: ['افتح الصفحة بعرض 1440', 'مرّر إلى البطل'],
    projectId: null,
    withNote: true,
    shot: {
      rect: { space: 'device', x: 152, y: 352, width: 464, height: 192 },
      element: { space: 'device', x: 200, y: 400, width: 368, height: 96 },
      dpr: 2,
    },
    viewport: { width: 1440, height: 900 },
    ...over,
  }
}

const PAGE = {
  url: 'https://northwind.example/pricing',
  origin: 'https://northwind.example',
  path: '/pricing',
  title: 'منصّة — الأسعار',
  viewport: { width: 1440, height: 900, dpr: 2 },
}

export function issueFixture(over: Partial<IssueRecord> = {}): IssueRecord {
  const issue = buildIssue(
    draftFixture(),
    PAGE,
    { issueId: 'i1', captureId: 'c1', noteId: 'n1' },
    1_000,
  )
  return { ...issue, ...over }
}
