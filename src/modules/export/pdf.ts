/**
 * مولِّد PDF — حاويةٌ حول بايتات البوّابة، لا بوّابةٌ ثانية.
 *
 * **كل صورة في الملفّ `ExportBytes`**، والنوع لا يبنيه إلا `bake.ts`: فلا يدخل PDF بكسلٌ لم يمرّ من الخبز
 * — لا حجبٌ يُتجاوز ولا تعليقٌ يُنسى ([ADR 0015](../../../Docs/ADR/0015-redaction-single-exit.md)). وصفحات
 * النصّ نفسها تُرسم على قماش ثمّ تُخبز كصورة (`bakeRaster`)، فموضع الترميز يبقى واحدًا. والتعليل في
 * [ADR 0040](../../../Docs/ADR/0040-pdf-container-over-the-gate.md).
 *
 * **والصورة تدخل كما خرجت:** `png-image.ts` يجمع `IDAT` بلا فكّ، ويدخل تيّارًا بـ`FlateDecode` ومرشِّح PNG.
 * وتُضمَّن **مرّةً واحدة** مهما قُسمت على صفحات: كل صفحة تقصّ نافذتها من الكائن نفسه بمستطيل قصّ، فلا
 * يتضاعف الحجم بعدد الصفحات ولا يُعاد ترميز شريحة.
 *
 * **والبيانات الوصفية تُكتب أو تُحذف كاملةً — لا نصف حذف:** `pdf-lib` تكتب افتراضًا منتِجها وتاريخين، فيُنشأ
 * المستند بـ`updateMetadata: false` ولا يُنشأ قاموس `Info` إلا حين تُطلب البيانات. والحفظ بلا تيّارات
 * كائنات مضغوطة: قاموسٌ داخل `FlateDecode` يخفى عن فحص البايتات، والفحص الأمني يقرأ البايتات لا التحليل.
 *
 * **يُحمَّل كسولًا:** يجرّ `pdf-lib` كلّها، فلا يستورده إلا `import()` من صفحة إضافة عند النقر — لا `content.js`
 * ولا ملخّص النافذة (يكفيه `pdf-layout.ts`).
 *
 * `modules/` منطق خالص: لا DOM ولا `chrome.*`.
 */

import {
  clip,
  concatTransformationMatrix,
  drawObject,
  endPath,
  PDFDocument,
  popGraphicsState,
  pushGraphicsState,
  ReadingDirection,
  rectangle,
  type PDFRef,
} from 'pdf-lib'

import { errText, ok, type Result } from '@/shared/result'

import { readPngImage, type PngImage } from './png-image'

import type { ImageWindow, PageBox } from './pdf-layout'
import type { ExportBytes } from '@/modules/editor/bake'

export interface PdfPage {
  /** فهرس الصورة في `images`. */
  readonly image: number
  readonly box: PageBox
  readonly window: ImageWindow
}

export interface PdfMetadata {
  readonly title: string
  readonly subject: string
  readonly keywords: readonly string[]
  readonly createdAt: Date
}

export interface PdfInput {
  readonly images: readonly ExportBytes[]
  readonly pages: readonly PdfPage[]
  /** `null` حذفٌ كامل (`privacy.stripMetadataOnExport`): لا قاموس `Info` أصلًا. */
  readonly metadata: PdfMetadata | null
}

/** اسم المنتج كما يظهر في «خصائص المستند» — عربيًّا كالواجهة. */
const PRODUCER = 'رصد'

function embed(doc: PDFDocument, image: PngImage): PDFRef {
  const stream = doc.context.stream(image.data, {
    Type: 'XObject',
    Subtype: 'Image',
    Width: image.width,
    Height: image.height,
    ColorSpace: 'DeviceRGB',
    BitsPerComponent: image.bitsPerComponent,
    Filter: 'FlateDecode',
    DecodeParms: {
      Predictor: 15,
      Colors: image.colors,
      BitsPerComponent: image.bitsPerComponent,
      Columns: image.width,
    },
  })
  return doc.context.register(stream)
}

