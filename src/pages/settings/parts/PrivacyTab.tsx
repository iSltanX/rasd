/**
 * تبويب الخصوصية والصلاحيات — `§11` و`§12.5` (الوحدة 20.3).
 *
 * **ولماذا تبويبٌ هنا لا صفحةٌ مستقلّة في `PAGE_PATHS`.** سؤالٌ تركته
 * `Phase_20.md §8` مفتوحًا وأمرت بالتحقّق منه لا افتراضه — وحُسم بالقياس في
 * المصدر: إطار `privacy / controls` (‏`68:416`) وإطار `settings / capture`
 * (‏`68:306`) يتقاسمان `section-nav` **واحدًا متطابقًا حرفًا بحرف** في الموضع
 * والمقاس (‏x=984 · 212×790) وبالعناصر الثمانية نفسها بالترتيب نفسه، و«الخصوصية»
 * عنصره الخامس. فالتصميم يجعلها **قسمًا شقيقًا داخل قشرة الإعدادات** لا شاشة
 * منفصلة. والاختبار المطبَّق هو نفسه الذي حسم `22 — Export` في المرحلة 19
 * (صفحة Figma مستقلّة نُفِّذت نافذةً بلا مدخل في `PAGE_PATHS`): **هندسة الإطار
 * تحكم، لا اسم الصفحة**.
 *
 * والانحراف الباقي مُسجَّل لا مطويّ: المنفَّذ شريط `Tabs` أفقي بستّة عناصر،
 * والمرسوم تنقّل رأسيّ بثمانية (فيه «التكاملات» و«عن رصد» بلا شاشة مبنيّة بعد).
 * يُصحَّح في Figma عند الوحدة 26.1 مع الصفّ 111 (‏`Rasd_Plan.md §6` صفّ 125).
 */
import { useState } from 'preact/hooks'

import { formatHuman, plural } from '@/shared/bidi'
import { Banner } from '@/ui/components/Banner/Banner'
import { Chip } from '@/ui/components/Chip/Chip'
import {
  SegmentedControl,
  type SegmentedOption,
} from '@/ui/components/SegmentedControl/SegmentedControl'
import { Toggle } from '@/ui/components/Toggle/Toggle'

import { ExcludedSites } from './ExcludedSites'
import { PermissionsPanel } from './PermissionsPanel'
import styles from './SettingsTab.module.css'

import type { Result } from '@/shared/result'
import type { Settings } from '@/shared/settings'

const INCOGNITO_OPTIONS: readonly SegmentedOption[] = [
  { value: 'allow', label: 'يعمل ويحفظ' },
  { value: 'no-save', label: 'يعمل بلا حفظ' },
  { value: 'off', label: 'معطَّل' },
]

/**
 * المدد الأربع كما يعرضها الضابط.
 *
 * **و`plural` لا تصلح لـ30 و90**: قاعدتها تُرجع صيغة المفرد المرفوع لما فوق
 * العشرة (`numerals.ts`: `count >= 11` ⟵ `one`)، فتُنتج «٣٠ يوم» والصواب
 * التمييز المنصوب «٣٠ يومًا». وهي صحيحة لـ7 (‏3–10 ⟵ جمع قلّة: «٧ أيام»).
 * رصدته قراءة شجرة الإتاحة الحقيقية في هذه الوحدة.
 */
const RETENTION_OPTIONS: readonly SegmentedOption[] = [
  { value: '0', label: 'بلا حذف' },
  { value: '7', label: plural(7, 'يوم', 'يومان', 'أيام') },
  { value: '30', label: `${formatHuman(30)} يومًا` },
  { value: '90', label: `${formatHuman(90)} يومًا` },
]

export interface PrivacyTabProps {
  settings: Settings
  onSave: (patch: Partial<Settings['privacy']>) => Promise<Result<Settings>>
  onAddSite: (raw: string) => Promise<Result<Settings> | 'invalid'>
  onRemoveSite: (value: string) => Promise<Result<Settings>>
  onImportSites: (
    entries: readonly unknown[],
  ) => Promise<{ result: Result<Settings>; added: number; rejected: number }>
}

