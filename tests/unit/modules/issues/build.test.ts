import { describe, expect, it } from 'vitest'

import { parseScene } from '@/modules/editor/scene-schema'
import {
  buildIssue,
  cropOf,
  noteScene,
  noteTagOf,
  pageKeyOf,
  pageOf,
  stripHash,
  type NoteStyle,
} from '@/modules/issues/build'
import { parseIssue } from '@/modules/issues/schema'
import { ISSUE_SCHEMA_VERSION, type IssueDraft, type IssuePage } from '@/shared/issue-schema'

import { draftFixture } from './fixture'

import type { NoteNode, PinNode, Scene } from '@/modules/editor/scene'

/**
 * بناء السجلّ والملاحظة (ADR 0030 §3): ما يأتي من الصفحة مسودّةٌ، وما يُبنى هنا يأتي من الخلفية.
 */

const ids = { issueId: 'i1', captureId: 'c1', noteId: 'n1' }

const page: IssuePage = {
  url: 'https://northwind.example/pricing',
  origin: 'https://northwind.example',
  path: '/pricing',
  title: 'منصّة — الأسعار',
  viewport: { width: 1440, height: 900, dpr: 2 },
}

describe('stripHash', () => {
  it('يقطع الجزء من أوّل `#` ويُبقي الاستعلام', () => {
    expect(stripHash('https://a.example/p#faq')).toBe('https://a.example/p')
    expect(stripHash('https://a.example/p?tab=1#faq')).toBe('https://a.example/p?tab=1')
    expect(stripHash('https://a.example/p#a#b')).toBe('https://a.example/p')
  })

  it('رابطٌ بلا جزء يبقى كما هو، وجزءٌ وحده يصير فارغًا', () => {
    expect(stripHash('https://a.example/p')).toBe('https://a.example/p')
    expect(stripHash('https://a.example/p#')).toBe('https://a.example/p')
    expect(stripHash('#top')).toBe('')
    expect(stripHash('')).toBe('')
  })
})

describe('pageKeyOf', () => {
  it('الأصل والمسار بلا استعلام ولا جزء', () => {
    expect(pageKeyOf('https://northwind.example/pricing?plan=pro#faq')).toEqual({
      origin: 'https://northwind.example',
      path: '/pricing',
    })
    expect(pageKeyOf('http://localhost:5173/')).toEqual({
      origin: 'http://localhost:5173',
      path: '/',
    })
  })

  it('ما لا يُفهم رابطًا ⟵ null', () => {
    expect(pageKeyOf('ليس رابطًا')).toBeNull()
    expect(pageKeyOf('')).toBeNull()
    expect(pageKeyOf('/pricing')).toBeNull()
  })
})

describe('pageOf', () => {
  const draft = draftFixture()

  it('الرابط بلا جزء، والأصل والمسار منه، والعنوان من التبويب', () => {
    const built = pageOf(
      { url: 'https://northwind.example/pricing?x=1#faq', title: 'الأسعار' },
      draft,
    )
    expect(built).toEqual({
      url: 'https://northwind.example/pricing?x=1',
      origin: 'https://northwind.example',
      path: '/pricing',
      title: 'الأسعار',
      viewport: { width: 1440, height: 900, dpr: 2 },
    })
  })

  it('الكثافة من لقطة المسودّة، والمقاس من نافذتها', () => {
    const built = pageOf(
      { url: 'https://northwind.example/', title: 't' },
      draftFixture({ viewport: { width: 800, height: 600 }, shot: { ...draft.shot, dpr: 3 } }),
    )
    expect(built?.viewport).toEqual({ width: 800, height: 600, dpr: 3 })
  })

  it('رابطٌ غير مفهوم ⟵ null: لا سجلّ بلا صفحة', () => {
    expect(pageOf({ url: 'ليس رابطًا', title: 't' }, draft)).toBeNull()
  })
})