/**
 * يرسم نافذة الصورة على الصفحة.
 *
 * فضاء PDF أصله أسفل اليسار وفضاء الصورة أعلاه؛ والتحويل الوحيد بينهما هنا: الصفّ `top` يقع على
 * `y` من أعلى الصفحة، ومستطيل القصّ يحدّ الصفوف الظاهرة بـ`rows` — بلاه يظهر ذيل الصفحة التالية أسفل هذه.
 */
function place(
  doc: PDFDocument,
  ref: PDFRef,
  image: PngImage,
  box: PageBox,
  window: ImageWindow,
): void {
  const page = doc.addPage([box.width, box.height])
  const name = page.node.newXObject('Image', ref)
  const drawnWidth = image.width * window.scale
  const drawnHeight = image.height * window.scale
  const clipHeight = window.rows * window.scale
  const clipBottom = box.height - window.y - clipHeight
  const imageBottom = box.height - window.y - (image.height - window.top) * window.scale
  page.pushOperators(
    pushGraphicsState(),
    rectangle(window.x, clipBottom, drawnWidth, clipHeight),
    clip(),
    endPath(),
    concatTransformationMatrix(drawnWidth, 0, 0, drawnHeight, window.x, imageBottom),
    drawObject(name),
    popGraphicsState(),
  )
}

/**
 * يبني الملفّ ويُعيد بايتاته.
 *
 * يفشل بالاسم ولا يُكمل ناقصًا: صورةٌ لا تُقرأ، أو صفحةٌ تشير إلى صورة غير موجودة، أو مستندٌ بلا صفحات.
 */
export async function buildPdf(input: PdfInput): Promise<Result<Uint8Array<ArrayBuffer>>> {
  if (input.pages.length === 0) {
    return errText('invalid-data', 'لا صفحات في ملفّ PDF.', 'pages = 0')
  }

  const images: PngImage[] = []
  for (const blob of input.images) {
    const read = readPngImage(new Uint8Array(await blob.arrayBuffer()))
    if (!read.ok) return read
    images.push(read.value)
  }

  try {
    const doc = await PDFDocument.create({ updateMetadata: false })
    const refs = images.map((image) => embed(doc, image))

    for (const page of input.pages) {
      const image = images[page.image]
      const ref = refs[page.image]
      if (!image || !ref) {
        return errText('invalid-data', 'تعذّر بناء ملفّ PDF.', `صورة ${page.image} غير موجودة`)
      }
      place(doc, ref, image, page.box, page.window)
    }

    // اللغة والاتجاه خاصّيتا إتاحةٍ وعرض لا بيانات عن الصفحة أو صاحبها — تبقيان مع الحذف.
    doc.setLanguage('ar')
    doc.catalog.getOrCreateViewerPreferences().setReadingDirection(ReadingDirection.R2L)

    if (input.metadata) {
      const meta = input.metadata
      doc.setTitle(meta.title, { showInWindowTitleBar: true })
      doc.setSubject(meta.subject)
      if (meta.keywords.length > 0) doc.setKeywords([...meta.keywords])
      doc.setCreator(PRODUCER)
      doc.setProducer(PRODUCER)
      doc.setCreationDate(meta.createdAt)
      doc.setModificationDate(meta.createdAt)
    }

    const bytes = await doc.save({ useObjectStreams: false, addDefaultPage: false })
    // `pdf-lib` تكتب في `ArrayBuffer` عادي تخصّصه هي — لا ذاكرة مشتركة — فيقبله `Blob` مباشرةً بلا نسخة.
    return ok(bytes as Uint8Array<ArrayBuffer>)
  } catch (thrown) {
    return errText(
      'handler-failed',
      'تعذّر بناء ملفّ PDF.',
      thrown instanceof Error ? thrown.message : String(thrown),
    )
  }
}
