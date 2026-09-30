import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it } from 'vitest'

import { buildGuideModel, renderGuideHtml, type GuideHtmlImage } from '@/modules/export/guide'
import { guidePalette } from '@/pages/export/guide-export'
import { loadGuide } from '@/pages/library/guides'
import { DEFAULT_GUIDE_OPTIONS } from '@/shared/guide-schema'
import { closeDatabase, setIncognitoWritePolicy } from '@/shared/storage/db'
import { blobs, captures, guides } from '@/shared/storage/repository'

import { makePng } from '../helpers/make-png'

import type { CaptureRecord } from '@/shared/storage/schema'

/**
 * معيار القبول الثاني في `STAGES/06`: **الصفحة المصدَّرة تُفتح مع قطع الشبكة وتعرض كل الصور.**
 *
 * من القاعدة إلى الملفّ: دليلٌ مخزَّن بلقطاته وبايتاتها، يُقرأ كما تقرؤه صفحة الدليل، ويُكتب صفحةً مستقلّة،
 * ثمّ يُحلَّل HTML بمحلّل المتصفّح — لا بتعبيرٍ نمطي — ويُفحص كل ما قد يطلب شيئًا من الشبكة: كل خاصّية رابط
 * في كل عنصر، وكل `url()` في الأنماط، وكل وسمٍ يجلب ملفًّا. فما لا يحتاج شبكةً يُفتح بلاها. وكل صورة تُفكّ من
 * `data:` إلى بايتات لقطتها المخزَّنة نفسها. (والفتح الفعلي في كروم بلا شبكة مسجَّلٌ في سجلّ المرحلة.)
 */

const NOW = 1_780_000_000_000

function capture(id: string, offset: number): CaptureRecord {
  return {
    id,
    createdAt: NOW + offset,
    origin: 'https://shop.example',
    url: `https://shop.example/${id}`,
    title: `صفحة ${id}`,
    kind: 'viewport',
    status: 'ready',
    projectId: null,
    tags: [],
    width: 24,
    height: 16,
    devicePixelRatio: 1,
    favorite: false,
    archived: false,
    trashedAt: null,
  }
}

/** كل خاصّية تحمل عنوانًا قد يُجلب — HTML الحيّ لا القائمة التي نعرف أننا كتبناها. */
const URL_ATTRIBUTES = [
  'src',
  'srcset',
  'href',
  'poster',
  'action',
  'formaction',
  'data',
  'background',
  'cite',
  'manifest',
  'ping',
  'xlink:href',
]

/** وسومٌ تجلب ملفًّا أو تنفّذ شيفرة بوجودها وحده. */
const FETCHING_TAGS = [
  'script',
  'link',
  'iframe',
  'frame',
  'object',
  'embed',
  'video',
  'audio',
  'source',
  'track',
  'base',
  'form',
  'svg',
]

beforeEach(async () => {
  setIncognitoWritePolicy(false)
  await closeDatabase()
  indexedDB.deleteDatabase('rasd')
  await new Promise((r) => setTimeout(r, 0))
})