describe('cropOf', () => {
  const shot = (
    rect: [number, number, number, number],
    element: [number, number, number, number],
  ): Pick<IssueDraft, 'shot'> => ({
    shot: {
      dpr: 2,
      rect: { space: 'device', x: rect[0], y: rect[1], width: rect[2], height: rect[3] },
      element: {
        space: 'device',
        x: element[0],
        y: element[1],
        width: element[2],
        height: element[3],
      },
    },
  })

  it('العنصر نسبةً إلى مستطيل اللقطة لا إلى الصفحة', () => {
    expect(cropOf(draftFixture())).toEqual({ x: 48, y: 48, width: 368, height: 96 })
  })

  it('عنصرٌ يمتدّ وراء حافّة اللقطة يُقصّ عندها', () => {
    // يبدأ عند 348 من لقطة عرضها 464: يتّسع له 116 لا 368.
    expect(cropOf(shot([152, 352, 464, 192], [500, 400, 368, 96]))).toEqual({
      x: 348,
      y: 48,
      width: 116,
      height: 96,
    })
  })

  it('عنصرٌ يبدأ قبل مستطيل اللقطة يُثبَّت عند الصفر ولا يخرج منها', () => {
    const crop = cropOf(shot([152, 352, 464, 192], [100, 300, 700, 500]))
    expect(crop.x).toBe(0)
    expect(crop.y).toBe(0)
    expect(crop.x + crop.width).toBeLessThanOrEqual(464)
    expect(crop.y + crop.height).toBeLessThanOrEqual(192)
  })

  it('العرض هو الجزء الظاهر وحده حين يبدأ العنصر قبل اللقطة (انحدارٌ أصلحته المراجعة)', () => {
    // يبدأ قبل حافّة اللقطة بخمسين: يظهر منه خمسون لا مئة.
    expect(cropOf(shot([0, 0, 400, 200], [-50, 10, 100, 40]))).toEqual({
      x: 0,
      y: 10,
      width: 50,
      height: 40,
    })
  })

  it('عنصرٌ خارج اللقطة كلّيًا يعطي مقاسًا صفرًا لا سالبًا', () => {
    const crop = cropOf(shot([152, 352, 464, 192], [900, 800, 100, 100]))
    expect(crop.width).toBe(0)
    expect(crop.height).toBe(0)
  })
})

describe('buildIssue', () => {
  it('الحالة الأولى `open` وآخر فحصٍ `null` والزمنان زمن التسجيل', () => {
    const issue = buildIssue(draftFixture(), page, ids, 1_000)
    expect(issue.status).toBe('open')
    expect(issue.lastCheck).toBeNull()
    expect(issue.createdAt).toBe(1_000)
    expect(issue.updatedAt).toBe(1_000)
    expect(issue.schemaVersion).toBe(ISSUE_SCHEMA_VERSION)
    expect(issue.id).toBe('i1')
  })

  it('التاريخ حدثٌ واحد `created` بالقيمة المرصودة وقت التسجيل', () => {
    const draft = draftFixture()
    const issue = buildIssue(draft, page, ids, 1_000)
    expect(issue.history).toEqual([
      { kind: 'created', at: 1_000, status: 'open', observed: draft.check.actual },
    ])
  })

  it('الصفحة من الخلفية والعنصر والفحص واللقطة والمشروع من المسودّة كما هي', () => {
    const draft = draftFixture({ projectId: 'p1' })
    const issue = buildIssue(draft, page, ids, 1_000)
    expect(issue.page).toBe(page)
    expect(issue.element).toBe(draft.element)
    expect(issue.pair).toBeNull()
    expect(issue.check).toBe(draft.check)
    expect(issue.projectId).toBe('p1')
    expect(issue.body).toBe(draft.body)
    expect(issue.evidence).toEqual({
      captureId: 'c1',
      snapshot: draft.snapshot,
      crop: cropOf(draft),
    })
  })

  it('المعرّف الفارغ للملاحظة ⟵ `note: null`، وإلا الربط باتجاه واحد', () => {
    expect(buildIssue(draftFixture(), page, { ...ids, noteId: null }, 1).note).toBeNull()
    expect(buildIssue(draftFixture(), page, ids, 1).note).toEqual({
      captureId: 'c1',
      noteId: 'n1',
    })
  })

  it('العنوان يُقصّ والخطوات تُقصّ وتُحذف فارغتها', () => {
    const issue = buildIssue(
      draftFixture({
        title: '  حشوة الزرّ  ',
        steps: ['  افتح الصفحة ', '', '   ', '\tمرّر إلى البطل\n'],
      }),
      page,
      ids,
      1,
    )
    expect(issue.title).toBe('حشوة الزرّ')
    expect(issue.steps).toEqual(['افتح الصفحة', 'مرّر إلى البطل'])
  })

  it('لا يغيّر المسودّة الداخلة', () => {
    const draft = draftFixture({ title: '  عنوان  ', steps: [' أ '] })
    buildIssue(draft, page, ids, 1)
    expect(draft.title).toBe('  عنوان  ')
    expect(draft.steps).toEqual([' أ '])
  })

  it('ما يبنيه يجتاز `parseIssue` — السجلّ الأوّل صالحٌ بحدّ الثقة نفسه', () => {
    const issue = buildIssue(draftFixture(), page, ids, 1_000)
    const parsed = parseIssue(issue)
    expect(parsed.ok && parsed.value).toEqual(issue)
  })
})

