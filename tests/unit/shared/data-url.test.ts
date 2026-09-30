import { describe, expect, it } from 'vitest'

import { dataUrlMime, dataUrlToBlob, dataUrlToBytes } from '@/shared/data-url'

/**
 * فكّ عناوين البيانات يدويًّا — لأن `fetch(dataUrl)` يُرفَض ببيان رصد
 * (`connect-src 'self'`) داخل الإضافة وينجح خارجها.
 */

/** «PNG» بالبايتات الأربعة الأولى من ترويسته: 0x89 'P' 'N' 'G'. */
const PNG_HEAD_B64 = 'iVBORw=='
const PNG_HEAD = [0x89, 0x50, 0x4e, 0x47]

describe('dataUrlToBytes', () => {
  it('يفكّ base64 إلى بايتات مطابقة حرفًا بحرف', () => {
    const bytes = dataUrlToBytes(`data:image/png;base64,${PNG_HEAD_B64}`)

    expect([...bytes]).toEqual(PNG_HEAD)
    expect(bytes).toBeInstanceOf(Uint8Array)
  })

  it('يقطع عند أوّل فاصلة فقط — لا يفسده ما بعدها', () => {
    // الفاصلة تفصل الترويسة عن الحمولة؛ ما بعد الأولى ليس ترويسة.
    const bytes = dataUrlToBytes('data:text/plain;base64,QQ==')

    expect([...bytes]).toEqual([0x41])
  })

  it('حمولة فارغة تعطي مصفوفة فارغة لا خطأً', () => {
    expect(dataUrlToBytes('data:image/png;base64,').length).toBe(0)
  })

  it('عنوان بلا فاصلة يرمي بنصّ واضح بدل فكّ عبثيّ', () => {
    expect(() => dataUrlToBytes('data:image/png;base64')).toThrow('عنوان بيانات بلا فاصلة')
    expect(() => dataUrlToBytes('')).toThrow('عنوان بيانات بلا فاصلة')
  })
})

describe('dataUrlMime', () => {
  it('يقرأ النوع المعلن قبل الفاصلة المنقوطة', () => {
    expect(dataUrlMime('data:image/webp;base64,AAAA')).toBe('image/webp')
  })

  it('يقرأ النوع حين لا يتبعه معامل ولا base64', () => {
    expect(dataUrlMime('data:image/jpeg,AAAA')).toBe('image/jpeg')
  })

  it('يعود إلى PNG حين لا يُعلَن نوع — ترويسة بلا نوع أو بلا `data:`', () => {
    expect(dataUrlMime('data:;base64,AAAA')).toBe('image/png')
    expect(dataUrlMime('data:,AAAA')).toBe('image/png')
    expect(dataUrlMime('AAAA')).toBe('image/png')
  })
})

describe('dataUrlToBlob', () => {
  it('يبني Blob بحجم البايتات ونوع العنوان', () => {
    const blob = dataUrlToBlob(`data:image/webp;base64,${PNG_HEAD_B64}`)

    expect(blob.size).toBe(PNG_HEAD.length)
    expect(blob.type).toBe('image/webp')
  })

  it('بلا نوع معلن يحمل النوع الافتراضي PNG', () => {
    expect(dataUrlToBlob(`data:;base64,${PNG_HEAD_B64}`).type).toBe('image/png')
  })

  it('يمرّر خطأ الفكّ ولا يبتلعه', () => {
    expect(() => dataUrlToBlob('data:image/png;base64')).toThrow('عنوان بيانات بلا فاصلة')
  })
})
