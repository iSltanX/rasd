/**
 * قسم «عن رصد» (`settings / about`، `282:1656`): الإصدار والدعم والتراخيص والتذييل.
 *
 * الإصدار من البيان المحمَّل فعلًا لا ثابتًا مكتوبًا. وما محرّكه في مرحلة لاحقة يُعرض
 * «قريبًا» بسببه: «ما الجديد» وجولة التعريف (`STAGES/09`)، والإبلاغ عن مشكلة (`STAGES/13`)،
 * وسياسة الخصوصية (`STAGES/28`). والتراخيص تُعرض الآن من قائمة `licenses.ts`.
 */
import { useState } from 'preact/hooks'

import { Button } from '@/ui/components/Button/Button'
import { Chip } from '@/ui/components/Chip/Chip'
import { Footer } from '@/ui/components/Footer/Footer'
import { SettingRow } from '@/ui/components/SettingRow/SettingRow'
import { KeyCap } from '@/ui/TechnicalValue'

import styles from './AboutSection.module.css'
import { Group } from './Group'
import { LicensesDialog } from './LicensesDialog'

const SOON = <Chip tone="neutral">قريبًا</Chip>

export interface AboutSectionProps {
  version: string
}

export function AboutSection({ version }: AboutSectionProps) {
  const [licenses, setLicenses] = useState(false)

  return (
    <>
      <Group title="الإصدار" id="about-version">
        <SettingRow
          id="about-rasd"
          label="رصد"
          hint="فحص بصري لصفحات الويب: التقاط وتعليق وفحص وقياس وألوان ومقارنة"
          divider
          control={
            <Chip tone="brand" dot={false}>
              <bdi dir="ltr">{version}</bdi>
            </Chip>
          }
        />
        <SettingRow label="ما الجديد" hint="ما تغيّر في هذا الإصدار" divider control={SOON} />
        <SettingRow
          label="جولة التعريف"
          hint="الخطوات الأربع التي تظهر عند التثبيت"
          control={SOON}
        />
      </Group>

      <Group title="الدعم" id="about-support">
        <SettingRow
          label="أبلغ عن مشكلة"
          hint="يصل بلاغك إلى جهة الدعم وحدها، ولا يُنشر للعامة"
          divider
          control={SOON}
        />
        <SettingRow
          label="سياسة الخصوصية"
          hint="ما يُحفظ على جهازك، وما يُرسَل حين تطلب أنت"
          divider
          control={SOON}
        />
        <SettingRow
          label="ورقة الاختصارات"
          hint="تُفتح من أي صفحة في رصد"
          control={<KeyCap>?</KeyCap>}
        />
      </Group>

      <Group title="التراخيص" id="about-licenses">
        <SettingRow
          label="تراخيص المكتبات"
          hint="المكتبات والخطوط مفتوحة المصدر المضمَّنة في رصد"
          control={
            <Button variant="secondary" size="s" onClick={() => setLicenses(true)}>
              اعرض التراخيص
            </Button>
          }
        />
      </Group>

      <Footer layout="inline" class={styles.footer} />

      {licenses ? <LicensesDialog onClose={() => setLicenses(false)} /> : null}
    </>
  )
}
