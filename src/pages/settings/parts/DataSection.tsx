/**
 * قسم البيانات (`settings / data`، `282:1318`) — المساحة والتخزين الدائم، والنسخ الاحتياطي والاستعادة،
 * ونقل الإعدادات وإعادة ضبطها، وحذف كل البيانات (`STAGES/07`).
 *
 * **كل صفٍّ يقرأ أو يفعل ما يقوله:** المساحة من `navigator.storage.estimate()` لا رقمٌ مرسوم، ومعها تنبيهٌ
 * قبل الامتلاء بعتبة المكتبة نفسها (`quota.ts`)؛ والتخزين الدائم ما قرّره المتصفّح للطلب (`persistence.ts`)؛
 * والنسخ والاستعادة والحذف تجري في هذه الصفحة — صفحة إضافة تملك التخزين — فمكتبةٌ بمئات الميغابايتات لا
 * تعبر رسائل الخلفية.
 *
 * **صلاحية `downloads` تُطلب في النقرة نفسها** (`startBackup`) كنمط التصدير: `chrome.permissions.request`
 * يرمي خارج سلسلة الإيماءة، فحالتها تُقرأ عند الفتح لا بعد النقرة.
 */
import { useCallback, useEffect, useRef, useState } from 'preact/hooks'

import {
  afterAsk,
  planDownload,
  type PermissionState,
  type DownloadRoute,
} from '@/modules/export/download'
import { formatHuman, formatPercent, formatStorage } from '@/shared/bidi'
import { VERSION } from '@/shared/env'
import { hasPermission, requestPermission } from '@/shared/permissions'
import { getSettingsResult, resetSettings, type Settings } from '@/shared/settings'
import {
  applySettingsImport,
  planSettingsImport,
  settingsFile,
  settingsFilename,
  type SettingsFileFailure,
  type SettingsImportPlan,
} from '@/shared/settings/transfer'
import { Banner } from '@/ui/components/Banner/Banner'
import { Button } from '@/ui/components/Button/Button'
import { Chip } from '@/ui/components/Chip/Chip'
import { SettingRow } from '@/ui/components/SettingRow/SettingRow'

import { downloadsRefused, rememberRefusal } from '../../export/permission-memory'
import { downloadText, loadOverview, type DataOverview } from '../data-context'

import { BackupDialog } from './data/BackupDialog'
import { DeleteDialog } from './data/DeleteDialog'
import { ImportSettingsDialog } from './data/ImportSettingsDialog'
import { ResetDialog } from './data/ResetDialog'
import { RestoreDialog } from './data/RestoreDialog'
import { Group } from './Group'

import type { PersistenceState } from '@/shared/storage/persistence'
import type { JSX } from 'preact'

const MB = 1024 * 1024

/**
 * المساحة بالميغابايت في سطر الشرح — **وما دون الميغابايت لا يُقرَّب إلى صفر**: «٠ ميغابايت» بجوار
 * شارة «286 KB» تناقضٌ في السطر نفسه (`STAGES/04`، لقطة `settings / data`).
 */
function usageMegabytes(bytes: number): string {
  const mb = Math.round(bytes / MB)
  return mb < 1 ? 'أقلّ من ميغابايت' : `${formatHuman(mb)} ميغابايت`
}

const PERSISTENCE: Record<
  PersistenceState,
  { readonly chip: string; readonly tone: 'success' | 'neutral'; readonly hint: string }
> = {
  persisted: {
    chip: 'مفعَّل',
    tone: 'success',
    hint: 'يمنع المتصفّح من حذف المكتبة عند ضيق المساحة',
  },
  denied: {
    chip: 'لم يمنحه المتصفّح',
    tone: 'neutral',
    hint: 'طلبه رصد ولم يمنحه المتصفّح. النسخة الاحتياطية تحمي المكتبة من الفقد',
  },
  'not-requested': {
    chip: 'غير مفعَّل',
    tone: 'neutral',
    hint: 'يُطلب عند أوّل حفظ، ويمنع المتصفّح من حذف المكتبة عند ضيق المساحة',
  },
  unsupported: {
    chip: 'غير معروف',
    tone: 'neutral',
    hint: 'تعذّرت قراءة حالته في هذا المتصفّح',
  },
}

type Dialog =
  | {
      readonly kind: 'backup'
      readonly route: DownloadRoute
      readonly note: string | null
      /** يعود إلى تأكيد الحذف بعدها — «خذ نسخة احتياطية أوّلًا». */
      readonly then: 'delete' | null
    }
  | { readonly kind: 'restore'; readonly file: File }
  | {
      readonly kind: 'import'
      readonly fileName: string
      readonly plan: SettingsImportPlan | SettingsFileFailure | 'unreadable'
    }
  | { readonly kind: 'reset' }
  | { readonly kind: 'delete' }
  | null

