/**
 * قسم «عن رصد» (`settings / about`، `282:1656`): الإصدار والدعم والتراخيص والتذييل.
 *
 * الإصدار من البيان المحمَّل فعلًا لا ثابتًا مكتوبًا. «ما الجديد» يعرض بطاقة الإصدار المثبَّت من
 * `CHANGELOG.md`، و«أعد العرض» يفتح جولة التعريف في تبويب — ولا يمحو علامة «شوهد»: من أعادها
 * بيده لا تعود إليه ترحيبيّة النافذة. وما محرّكه في مرحلة لاحقة يُعرض «قريبًا» بسببه: سياسة
 * الخصوصية (`STAGES/28`). و«أبلغ عن مشكلة» يفتح نافذة البلاغ (ADR 0050) — ويفتحها الرابط نفسه
 * (`?report=1`) حين يأتي من «أبلغ عن المشكلة» في رسالة خطأ. والتراخيص من قائمة `licenses.ts`.
 */
import { useState } from 'preact/hooks'

import { PAGE_PATHS } from '@/shared/page-paths'
import { Button } from '@/ui/components/Button/Button'
import { Chip } from '@/ui/components/Chip/Chip'
import { Footer } from '@/ui/components/Footer/Footer'
import { SettingRow } from '@/ui/components/SettingRow/SettingRow'
import { KeyCap } from '@/ui/TechnicalValue'

import { entryFor } from '../../shell/whats-new'
import { WhatsNewDialog } from '../../shell/WhatsNewDialog'

import styles from './AboutSection.module.css'
import { Group } from './Group'
import { LicensesDialog } from './LicensesDialog'
import { ReportDialog, type ReportRequest } from './report/ReportDialog'

const SOON = <Chip tone="neutral">قريبًا</Chip>

export interface AboutSectionProps {
  version: string
  /** طلب بلاغٍ من الرابط — النافذة تُفتح به عند التحميل. */
  reportRequest?: ReportRequest | null
  onOpenPrivacy?: () => void
}

export function AboutSection({ version, reportRequest = null, onOpenPrivacy }: AboutSectionProps) {
  const [licenses, setLicenses] = useState(false)
  const [report, setReport] = useState<{ request: ReportRequest | null } | null>(
    reportRequest ? { request: reportRequest } : null,
  )
  const [whatsNew, setWhatsNew] = useState(false)
  const entry = entryFor(version)

  return (
    <>
      <Group title="الإصدار" id="about-version">
        <SettingRow
          id="about-rasd"
          label="رصد"
          hint="فحص بصري لصفحات الويب: التقاط وتعليق وفحص وقياس وألوان ومقارنة"
          divider
          control={
            <Chip tone="neutral">
              <bdi dir="ltr">{version}</bdi>
            </Chip>
          }
        />
        <SettingRow
          label="ما الجديد"
          hint="ما تغيّر في هذا الإصدار"
          divider
          control={
            entry ? (
              <Button variant="secondary" size="s" onClick={() => setWhatsNew(true)}>
                اعرض
              </Button>
            ) : (
              <Chip tone="neutral">لا بنود لهذا الإصدار</Chip>
            )
          }
        />
        <SettingRow
          label="جولة التعريف"
          hint="الخطوات الأربع التي تظهر عند التثبيت"
          control={
            <Button
              variant="secondary"
              size="s"
              onClick={() =>
                void chrome.tabs.create({ url: chrome.runtime.getURL(PAGE_PATHS.onboarding) })
              }
            >
              أعد العرض
            </Button>
          }
        />
      </Group>

      <Group title="الدعم" id="about-support">
        <SettingRow
          label="أبلغ عن مشكلة"
          hint="يصل بلاغك إلى جهة الدعم وحدها، ولا يُنشر للعامة"
          divider
          control={
            <Button size="s" onClick={() => setReport({ request: null })}>
              أبلغ عن مشكلة
            </Button>
          }
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
      {report ? (
        <ReportDialog
          request={report.request}
          onClose={() => {
            setReport(null)
            // الرابط يُستهلك مرّة: إعادة تحميل الصفحة بعد الإغلاق لا تعيد فتح النافذة.
            if (new URLSearchParams(location.search).has('report')) {
              history.replaceState(null, '', '?section=about')
            }
          }}
          onOpenPrivacy={() => {
            setReport(null)
            onOpenPrivacy?.()
          }}
        />
      ) : null}
      {whatsNew && entry ? (
        <WhatsNewDialog entry={entry} origin="about" onClose={() => setWhatsNew(false)} />
      ) : null}
    </>
  )
}
