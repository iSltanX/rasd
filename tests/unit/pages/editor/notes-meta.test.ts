import { describe, expect, it } from 'vitest'

import { asNodeId, type NoteNode, type PinNode, type Scene } from '@/modules/editor/scene'
import { emptyScene } from '@/modules/editor/scene-schema'
import { countByTag, filterByTag, notePreview, orderedNotes } from '@/pages/editor/notes'
import {
  browserLabel,
  formatCaptureTime,
  pageMetaFields,
  shortenUrl,
} from '@/pages/editor/page-meta'
import { devicePoint } from '@/shared/geometry'

import type { CaptureRecord } from '@/shared/storage/schema'

const stroke = { colorToken: 'tool/annotate/solid', widthPx: 2, dash: [], opacity: 1 } as const
const font = { family: 'ui', sizePx: 16, weight: 400, letterSpacingPx: 0 } as const

const note = (id: string, over: Partial<NoteNode> = {}): NoteNode => ({
  kind: 'note',
  id: asNodeId(id),
  locked: false,
  rotation: 0,
  hidden: false,
  stroke,
  at: devicePoint(0, 0),
  widthPx: 240,
  title: '',
  body: '',
  tag: null,
  font,
  paddingPx: 12,
  pinId: null,
  ...over,
})

const pin = (id: string, ordinal: number, noteId: string | null): PinNode => ({
  kind: 'pin',
  id: asNodeId(id),
  locked: false,
  rotation: 0,
  hidden: false,
  stroke,
  at: devicePoint(0, 0),
  shape: 'circle',
  ordinal,
  noteId: noteId ? asNodeId(noteId) : null,
  radiusPx: 13,
})

const sceneOf = (...nodes: Scene['nodes']): Scene => ({
  ...emptyScene({ captureId: 'c', width: 100, height: 100, dpr: 1 }),
  nodes,
})

describe('ترتيب الملاحظات', () => {
  it('**يرتّب برقم الدبّوس لا بترتيب الطبقات**', () => {
    // ترتيب الطبقات معكوس عمدًا: الثالث أوّلًا في المصفوفة.
    const scene = sceneOf(
      note('n3'),
      note('n1'),
      note('n2'),
      pin('p3', 3, 'n3'),
      pin('p1', 1, 'n1'),
      pin('p2', 2, 'n2'),
    )
    expect(orderedNotes(scene).map((e) => e.note.id)).toEqual(['n1', 'n2', 'n3'])
  })

  it('**والملاحظة بلا دبّوس تُذيَّل ولا تُخفى**', () => {
    const scene = sceneOf(note('free'), note('n1'), pin('p1', 1, 'n1'))
    const out = orderedNotes(scene)
    expect(out.map((e) => e.note.id)).toEqual(['n1', 'free'])
    expect(out[1]!.pin).toBeNull()
  })

  it('والربط بالهوية: دبّوس يشير إلى ملاحظة محذوفة لا يُعطب القائمة', () => {
    const scene = sceneOf(note('n1'), pin('p9', 9, 'ghost'))
    expect(orderedNotes(scene)).toHaveLength(1)
    expect(orderedNotes(scene)[0]!.pin).toBeNull()
  })

  it('والترشيح والعدّ بالتصنيف', () => {
    const scene = sceneOf(
      note('a', { tag: 'type' }),
      note('b', { tag: 'spacing' }),
      note('c', { tag: 'type' }),
      note('d'),
    )
    const all = orderedNotes(scene)
    expect(filterByTag(all, null)).toHaveLength(4)
    expect(filterByTag(all, 'type').map((e) => e.note.id)).toEqual(['a', 'c'])
    expect(countByTag(all)).toEqual({ type: 2, spacing: 1, token: 0 })
  })

  it('والمعاينة تُفضّل العنوان ثمّ المتن ثمّ تُعلن الفراغ', () => {
    expect(notePreview(note('a', { title: 'العنوان', body: 'المتن' }))).toBe('العنوان')
    expect(notePreview(note('b', { body: 'المتن\nسطر ثانٍ' }))).toBe('المتن')
    expect(notePreview(note('c'))).toBe('ملاحظة فارغة')
  })
})

