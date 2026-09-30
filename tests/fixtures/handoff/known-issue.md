# حزمة التسليم — رصد

- المصدر: مشروع «منصّة ٢٫٠»
- المشكلات: مشكلة واحدة
- أُنشئت: ⟨2026-09-30 12:00 UTC⟩ · رصد ⟨0.1.0⟩ · ⟨`rasd.handoff/1`⟩

## ١. حشوة الزرّ الرئيسي أكبر من التصميم

- الحالة: مفتوحة · آخر فحص ⟨2026-09-30 09:00 UTC⟩ — لا يطابق
- الصفحة: ⟨`https://northwind.com/pricing`⟩ — ⟪`Pricing — Northwind`⟩
- المقاس: ⟨1440 × 900 · DPR 2⟩ · سُجّلت ⟨2026-09-28 10:12 UTC⟩
- المحدِّد: ⟨`.cta-btn`⟩ — فريد
- الفحص: نمط · ⟨`padding`⟩ · السماح ⟨±0px⟩
- الآن: ⟨`padding: 14px 24px`⟩
- المتوقَّع: ⟨`padding: 12px 24px`⟩

> الحشوة الرأسية أكبر بـ2px من إطار Figma.
> الأفقية مطابقة.

### خطوات الإعادة

1. افتح صفحة الأسعار على مقاس سطح المكتب.
2. مرّر إلى بطاقة الخطّة الاحترافية.
3. قارن حشوة زرّ «ابدأ الآن» بالتصميم.

### الخصائص

CSS:

```css
.cta-btn {
  width: 184px;
  height: 48px;
  font-size: 16px;
  font-weight: 600;
  line-height: 24px;
  color: #FFFFFF;
  background-color: #2563EB;
  padding: 14px 24px;
  margin: 0px;
  border-radius: 8px;
}
```

Tailwind v4 — على أساس ⟨1rem = 16px⟩ مفترَضًا:

```text
w-46 h-12 text-[16px] font-semibold text-[#FFFFFF] bg-[#2563EB] py-3.5 px-6 m-0 rounded-[8px]
```

### الدليل

![مقتطع حول ⟨.cta-btn⟩](images/issue-01.png)
