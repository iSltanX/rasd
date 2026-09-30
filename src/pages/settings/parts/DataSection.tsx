/**
 * قسم البيانات (`settings / data`، `282:1318`).
 *
 * ما يُعرض حيًّا اليوم: المساحة المستخدمة من `navigator.storage.estimate()`، وحالة التخزين
 * الدائم من `navigator.storage.persisted()` — قراءتان لا وعدان. وما بقي محرّكه في
 * `STAGES/07` (النسخ الاحتياطي، وتصدير الإعدادات واستيرادها، وإعادة الضبط بتأكيد، وحذف كل
 * البيانات) يُعرض «قريبًا» بسبب مكتوب. **وإعادة الضبط تحديدًا لا تُوصَل هنا:** `settings/reset`
 * تمحو قائمة المواقع المستثناة بلا تأكيد (`Docs/Engineering.md §6` الصفّ 118).
 */
import { useEffect, useState } from 'preact/hooks'

import { formatHuman, formatStorage } from '@/shared/bidi'
import { quotaState, type QuotaState } from '@/shared/storage/quota'
import { Chip } from '@/ui/components/Chip/Chip'
import { SettingRow } from '@/ui/components/SettingRow/SettingRow'

import { Group } from './Group'

const MB = 1024 * 1024

/**
 * المساحة بالميغابايت في سطر الشرح — **وما دون الميغابايت لا يُقرَّب إلى صفر**: «٠ ميغابايت» بجوار
 * شارة «286 KB» تناقضٌ في السطر نفسه (`STAGES/04`، لقطة `settings / data`).
 */
function usageMegabytes(bytes: number): string {
  const mb = Math.round(bytes / MB)
  return mb < 1 ? 'أقلّ من ميغابايت' : `${formatHuman(mb)} ميغابايت`
}

const SOON = <Chip tone="neutral">قريبًا</Chip>

export function DataSection() {
  const [quota, setQuota] = useState<QuotaState | null>(null)
  const [persisted, setPersisted] = useState<boolean | null>(null)

  useEffect(() => {
    void quotaState().then(setQuota)
    void (navigator.storage?.persisted?.() ?? Promise.resolve(false))
      .then(setPersisted)
      .catch(() => setPersisted(null))
  }, [])

  const known = quota !== null && quota.quotaBytes > 0

  return (
    <>
      <Group title="المساحة" id="data-storage">
        <SettingRow
          id="data-usage"
          label="المساحة المستخدمة"
          hint={
            known
              ? `${usageMegabytes(quota.usageBytes)} من حصّة يمنحها المتصفّح لرصد`
              : 'تعذّر قياس المساحة في هذا المتصفّح'
          }
          divider
          control={
            <Chip tone="neutral" dot={false}>
              <bdi dir="ltr">{known ? formatStorage(quota.usageBytes) : '—'}</bdi>
            </Chip>
          }
        />
        <SettingRow
          id="data-persist"
          label="التخزين الدائم"
          hint="يمنع المتصفّح من حذف المكتبة عند ضيق المساحة"
          control={
            persisted === null ? (
              <Chip tone="neutral">غير معروف</Chip>
            ) : (
              <Chip tone={persisted ? 'success' : 'neutral'}>
                {persisted ? 'مفعَّل' : 'غير مفعَّل'}
              </Chip>
            )
          }
        />
      </Group>

      <Group title="النسخ الاحتياطي" id="data-backup">
        <SettingRow
          label="خذ نسخة احتياطية للمكتبة"
          hint="ملفّ واحد فيه اللقطات والمشاريع والوسوم واللوحات والأدلّة"
          divider
          control={SOON}
        />
        <SettingRow
          label="استعد من نسخة احتياطية"
          hint="تُضاف محتويات الملفّ إلى مكتبتك الحالية"
          control={SOON}
        />
      </Group>

      <Group title="الإعدادات" id="data-settings">
        <SettingRow
          label="صدّر الإعدادات"
          hint="ملفّ JSON تنقله إلى متصفّح آخر"
          divider
          control={SOON}
        />
        <SettingRow
          label="استورد الإعدادات"
          hint="يعرض رصد ما قُبل وما أُسقط قبل الحفظ"
          divider
          control={SOON}
        />
        <SettingRow
          label="أعد ضبط الإعدادات"
          hint="تعود كل الإعدادات إلى قيمها الأولى بتأكيد صريح. المكتبة لا تُمسّ"
          control={SOON}
        />
      </Group>

      <Group title="منطقة الخطر" id="data-danger">
        <SettingRow
          label="احذف كل البيانات"
          hint="يحذف اللقطات واللوحات والأدلّة والإعدادات نهائيًّا، بتأكيد مزدوج بعد النسخ الاحتياطي"
          control={SOON}
        />
      </Group>
    </>
  )
}