describe('بيانات الصفحة', () => {
  const capture: CaptureRecord = {
    id: 'c1',
    createdAt: new Date(2026, 7, 30, 17, 5).getTime(),
    origin: 'https://example.com',
    url: 'https://example.com/docs/guide?lang=ar',
    title: 'دليل الاستعمال',
    kind: 'viewport',
    status: 'ready',
    projectId: null,
    tags: [],
    width: 1440,
    height: 900,
    devicePixelRatio: 2,
    favorite: false,
    archived: false,
    trashedAt: null,
  }

  it('**الوقت بتوقيت الجهاز لا UTC**', () => {
    // لو استُعملت `toISOString` لظهرت ساعةٌ أخرى على أي جهاز خارج غرينتش.
    expect(formatCaptureTime(capture.createdAt)).toBe('2026-08-30 17:05')
  })

  it('ويُصفَّر الشهر واليوم والساعة إلى خانتين', () => {
    expect(formatCaptureTime(new Date(2026, 0, 5, 9, 7).getTime())).toBe('2026-01-05 09:07')
  })

  it('**والرابط الطويل يُقصّ من وسطه** — المضيف والذيل يبقيان', () => {
    const long = `https://example.com/${'a/'.repeat(60)}page`
    const out = shortenUrl(long, 48)
    expect(out.startsWith('https://example.com')).toBe(true)
    expect(out.endsWith('page')).toBe(true)
    expect(out.length).toBeLessThanOrEqual(50)
  })

  it('والقصير يمرّ بلا مساس', () => {
    expect(shortenUrl(capture.url)).toBe(capture.url)
  })

  it('ورابطٌ غير قابل للتحليل يُقصّ نصًّا ولا يرمي', () => {
    expect(() => shortenUrl(`about:${'x'.repeat(80)}`, 20)).not.toThrow()
    expect(shortenUrl(`about:${'x'.repeat(80)}`, 20)).toHaveLength(20)
  })

  it('**واسم المتصفّح من `userAgentData` لا من السلسلة المجمَّدة**', () => {
    const label = browserLabel({
      userAgent: 'Mozilla/5.0 Chrome/131.0.0.0 Safari/537.36',
      userAgentData: {
        brands: [
          { brand: 'Not_A Brand', version: '8' },
          { brand: 'Chromium', version: '146' },
          { brand: 'Google Chrome', version: '146' },
        ],
      },
    })
    // السلسلة تقول 131 والقائمة تقول 146 — والقائمة هي الصادقة.
    expect(label).toBe('Google Chrome 146')
  })

  it('ويسقط إلى السلسلة حين لا قائمة', () => {
    expect(browserLabel({ userAgent: 'Mozilla/5.0 Firefox/142.0' })).toBe('Firefox 142')
  })

  it('ولا يرمي على متصفّح مجهول', () => {
    expect(browserLabel({})).toBe('متصفّح غير معروف')
  })

  it('**والحقول خمسة بترتيب نصّ المرحلة**', () => {
    const fields = pageMetaFields(capture, {}, capture.createdAt + 60_000)
    expect(fields.map((f) => f.key)).toEqual(['title', 'url', 'time', 'size', 'browser'])
  })

  it('والمقاس يحمل كثافة البكسل — بلا كثافة يستحيل إعادة الإنتاج', () => {
    const size = pageMetaFields(capture, {}).find((f) => f.key === 'size')
    expect(size?.value).toBe('1440 × 900 @2×')
    expect(size?.technical).toBe('dimension')
  })

  it('**والوقت يحمل ملحوظة نسبية بالهندية**', () => {
    const time = pageMetaFields(capture, {}, capture.createdAt + 3 * 60_000).find(
      (f) => f.key === 'time',
    )
    expect(time?.note).toBe('قبل ٣ دقائق')
  })

  it('وعنوان الصفحة نصّ عربي لا يُعزَل — والرابط يُعزَل', () => {
    const fields = pageMetaFields(capture, {})
    expect(fields.find((f) => f.key === 'title')?.technical).toBeNull()
    expect(fields.find((f) => f.key === 'url')?.technical).toBe('url')
  })

  it('وصفحةٌ بلا عنوان تُسمّى ولا تُترك فارغة', () => {
    const fields = pageMetaFields({ ...capture, title: '' }, {})
    expect(fields[0]!.value).toBe('صفحة بلا عنوان')
  })
})
