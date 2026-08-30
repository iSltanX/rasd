import { describe, expect, it } from 'vitest'

import { matchesQuery, normalizeArabic } from '@/modules/library/normalize'

describe('normalizeArabic', () => {
  it('يزيل التشكيل — «مُراجعة» تطابق «مراجعة»', () => {
    expect(normalizeArabic('مُراجعة')).toBe(normalizeArabic('مراجعة'))
  })

  it('يوحّد صور الألف الثلاث إلى ألف عادية', () => {
    expect(normalizeArabic('آية')).toBe(normalizeArabic('اية'))
    expect(normalizeArabic('أحمد')).toBe(normalizeArabic('احمد'))
    expect(normalizeArabic('إسلام')).toBe(normalizeArabic('اسلام'))
  })

  it('يوحّد التاء المربوطة إلى هاء', () => {
    expect(normalizeArabic('صفحة')).toBe(normalizeArabic('صفحه'))
  })

  it('يخفض حالة الأحرف اللاتينية — للتطابق بلا حساسية للحالة في قيم HEX', () => {
    expect(normalizeArabic('#3B82F6')).toBe(normalizeArabic('#3b82f6'))
  })

  it('لا يمسّ نصًّا بلا تشكيل ولا ألفات ملموزة أصلًا', () => {
    expect(normalizeArabic('التقاط')).toBe('التقاط')
  })

  it('التركيب: تشكيل + ألف ملموزة + تاء مربوطة معًا', () => {
    expect(normalizeArabic('أُسْرَة')).toBe(normalizeArabic('اسره'))
  })
})

describe('matchesQuery', () => {
  it('«الالتقاط» تطابق البحث عن «التقاط» — مطابقة جزئية بعد التطبيع', () => {
    expect(matchesQuery('الالتقاط', 'التقاط')).toBe(true)
  })

  it('«مُراجعة» في نص كامل تُوجَد بالبحث عن «مراجعة» بلا تشكيل', () => {
    expect(matchesQuery('صفحة المُراجعة النهائية', 'مراجعة')).toBe(true)
  })

  it('استعلامٌ فارغ يطابق كل شيء', () => {
    expect(matchesQuery('أي نص', '')).toBe(true)
    expect(matchesQuery('أي نص', '   ')).toBe(true)
  })

  it('لا يطابق نصًّا لا يحوي الاستعلام', () => {
    expect(matchesQuery('صفحة الدخول', 'الخروج')).toBe(false)
  })

  it('يطابق قيمة HEX بلا حساسية لحالة الأحرف', () => {
    expect(matchesQuery('اللون #3B82F6 المحفوظ', '3b82f6')).toBe(true)
  })
})
