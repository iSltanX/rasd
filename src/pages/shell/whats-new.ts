/**
 * «ما الجديد» — بنود كل إصدار من `CHANGELOG.md` نفسه، لا نسخةٌ منها في الشيفرة.
 *
 * الملفّ يُضمَّن نصًّا في حزمة الصفحات وقت البناء (`?raw`)، ويُحلَّل هنا عند العرض. فبطاقة الإصدار
 * وسجلّ التغييرات مصدرٌ واحد لا يفترقان، و`tests/unit/changelog.test.ts` يُسقط البناء إن غاب عنوان
 * النسخة الحالية أو حمل بندٌ تنسيقًا لا تعرضه البطاقة.
 */

import { VERSION } from '@/shared/env'
import { getSettingsResult, updateSettings } from '@/shared/settings'
import { compareVersions, isVersion } from '@/shared/version'

import changelogSource from '../../../CHANGELOG.md?raw'

export interface ChangelogEntry {
  version: string
  /** `YYYY-MM-DD`، أو `null` حين يغيب عن العنوان. */
  date: string | null
  items: string[]
}

const ENTRY_HEADING = /^## (\S+)(?:\s+—\s+(\d{4}-\d{2}-\d{2}))?\s*$/u
const ANY_HEADING = /^#{1,6}\s/u
const ITEM = /^- (.+)$/u
const CONTINUATION = /^\s+(\S.*)$/u

/**
 * يحلّل السجلّ إلى إصداراته بترتيبها فيه. عنوان `##` برقم نسخة يفتح إصدارًا، وأي عنوان آخر يغلقه،
 * و`- ` داخله بند. **وسطرٌ مُزاح بعد بند تكملةٌ له** — البند الطويل يُلفّ كما تُلفّ المقدّمة، وكان
 * ما بعد سطره الأوّل يسقط صامتًا. وما قبل أوّل إصدار (المقدّمة وقواعد الكتابة) لا يُقرأ بنودًا.
 */
export function parseChangelog(source: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = []
  let current: ChangelogEntry | null = null
  for (const raw of source.split(/\r?\n/u)) {
    const line = raw.trimEnd()
    const heading = ENTRY_HEADING.exec(line)
    if (heading?.[1] && isVersion(heading[1])) {
      current = { version: heading[1], date: heading[2] ?? null, items: [] }
      entries.push(current)
      continue
    }
    if (ANY_HEADING.test(line)) {
      current = null
      continue
    }
    if (!current) continue
    const item = ITEM.exec(line)
    if (item?.[1]) {
      current.items.push(item[1].trim())
      continue
    }
    const more = CONTINUATION.exec(line)
    const last = current.items.length - 1
    if (more?.[1] && last >= 0) current.items[last] = `${current.items[last]} ${more[1].trim()}`
  }
  return entries
}

/** إصدارات `CHANGELOG.md` كما ضُمِّن في هذه الحزمة. */
export const CHANGELOG: readonly ChangelogEntry[] = parseChangelog(changelogSource)

/** بنود نسخةٍ بعينها — `1.0` و`1.0.0` نسخةٌ واحدة — أو `null` حين لا عنوان لها أو لا بنود. */
export function entryFor(
  version: string,
  entries: readonly ChangelogEntry[] = CHANGELOG,
): ChangelogEntry | null {
  if (!isVersion(version)) return null
  const found = entries.find((e) => compareVersions(e.version, version) === 0)
  return found && found.items.length > 0 ? found : null
}

/** النسخة كما تُكتب في العنوان: الأصفار الذيلية بعد الرقمين الأوّلين تُحذف (`1.0.0` ← `1.0`). */
export function displayVersion(version: string): string {
  const parts = version.split('.')
  while (parts.length > 2 && parts.at(-1) === '0') parts.pop()
  return parts.join('.')
}

/**
 * يأخذ بطاقة «ما الجديد» المعلَّقة **ويمحوها** — فتظهر مرّة واحدة لا في كل صفحة تُفتح.
 *
 * المحو يسبق العرض ويشترطه: كتابةٌ فشلت تعني أن البطاقة ستعود في الصفحة التالية، فلا تُعرض الآن
 * كي لا تتكرّر. والأخذ داخل طابور الكتابة (`updateSettings`) كي لا تأخذها كتابتان في السياق نفسه.
 * ومعلَّقةٌ لنسخةٍ غير المثبَّتة، أو بلا بنود في السجلّ، تُمحى ولا تُعرض.
 */
export async function claimPendingWhatsNew(
  version: string = VERSION,
  entries: readonly ChangelogEntry[] = CHANGELOG,
): Promise<ChangelogEntry | null> {
  const read = await getSettingsResult()
  if (!read.ok || read.value.whatsNew.pending === null) return null

  // حاويةٌ لا متغيّر: ما يُكتب داخل الدالّة الممرَّرة لا يراه تضييق الأنواع خارجها.
  const taken: { version: string | null } = { version: null }
  const written = await updateSettings((current) => {
    taken.version = current.whatsNew.pending
    return taken.version === null ? {} : { whatsNew: { pending: null } }
  })
  const claimed = taken.version
  if (!written.ok || claimed === null) return null
  if (!isVersion(claimed) || !isVersion(version) || compareVersions(claimed, version) !== 0) {
    return null
  }
  return entryFor(version, entries)
}
