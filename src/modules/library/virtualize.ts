/**
 * تمرير الشبكة الافتراضي (windowed rendering) — حساب المدى المرئي فقط (§10).
 *
 * «5000 لقطة في الشبكة تُمرَّر بسلاسة (تمرير افتراضي مُثبَت)» — بند قبول
 * حرفي. رسم خمسة آلاف بطاقة DOM دفعة واحدة يجمّد الصفحة بصرف النظر عن سرعة
 * منطق التصفية؛ هذا الملفّ يحسب أيّ عناصر تقع فعلًا داخل نافذة العرض
 * (+ هامش تحميل مسبق) من مقاييس التمرير وحدها — **لا يلمس DOM**، فيبقى
 * قابلًا للاختبار بأرقام عادية.
 *
 * عدد الأعمدة **مُدخَل لا مُشتقّ هنا**: يتحدّد بعرض الحاوية الفعلي (شبكة
 * CSS متجاوبة `auto-fill`)، وقياس ذلك عمل DOM يقع في مكوّن الصفحة، لا في
 * منطق خالص.
 */

export interface VirtualGridInput {
  readonly itemCount: number
  readonly columns: number
  readonly rowHeight: number
  /** المسافة بين صفّين — تُحسب ضمن الشريحة (stride) لا الارتفاع وحده. */
  readonly rowGap: number
  readonly scrollTop: number
  readonly viewportHeight: number
  /** صفوف إضافية تُرسَم خارج نافذة العرض تفاديًا لومضة بيضاء عند تمرير سريع. */
  readonly overscanRows?: number
}

export interface VirtualGridResult {
  readonly totalRows: number
  /** ارتفاع المساحة الكاملة — لازمٌ لعنصر تباعد (spacer) يعطي شريط تمرير صحيحًا. */
  readonly totalHeight: number
  readonly startRow: number
  /** حصري — الصفّ عند هذا الفهرس غير مرسوم. */
  readonly endRow: number
  readonly startIndex: number
  /** حصري. */
  readonly endIndex: number
  /** إزاحة أعلى الصفّ الأوّل المرسوم — تُترجَم إليها الشريحة المرسومة داخل الحاوية. */
  readonly offsetTop: number
}

const DEFAULT_OVERSCAN_ROWS = 2

export function computeVirtualGrid(input: VirtualGridInput): VirtualGridResult {
  const columns = Math.max(1, Math.floor(input.columns))
  const overscanRows = Math.max(0, input.overscanRows ?? DEFAULT_OVERSCAN_ROWS)
  const totalRows = Math.ceil(input.itemCount / columns)

  if (totalRows === 0) {
    return {
      totalRows: 0,
      totalHeight: 0,
      startRow: 0,
      endRow: 0,
      startIndex: 0,
      endIndex: 0,
      offsetTop: 0,
    }
  }

  const rowStride = input.rowHeight + input.rowGap
  // آخر صفّ لا يتبعه فاصل — الفاصل بين الصفوف لا بعدها.
  const totalHeight = totalRows * rowStride - input.rowGap

  const firstVisibleRow = Math.max(0, Math.floor(input.scrollTop / rowStride))
  const visibleRowSpan = Math.ceil(input.viewportHeight / rowStride) + 1

  const startRow = Math.max(0, firstVisibleRow - overscanRows)
  const endRow = Math.min(totalRows, firstVisibleRow + visibleRowSpan + overscanRows)

  return {
    totalRows,
    totalHeight,
    startRow,
    endRow,
    startIndex: startRow * columns,
    endIndex: Math.min(input.itemCount, endRow * columns),
    offsetTop: startRow * rowStride,
  }
}