export function PrivacyTab({
  settings,
  onSave,
  onAddSite,
  onRemoveSite,
  onImportSites,
}: PrivacyTabProps) {
  const [failed, setFailed] = useState(false)
  const { privacy } = settings

  const save = (patch: Partial<Settings['privacy']>) => {
    void onSave(patch).then((result) => setFailed(!result.ok))
  }

  const incognitoIndex = Math.max(
    0,
    INCOGNITO_OPTIONS.findIndex((o) => o.value === privacy.incognito),
  )
  const retentionIndex = Math.max(
    0,
    RETENTION_OPTIONS.findIndex((o) => o.value === String(privacy.autoDeleteAfterDays)),
  )

  return (
    <section class={styles.tab}>
      {failed ? (
        <Banner tone="danger">تعذّر حفظ الإعداد — أُعيد المعروض إلى آخر قيمة محفوظة.</Banner>
      ) : null}

      <div class={styles.section}>
        <span class={styles.sectionTitle}>المواقع</span>
      </div>

      <div class={styles.row}>
        <span class={styles.rowLabel}>
          لا يعمل في
          <span class={styles.rowHint}>
            المواقع البنكية والبريد ولوحات الإدارة. الاستثناء يُنفَّذ عند بوّابة الحقن نفسها — فلا
            يُحقَن شيء في الموقع المستثنى ولو منحتَه إذنًا من قبل.
          </span>
        </span>
        <div class={styles.rowControl}>
          <Chip tone={privacy.excludedSites.length > 0 ? 'brand' : 'neutral'}>
            {privacy.excludedSites.length === 0
              ? 'لا استثناءات'
              : plural(
                  privacy.excludedSites.length,
                  'موقع مستثنى',
                  'موقعان مستثنيان',
                  'مواقع مستثناة',
                )}
          </Chip>
        </div>
      </div>

      <ExcludedSites
        sites={privacy.excludedSites}
        onAdd={async (raw) => {
          const outcome = await onAddSite(raw)
          if (outcome === 'invalid') return 'invalid'
          return outcome.ok ? 'ok' : 'failed'
        }}
        onRemove={async (value) => (await onRemoveSite(value)).ok}
        onImport={async (entries) => {
          const { result, added, rejected } = await onImportSites(entries)
          return result.ok ? { added, rejected } : 'failed'
        }}
      />

      <div class={styles.row}>
        <span class={styles.rowLabel}>
          التصفّح الخاص
          <span class={styles.rowHint}>
            {privacy.incognito === 'off'
              ? 'رصد لا يُحقَن في النوافذ الخاصّة إطلاقًا.'
              : privacy.incognito === 'no-save'
                ? 'رصد يعمل في النوافذ الخاصّة ولا يكتب شيئًا على القرص — لا لقطة ولا سجلّ.'
                : 'رصد يعمل ويحفظ في النوافذ الخاصّة كما في العادية.'}
          </span>
        </span>
        <div class={styles.rowControl}>
          <SegmentedControl
            options={INCOGNITO_OPTIONS}
            selected={incognitoIndex}
            aria-label="سلوك رصد في التصفّح الخاص"
            onChange={(index) =>
              save({
                incognito: INCOGNITO_OPTIONS[index]?.value as Settings['privacy']['incognito'],
              })
            }
          />
        </div>
      </div>

      <div class={styles.section}>
        <span class={styles.sectionTitle}>البيانات</span>
      </div>

      {/*
       * **«الوضع المحلي فقط» يُعرض وصفًا لواقعٍ مقيس، لا ضمانًا لحراسةٍ قائمة.**
       * لا مسار رفع في المنتج اليوم — ثلاثة نداءات `fetch` كلّها محلّية — و
       * `connect-src 'self'` تُنفَّذ فعلًا (‏مقيسةً: ترفض حتى عناوين `data:`
       * الخاصّة بنا)، و`verify:dist` يُسقط البناء على أي مصدر خارجي فيها **أو
       * على غيابها**. أمّا المفتاح نفسه فبلا إنفاذ برمجيّ اليوم بحكم
       * [ADR 0020](../../../Docs/ADR/0020-injection-gate.md): إنفاذه يخصّ طبقة
       * الرفع التي تبنيها الوحدة 21.2، وسلكُه في بوّابة الحقن كان سيمنع الحقن
       * على كل صفحة لكل مستخدم لأن افتراضه `true`. ولذلك يقول التلميح ما يصدق
       * اليوم ويصدق غدًا: التزامٌ يقرؤه عميل المشاركة قبل أوّل طلب — لا وعدٌ
       * بحاجزٍ لا وجود له. (‏`Rasd_Plan.md §6` صفّ 126.)
       */}
      <div class={styles.row}>
        <span class={styles.rowLabel}>
          الوضع المحلي فقط
          <span class={styles.rowHint}>
            لا يحتوي رصد اليوم على أي مسار يرسل بياناتك إلى الشبكة، وسياسة أمن المحتوى في صفحات
            الإضافة وعاملها تحجب الاتصال الخارجي أصلًا. وهذا المفتاح التزامٌ مسبق: مسارات المشاركة
            حين تُبنى تقرؤه قبل أن يخرج أي طلب.
          </span>
        </span>
        <div class={styles.rowControl}>
          <Toggle
            on={privacy.localOnly}
            label="الوضع المحلي فقط"
            onChange={(on) => save({ localOnly: on })}
          />
        </div>
      </div>

      <div class={styles.row}>
        <span class={styles.rowLabel}>
          احذف تلقائيًا اللقطات الأقدم من
          <span class={styles.rowHint}>
            حذفٌ نهائيّ لا إلى المهملات — «سبعة أيام» تعني سبعة لا سبعة وثلاثين. واللقطات المميَّزة
            مستثناة دائمًا.
          </span>
        </span>
        <div class={styles.rowControl}>
          <SegmentedControl
            options={RETENTION_OPTIONS}
            selected={retentionIndex}
            aria-label="مدّة الاحتفاظ باللقطات"
            onChange={(index) =>
              save({
                autoDeleteAfterDays: Number(
                  RETENTION_OPTIONS[index]?.value,
                ) as Settings['privacy']['autoDeleteAfterDays'],
              })
            }
          />
        </div>
      </div>

      {/*
       * صفّان يرسمهما إطار Figma داخل هذه البطاقة نفسها، ونطاقهما وحدتان
       * أخريان (‏`20.5` التشفير · `20.4` الحذف الكامل). يُعرضان معطَّلَين
       * بوسم «قريبًا» لا يُتركان ثقبًا في وسط البطاقة: نمط الصفّ 4 في `§6`
       * حرفيًّا — «معلَّم قريبًا لا مخفيّ ولا موعود كذبًا».
       */}
      <div class={styles.row} aria-disabled="true">
        <span class={styles.rowLabel}>
          شفّر المكتبة المحلية
          <span class={styles.rowHint}>افتحها برمز — يُبنى في الوحدة 20.5.</span>
        </span>
        <div class={styles.rowControl}>
          <Chip tone="neutral">قريبًا</Chip>
        </div>
      </div>

      <div class={styles.row} aria-disabled="true">
        <span class={styles.rowLabel}>
          احذف كل البيانات
          <span class={styles.rowHint}>
            يحذف اللقطات واللوحات والسجلّ — يُبنى في الوحدة 20.4 بتأكيد مزدوج.
          </span>
        </span>
        <div class={styles.rowControl}>
          <Chip tone="neutral">قريبًا</Chip>
        </div>
      </div>

      <PermissionsPanel />
    </section>
  )
}