describe('الصفحة المستقلّة بلا شبكة', () => {
  it('من دليلٍ مخزَّن إلى ملفّ لا يطلب شيئًا من الشبكة ويعرض كل صورة ببايتات لقطتها', async () => {
    const pngs = new Map(
      ['a', 'b', 'c'].map((id, i) => [id, makePng(24, 16, (x, y) => [x * 9, y * 13, i * 80])]),
    )
    await captures.putMany(['a', 'b', 'c'].map((id, i) => capture(id, i)))
    for (const [id, png] of pngs) {
      await blobs.put({
        id,
        blob: new Blob([png as Uint8Array<ArrayBuffer>], { type: 'image/png' }),
        mime: 'image/png',
        bytes: png.length,
      })
    }
    await guides.put({
      id: 'g',
      title: 'كيف تُبلّغ عن خطأ بصري <مهمّ>',
      projectId: null,
      captureIds: ['c', 'a', 'b'],
      createdAt: NOW,
      stepText: { c: { title: 'افتح الصفحة', note: 'رابطٌ مكتوب: https://evil.example/x.png' } },
      updatedAt: NOW,
    })

    const view = await loadGuide('g')
    if (!view.ok) throw new Error(view.error.message)
    const model = buildGuideModel({
      title: view.value.guide.title,
      steps: view.value.steps,
      captureTitles: new Map(view.value.steps.map((s) => [s.captureId, s.capture?.title ?? ''])),
      options: DEFAULT_GUIDE_OPTIONS,
      generatedAt: NOW,
      version: '0.1.0',
      imageExtension: 'png',
    })
    // البايتات بمعرّف كل خطوةٍ كما قرأتها الصفحة — في الإضافة تمرّ من الخبز أوّلًا. (و`Blob` لا يعبر
    // `fake-indexeddb` في happy-dom، فتُؤخذ من مصدرها لا من المخزن.)
    const images = new Map<string, GuideHtmlImage>()
    for (const step of view.value.steps) {
      const bytes = pngs.get(step.captureId)
      if (!bytes || step.bytes !== bytes.length) throw new Error('لا بايتات')
      images.set(step.captureId, { bytes, mime: 'image/png', width: 24, height: 16 })
    }
    const rendered = renderGuideHtml(model, images, guidePalette())
    if (!rendered.ok) throw new Error(rendered.error.message)

    const doc = new DOMParser().parseFromString(rendered.value, 'text/html')
    expect(doc.documentElement.getAttribute('lang')).toBe('ar')
    expect(doc.documentElement.getAttribute('dir')).toBe('rtl')
    expect(doc.title).toBe('كيف تُبلّغ عن خطأ بصري <مهمّ>')

    // لا شيء يجلب ملفًّا أو يُنفَّذ.
    for (const tag of FETCHING_TAGS) expect(doc.getElementsByTagName(tag), tag).toHaveLength(0)
    const all = [...doc.querySelectorAll('*')]
    for (const el of all) {
      for (const name of URL_ATTRIBUTES) {
        const value = el.getAttribute(name)
        if (value !== null)
          expect(value, `${el.tagName}[${name}]`).toMatch(/^data:image\/png;base64,/u)
      }
      expect(el.getAttribute('style')).toBeNull()
    }
    const css = [...doc.querySelectorAll('style')].map((s) => s.textContent ?? '').join('\n')
    expect(css).not.toMatch(/url\(|@import|@font-face/iu)
    // الرابط الذي كتبه المستخدم نصٌّ مرئيّ لا عنوانٌ يُجلب.
    expect(doc.body.textContent).toContain('https://evil.example/x.png')

    // والسياسة تمنع ما قد يُضاف: لا مصدر إلا `data:` للصور.
    const csp = doc
      .querySelector('meta[http-equiv="Content-Security-Policy"]')
      ?.getAttribute('content')
    expect(csp).toContain("default-src 'none'")

    // كل خطوة صورتها، بترتيب الدليل، ببايتات لقطتها المخزَّنة نفسها.
    const imgs = [...doc.querySelectorAll('img')]
    expect(imgs).toHaveLength(3)
    const decoded = imgs.map((img) =>
      Uint8Array.from(Buffer.from(img.getAttribute('src')!.split(',')[1]!, 'base64')),
    )
    expect(decoded).toEqual([pngs.get('c'), pngs.get('a'), pngs.get('b')])
    expect(imgs.every((img) => img.getAttribute('alt')?.startsWith('لقطة الخطوة'))).toBe(true)
    expect(imgs.map((img) => [img.getAttribute('width'), img.getAttribute('height')])).toEqual([
      ['24', '16'],
      ['24', '16'],
      ['24', '16'],
    ])
    expect([...doc.querySelectorAll('ol > li')]).toHaveLength(3)
  })
})