describe('noteTagOf', () => {
  const check = (kind: IssueDraft['check']['kind'], property: string): IssueDraft['check'] => ({
    kind,
    property,
    actual: 'a',
    expected: 'b',
    tolerance: 0,
  })

  it('فحص المسافة ⟵ «المسافات» أيًّا كانت خاصّيته', () => {
    expect(noteTagOf(check('spacing', 'gap-left'))).toBe('spacing')
    expect(noteTagOf(check('spacing', 'dx'))).toBe('spacing')
  })

  it.each(['padding', 'padding-inline', 'margin', 'gap', 'width', 'height', 'top', 'inset'])(
    'نمط %s ⟵ «المسافات»',
    (property) => {
      expect(noteTagOf(check('style', property))).toBe('spacing')
    },
  )

  it.each(['font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-align'])(
    'نمط %s ⟵ «الخطّ»',
    (property) => {
      expect(noteTagOf(check('style', property))).toBe('type')
    },
  )

  it('نمط اللون وما لا يخصّ مسافةً ولا خطًّا بلا وسم', () => {
    expect(noteTagOf(check('style', 'color'))).toBeNull()
    expect(noteTagOf(check('style', 'background-color'))).toBeNull()
    expect(noteTagOf(check('style', 'display'))).toBeNull()
  })

  it('نوع اللون والتباين بلا وسم ولو حملت خاصّيتهما اسم مسافة', () => {
    expect(noteTagOf(check('colour', 'color'))).toBeNull()
    expect(noteTagOf(check('colour', 'padding'))).toBeNull()
    expect(noteTagOf(check('contrast', 'color/background-color'))).toBeNull()
  })
})