export interface DataSectionProps {
  readonly settings: Settings
  /** إشعار نجاح بنصّه في الصفحة (`settings / saved`). */
  readonly onAnnounce: (title: string, detail: string) => void
  /** تغيّرت المكتبة (استعادة أو حذف) — يُعاد عدّ الشريط الجانبي. */
  readonly onLibraryChanged: () => void
}

export function DataSection({
  settings,
  onAnnounce,
  onLibraryChanged,
}: DataSectionProps): JSX.Element {
  const [overview, setOverview] = useState<DataOverview | null>(null)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const permission = useRef<PermissionState>('unknown')
  const restoreInput = useRef<HTMLInputElement>(null)
  const importInput = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async () => {
    const next = await loadOverview()
    setOverview(next)
    return next
  }, [])

  useEffect(() => {
    void refresh()
    let live = true
    void (async () => {
      if (await hasPermission(['downloads'])) {
        if (live) permission.current = 'granted'
        return
      }
      if ((await downloadsRefused()) && live) permission.current = 'denied'
    })()
    return () => {
      live = false
    }
  }, [refresh])

  /** **متزامنةٌ من النقرة** — لا `await` قبل `requestPermission` (نمط `ExportFlow`). */
  const startBackup = (then: 'delete' | null) => {
    const decision = planDownload(permission.current)
    if (!decision.ask) {
      setDialog({ kind: 'backup', route: decision.route, note: decision.note, then })
      return
    }
    void requestPermission(['downloads']).then(async (outcome) => {
      const next = afterAsk(outcome)
      if (next.remember) {
        permission.current = next.remember
        if (next.remember === 'denied') await rememberRefusal()
      }
      setDialog({ kind: 'backup', route: next.decision.route, note: next.decision.note, then })
    })
  }

  const exportSettings = async () => {
    setProblem(null)
    const current = await getSettingsResult()
    if (!current.ok) {
      setProblem('تعذّرت قراءة الإعدادات، فلم يُصدَّر ملفّ. أعد المحاولة بعد قليل.')
      return
    }
    const now = Date.now()
    const filename = settingsFilename(now)
    downloadText(settingsFile(current.value, now, VERSION), filename, 'application/json')
    onAnnounce('صُدّرت الإعدادات', filename)
  }

  const importFile = async (file: File) => {
    const current = await getSettingsResult()
    if (!current.ok) {
      setDialog({ kind: 'import', fileName: file.name, plan: 'unreadable' })
      return
    }
    const planned = planSettingsImport(await file.text(), current.value)
    setDialog({
      kind: 'import',
      fileName: file.name,
      plan: planned.ok ? planned.value : planned.error,
    })
  }

  const pick = (input: HTMLInputElement | null) => {
    if (!input) return
    input.value = ''
    input.click()
  }

  const closeDialog = () => {
    const reopen = dialog?.kind === 'backup' && dialog.then === 'delete'
    setDialog(reopen ? { kind: 'delete' } : null)
  }

  const libraryChanged = () => {
    onLibraryChanged()
    void refresh()
  }

  const quota = overview?.quota ?? null
  const known = quota !== null && quota.quotaBytes > 0
  const persistence = PERSISTENCE[overview?.persistence ?? 'unsupported']
  const sites = settings.privacy.excludedSites.length

  return (
    <>
      {problem ? (
        <Banner tone="danger" onDismiss={() => setProblem(null)}>
          {problem}
        </Banner>
      ) : null}

      <Group title="المساحة" id="data-storage">
        <SettingRow
          id="data-usage"
          label="المساحة المستخدمة"
          hint={
            quota === null
              ? 'تُقاس المساحة…'
              : known
                ? `${usageMegabytes(quota.usageBytes)} من حصّة يمنحها المتصفّح لرصد`
                : 'تعذّر قياس المساحة في هذا المتصفّح'
          }
          divider
          control={
            <Chip tone={quota?.level === 'ok' || !known ? 'neutral' : 'warning'} dot={false}>
              <bdi dir="ltr" data-usage-bytes={known ? String(quota.usageBytes) : ''}>
                {known ? formatStorage(quota.usageBytes) : '—'}
              </bdi>
            </Chip>
          }
        />
        <SettingRow
          id="data-persist"
          label="التخزين الدائم"
          hint={persistence.hint}
          control={
            overview === null ? null : (
              <span data-persistence={overview.persistence}>
                <Chip tone={persistence.tone}>{persistence.chip}</Chip>
              </span>
            )
          }
        />
      </Group>
      {known && quota.level !== 'ok' ? (
        <Banner tone={quota.level === 'block' ? 'danger' : 'warning'}>
          {quota.level === 'block'
            ? `المساحة ممتلئة تقريبًا (${formatPercent(quota.ratio)} من الحصّة): لا تُحفظ لقطةٌ جديدة حتى تُفرغ بعضها. خذ نسخة احتياطية ثمّ احذف ما لا تحتاجه.`
            : `المساحة تكاد تمتلئ (${formatPercent(quota.ratio)} من الحصّة). خذ نسخة احتياطية ثمّ احذف ما لا تحتاجه من المكتبة.`}
        </Banner>
      ) : null}

      <Group title="النسخ الاحتياطي" id="data-backup">
        <SettingRow
          id="data-backup-create"
          label="خذ نسخة احتياطية للمكتبة"
          hint="ملفّ واحد فيه اللقطات والمشاريع والوسوم واللوحات والأدلّة والمراجع والمشكلات"
          divider
          control={
            <Button variant="primary" size="s" onClick={() => startBackup(null)}>
              أنشئ نسخة
            </Button>
          }
        />
        <SettingRow
          id="data-backup-restore"
          label="استعد من نسخة احتياطية"
          hint="تُضاف محتويات الملفّ إلى مكتبتك الحالية"
          control={
            <Button variant="secondary" size="s" onClick={() => pick(restoreInput.current)}>
              اختر ملفًّا
            </Button>
          }
        />
      </Group>

      <Group title="الإعدادات" id="data-settings">
        <SettingRow
          id="data-settings-export"
          label="صدّر الإعدادات"
          hint="ملفّ JSON تنقله إلى متصفّح آخر"
          divider
          control={
            <Button variant="secondary" size="s" onClick={() => void exportSettings()}>
              صدّر
            </Button>
          }
        />
        <SettingRow
          id="data-settings-import"
          label="استورد الإعدادات"
          hint="يعرض رصد ما قُبل وما أُسقط قبل الحفظ"
          divider
          control={
            <Button variant="secondary" size="s" onClick={() => pick(importInput.current)}>
              استورد
            </Button>
          }
        />
        <SettingRow
          id="data-settings-reset"
          label="أعد ضبط الإعدادات"
          hint="تعود كل الإعدادات إلى قيمها الأولى. المكتبة لا تُمسّ"
          control={
            <Button variant="secondary" size="s" onClick={() => setDialog({ kind: 'reset' })}>
              أعد الضبط
            </Button>
          }
        />
      </Group>

      <Group title="منطقة الخطر" id="data-danger">
        <SettingRow
          id="data-erase"
          label="احذف كل البيانات"
          hint="يحذف اللقطات واللوحات والأدلّة والإعدادات نهائيًّا"
          control={
            <Button
              variant="danger"
              size="s"
              onClick={() => void refresh().then(() => setDialog({ kind: 'delete' }))}
            >
              احذف كل البيانات
            </Button>
          }
        />
      </Group>

      <input
        ref={restoreInput}
        type="file"
        accept=".zip,application/zip"
        hidden
        data-restore-input=""
        onChange={(e) => {
          const file = e.currentTarget.files?.[0]
          if (file) setDialog({ kind: 'restore', file })
        }}
      />
      <input
        ref={importInput}
        type="file"
        accept=".json,application/json"
        hidden
        data-import-input=""
        onChange={(e) => {
          const file = e.currentTarget.files?.[0]
          if (file) void importFile(file)
        }}
      />

      {dialog?.kind === 'backup' ? (
        <BackupDialog
          route={dialog.route}
          note={dialog.note}
          onClose={closeDialog}
          onDelivered={(at) =>
            setOverview((current) => (current ? { ...current, lastBackup: at } : current))
          }
        />
      ) : null}
      {dialog?.kind === 'restore' ? (
        <RestoreDialog
          file={dialog.file}
          onClose={closeDialog}
          onPickAnother={() => pick(restoreInput.current)}
          onRestored={libraryChanged}
        />
      ) : null}
      {dialog?.kind === 'import' ? (
        <ImportSettingsDialog
          fileName={dialog.fileName}
          plan={dialog.plan}
          onSave={applySettingsImport}
          onClose={closeDialog}
          onSaved={(accepted) => {
            setDialog(null)
            onAnnounce('استُوردت الإعدادات', `قُبل منها ${formatHuman(accepted)}.`)
          }}
        />
      ) : null}
      {dialog?.kind === 'reset' ? (
        <ResetDialog
          sites={sites}
          onReset={resetSettings}
          onClose={closeDialog}
          onDone={() => {
            setDialog(null)
            onAnnounce('أُعيدت الإعدادات إلى قيمها الأولى', 'تسري على كل صفحات رصد المفتوحة.')
          }}
        />
      ) : null}
      {dialog?.kind === 'delete' ? (
        <DeleteDialog
          counts={overview?.counts ?? null}
          lastBackup={overview?.lastBackup ?? null}
          onBackup={() => startBackup('delete')}
          onClose={closeDialog}
          onErased={libraryChanged}
        />
      ) : null}
    </>
  )
}
