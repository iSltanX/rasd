import { describe, expect, it } from 'vitest'

import {
  CLIPBOARD_FORMAT,
  clipboardAccepts,
  EXPORT_FORMATS,
  extensionFor,
  FORMAT_HINT,
  formatFromMime,
  isDocumentFormat,
  mimeFor,
  OUTPUT_FORMATS,
  OUTPUT_HINT,
} from '@/modules/export/format'

describe('صيغ الخروج', () => {
  it('الصيغتان معرَّفتان بأنواعهما وامتداداتهما', () => {
    expect(EXPORT_FORMATS).toEqual(['png', 'webp'])
    expect(mimeFor('png')).toBe('image/png')
    expect(mimeFor('webp')).toBe('image/webp')
    expect(extensionFor('png')).toBe('png')
    expect(extensionFor('webp')).toBe('webp')
  })

  /**
   * هذه الدالّة هي ما يمسك التدهور الصامت، فحالاتها الحدّية عقدٌ لا تفصيل.
   */
  describe('قراءة الصيغة من النوع المُعلَن', () => {
    it('تطابق النوعين المعروفين', () => {
      expect(formatFromMime('image/png')).toBe('png')
      expect(formatFromMime('image/webp')).toBe('webp')
    })

    it('**تتجاهل الوسائط بعد الفاصلة المنقوطة**', () => {
      expect(formatFromMime('image/png;charset=binary')).toBe('png')
      expect(formatFromMime('image/webp; q=1')).toBe('webp')
    })

    it('وتتجاهل الحالة والفراغ المحيط', () => {
      expect(formatFromMime('  IMAGE/PNG  ')).toBe('png')
    })

    it('**وتُرجع `null` لما ليس من صيغنا** — لا تخمّن', () => {
      expect(formatFromMime('image/jpeg')).toBeNull()
      expect(formatFromMime('image/avif')).toBeNull()
      expect(formatFromMime('')).toBeNull()
      expect(formatFromMime('نص')).toBeNull()
    })
  })

  /**
   * حقيقة مقيسة في Chrome 152.0.7977.83، لا تفضيل تصميمي:
   * `ClipboardItem.supports('image/webp') === false`، والكتابة ترمي
   * `NotAllowedError`. فالاختبار يثبّت الحقيقة كي لا تُنقض بحسن نيّة.
   */
  describe('الحافظة تقبل صيغةً واحدة', () => {
    it('PNG مقبولة وWebP مرفوضة', () => {
      expect(CLIPBOARD_FORMAT).toBe('png')
      expect(clipboardAccepts('png')).toBe(true)
      expect(clipboardAccepts('webp')).toBe(false)
    })
  })

  /**
   * رقاقة «أصغر» في إطار Figma `73:2` نقضها القياس: WebP بلا فقد خرج أكبر
   * من PNG في أربع عشرة حالة من ستّ عشرة على لقطات واجهة حقيقية. فالنصّ
   * صار مشروطًا، وهذا الاختبار يمنع عودته مطلقًا.
   */
  it('**رقاقة WebP مشروطة لا مطلقة** — «أصغر» وحدها نقضها القياس', () => {
    expect(FORMAT_HINT.png).toBe('بلا فقد')
    expect(FORMAT_HINT.webp).not.toBe('أصغر')
    expect(FORMAT_HINT.webp).toContain('الجودة')
  })

  it('ثلاث صيغ في النافذة: الصيغتان المرمَّزتان ثمّ PDF — والمتّجهة محذوفة بقرار النطاق', () => {
    expect(OUTPUT_FORMATS).toEqual(['png', 'webp', 'pdf'])
    expect(OUTPUT_FORMATS.map((f) => f.toLowerCase())).not.toContain('svg')
    expect(OUTPUT_HINT.pdf).toBe('صفحة أو أكثر')
  })

  /**
   * **PDF ليست صيغة ترميز:** لو دخلت `EXPORT_FORMATS` لدار عليها الاختبار التفاضلي في `bake-format.test.ts`
   * بطلب `application/pdf` من المُرمِّج — فيتدهور صامتًا إلى PNG وتمسكه البوّابة عطلًا. الحاوية تُبنى حول PNG.
   */
  it('**وPDF وثيقةٌ لا صيغة ترميز** — خارج `EXPORT_FORMATS`', () => {
    expect(EXPORT_FORMATS).not.toContain('pdf')
    expect(isDocumentFormat('pdf')).toBe(true)
    expect(isDocumentFormat('png')).toBe(false)
  })
})