describe('noteScene', () => {
  const style: NoteStyle = {
    colorToken: 'status/danger/solid',
    strokeWidthCss: 2,
    fontSizeCss: 14,
    pinShape: 'square',
    pinStart: 3,
  }
  const sceneIds = { captureId: 'c1', noteId: 'n1', pinId: 'p1' }

  const pinOf = (scene: Scene): PinNode => {
    const pin = scene.nodes.find((n): n is PinNode => n.kind === 'pin')
    if (!pin) throw new Error('لا دبّوس في المشهد')
    return pin
  }
  const noteOf = (scene: Scene): NoteNode => {
    const note = scene.nodes.find((n): n is NoteNode => n.kind === 'note')
    if (!note) throw new Error('لا ملاحظة في المشهد')
    return note
  }

  const small = { width: 100, height: 60 }

  it('المشهد يجتاز `parseScene` — يفتحه المحرّر كأي مشهد كتبه المستخدم', () => {
    const scene = noteScene(draftFixture(), small, sceneIds, style)
    const parsed = parseScene(scene)
    expect(parsed.ok).toBe(true)
    expect(parsed.ok && parsed.value.nodes).toHaveLength(2)
  })

  it('عقدتان وحدهما: دبّوسٌ وملاحظةٌ مربوطان أحدهما بالآخر بالمعرّف', () => {
    const scene = noteScene(draftFixture(), small, sceneIds, style)
    expect(scene.nodes.map((n) => n.kind).sort()).toEqual(['note', 'pin'])

    const pin = pinOf(scene)
    const note = noteOf(scene)
    expect(pin.id).toBe('p1')
    expect(note.id).toBe('n1')
    expect(pin.noteId).toBe(note.id)
    expect(note.pinId).toBe(pin.id)
  })

  it('رقم الدبّوس وشكله من إعدادات المستخدم لا من مخترَعٍ هنا', () => {
    const scene = noteScene(draftFixture(), small, sceneIds, style)
    expect(pinOf(scene).ordinal).toBe(style.pinStart)
    expect(pinOf(scene).shape).toBe('square')
    expect(scene.meta.pinStart).toBe(3)
    expect(scene.meta.pinShape).toBe('square')
    expect(pinOf(scene).stroke.colorToken).toBe('status/danger/solid')
  })

  it('المشهد لهذه اللقطة بمقاسها وكثافتها ولا مراجعة بعد', () => {
    const scene = noteScene(draftFixture(), small, sceneIds, style)
    expect(scene.captureId).toBe('c1')
    expect(scene.source).toEqual({ width: 100, height: 60, dpr: 2 })
    expect(scene.revision).toBe(0)
  })

  it('عنوان الملاحظة مقصوصٌ ونصّها نصّ المسودّة ووسمها من الفحص', () => {
    const note = noteOf(
      noteScene(
        draftFixture({ title: '  حشوة الزرّ  ', body: 'الحشوة 12 بكسل.' }),
        small,
        sceneIds,
        style,
      ),
    )
    expect(note.title).toBe('حشوة الزرّ')
    expect(note.body).toBe('الحشوة 12 بكسل.')
    expect(note.tag).toBe('spacing')
    expect(
      noteOf(
        noteScene(
          draftFixture({ check: { ...draftFixture().check, property: 'color' } }),
          small,
          sceneIds,
          style,
        ),
      ).tag,
    ).toBeNull()
  })

  it('الأرقام بعدد بكسلات الجهاز: الكثافة تضرب أرقام المحرّر', () => {
    const scene = noteScene(draftFixture(), { width: 464, height: 192 }, sceneIds, style)
    expect(pinOf(scene).radiusPx).toBe(26)
    expect(pinOf(scene).stroke.widthPx).toBe(4)
    expect(noteOf(scene).paddingPx).toBe(24)
    expect(noteOf(scene).font.sizePx).toBe(28)
    expect(noteOf(scene).font.letterSpacingPx).toBe(0)
  })

  it('كل الإحداثيات داخل حدود صورة صغيرة (100×60)', () => {
    const scene = noteScene(draftFixture(), small, sceneIds, style)
    const pin = pinOf(scene)
    const note = noteOf(scene)

    expect(pin.at.x).toBeGreaterThanOrEqual(0)
    expect(pin.at.x).toBeLessThanOrEqual(small.width)
    expect(pin.at.y).toBeGreaterThanOrEqual(0)
    expect(pin.at.y).toBeLessThanOrEqual(small.height)

    expect(note.at.x).toBeGreaterThanOrEqual(0)
    expect(note.at.x + note.widthPx).toBeLessThanOrEqual(small.width)
    expect(note.at.y).toBeGreaterThanOrEqual(0)
    expect(note.at.y).toBeLessThanOrEqual(small.height)
  })

  it('الدبّوس عند زاوية العنصر العليا والملاحظة بجواره على صورة بمقاس اللقطة', () => {
    const scene = noteScene(draftFixture(), { width: 464, height: 192 }, sceneIds, style)
    const crop = cropOf(draftFixture())
    // نصف قطر الدبّوس 26 عند الكثافة 2.
    expect(pinOf(scene).at).toEqual({ space: 'device', x: crop.x + 26, y: crop.y + 26 })
    expect(noteOf(scene).at.y).toBe(crop.y)
    expect(noteOf(scene).at.x).toBeGreaterThan(pinOf(scene).at.x - 26)
    expect(noteOf(scene).at.x + noteOf(scene).widthPx).toBeLessThanOrEqual(464)
  })

  it('صورةٌ أضيق من الملاحظة تُقلّص عرضها ولا تخرج منها', () => {
    const narrow = { width: 40, height: 60 }
    const scene = noteScene(draftFixture(), narrow, sceneIds, style)
    const note = noteOf(scene)
    expect(note.widthPx).toBeGreaterThanOrEqual(1)
    expect(note.widthPx).toBeLessThan(240 * 2)
    expect(parseScene(scene).ok).toBe(true)
  })

  it('على كثافة 1 يبقى صالحًا والأرقام بلا تضعيف', () => {
    const draft = draftFixture({ shot: { ...draftFixture().shot, dpr: 1 } })
    const scene = noteScene(draft, { width: 464, height: 192 }, sceneIds, style)
    expect(pinOf(scene).radiusPx).toBe(13)
    expect(noteOf(scene).widthPx).toBe(240)
    expect(parseScene(scene).ok).toBe(true)
  })
})

describe('noteScene — صورة أصغر من مستطيل اللقطة (انحدارٌ أصلحته المراجعة)', () => {
  it('الملاحظة داخل ارتفاع الصورة لا تحته', () => {
    const scene = noteScene(
      draftFixture(),
      { width: 100, height: 40 },
      { captureId: 'c1', noteId: 'n1', pinId: 'p1' },
      {
        colorToken: 'tool/annotate/solid',
        strokeWidthCss: 3,
        fontSizeCss: 16,
        pinShape: 'circle',
        pinStart: 1,
      },
    )
    const note = scene.nodes.find((n) => n.kind === 'note')
    expect(note?.kind === 'note' && note.at.y).toBeLessThan(40)
    expect(note?.kind === 'note' && note.at.y).toBeGreaterThanOrEqual(0)
  })
})
