import { describe, expect, it } from 'vitest'

import {
  endsAtIend,
  metadataChunks,
  parsePng,
  PNG_SIGNATURE,
  trailingBytes,
} from '../../../helpers/png-chunks'

/**
 * قارئ مقاطع PNG — على بايتات حقيقية.
 *
 * العيّنات مولَّدة بـ`zlib` في Node بمقاطع مبنيّة يدويًّا بـCRC صحيح، لا
 * موصوفة. وأهمّها **الذيل**: ملفٌّ سليم يليه أحد عشر بايتًا، وهو بالضبط شكل
 * aCropalypse — صورة أقصر كُتبت فوق ملفّ أطول.
 */

const bytes = (b64: string): Uint8Array => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))

const CLEAN =
  'iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAYAAACddGYaAAAAC0lEQVR4nGNgwAUAABoAAbw84EEAAAAASUVORK5CYII='
const WITH_TEXT =
  'iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAYAAACddGYaAAAADXRFWHRTb2Z0d2FyZQBSYXNkXHNOwQAAAAtJREFUeJxjYMAFAAAaAAG8POBBAAAAAElFTkSuQmCC'
const TRAILING =
  'iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAYAAACddGYaAAAAC0lEQVR4nGNgwAUAABoAAbw84EEAAAAASUVORK5CYIJTRUNSRVQtVEFJTA=='

describe('تحليل المقاطع', () => {
  it('يقرأ التوقيع والمقاطع والأبعاد من `IHDR`', () => {
    const info = parsePng(bytes(CLEAN))
    expect(info.chunks.map((c) => c.type)).toEqual(['IHDR', 'IDAT', 'IEND'])
    expect(info.width).toBe(3)
    expect(info.height).toBe(2)
    expect(info.byteLength).toBe(68)
  })

  it('**والملفّ السليم ينتهي عند `IEND` بالضبط**', () => {
    const info = parsePng(bytes(CLEAN))
    expect(endsAtIend(info)).toBe(true)
    expect(trailingBytes(info)).toBe(0)
    expect(info.endOffset).toBe(info.byteLength)
  })

  it('**وأحد عشر بايتًا خلف `IEND` تُكشَف** — وهي عين aCropalypse', () => {
    const info = parsePng(bytes(TRAILING))
    expect(endsAtIend(info)).toBe(false)
    expect(trailingBytes(info)).toBe(11)
    // المقاطع نفسها سليمة تمامًا — العطل في الذيل وحده، ولا يراه أي فحص
    // يقرأ الصورة المفكوكة بدل البايتات.
    expect(info.chunks.map((c) => c.type)).toEqual(['IHDR', 'IDAT', 'IEND'])
  })

  it('**ومقاطع البيانات الوصفية تُسمّى**', () => {
    expect(metadataChunks(parsePng(bytes(CLEAN)))).toEqual([])
    expect(metadataChunks(parsePng(bytes(WITH_TEXT)))).toEqual(['tEXt'])
  })

  it('والإطارات محسوبة لا مقدَّرة', () => {
    const info = parsePng(bytes(CLEAN))
    const iend = info.chunks.find((c) => c.type === 'IEND')!
    expect(iend.length).toBe(0)
    expect(iend.frameLength).toBe(12)
    expect(iend.offset + 12).toBe(info.endOffset)
  })
})

describe('الرفض', () => {
  it('توقيعٌ خاطئ يرمي ولا يُبتلَع', () => {
    const bad = bytes(CLEAN)
    bad[1] = 0
    expect(() => parsePng(bad)).toThrow(/توقيع/)
  })

  it('وإطارٌ مقطوع يرمي — ملفٌّ لا يُحلَّل ليس ملفًّا نظيفًا', () => {
    const cut = bytes(CLEAN).slice(0, 30)
    expect(() => parsePng(cut)).toThrow()
  })

  it('ومجرى بلا `IEND` يرمي', () => {
    const full = bytes(CLEAN)
    const noEnd = full.slice(0, full.length - 12)
    expect(() => parsePng(noEnd)).toThrow(/IEND/)
  })

  it('والتوقيع ثمانية بايتات معروفة', () => {
    expect([...PNG_SIGNATURE]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  })
})
