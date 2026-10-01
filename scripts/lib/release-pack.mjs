/**
 * حزمة الإصدار — فحصها وضغطها ضغطًا حتميًّا (`STAGES/27`).
 *
 * **لماذا كاتب ZIP هنا لا أداة `zip`.** الأداة تكتب وقت تعديل كل ملفّ بتوقيت الجهاز، وترتيبَ قراءة
 * المجلّد، وحقولًا إضافية تختلف بين نسخها على macOS ولينكس — فحزمتان من مصدر واحد تختلفان بصمةً.
 * والكاتب هنا يرتّب المسارات، ويثبّت الوقت على 1980-01-01، ولا يكتب حقلًا إضافيًّا، ويضغط بـ`zlib` الذي
 * يحمله Node نفسه (`.nvmrc` واحد للجهاز وCI). فالبصمة دالّة المحتوى وحده.
 *
 * والفحص قبل الضغط: الحزمة التي تخرج من هنا لا تحمل خرائط مصدر ولا صفحات معاينة ولا ملفًّا مخفيًّا،
 * ونسخة بيانها هي نسخة `package.json`، وملفّ التراخيص فيها يذكر كل اعتمادية. والوسم إن أُعطي يطابق
 * النسخة ولا يُنقصها.
 */
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { crc32, deflateRawSync } from 'node:zlib'

import { LICENSES_FILE, listedPackages } from '../third-party-licenses.ts'

// ═══ جمع الملفّات ═══════════════════════════════════════════════════

/** كل ملفّ تحت `dir` بمسار نسبي بفاصل `/`، مرتّبةً. الملفّات المخفية تُفصل ولا تُضمّ. */
export function collect(dir) {
  const files = []
  const hidden = []
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name)
      const path = relative(dir, full).split(sep).join('/')
      if (entry.name.startsWith('.')) hidden.push(path)
      else if (entry.isDirectory()) walk(full)
      else if (entry.isFile()) files.push({ path, data: readFileSync(full) })
    }
  }
  walk(dir)
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  return { files, hidden: hidden.sort() }
}

// ═══ فحص الحزمة ═════════════════════════════════════════════════════

/** صفحات أدوات التطوير — تُبنى في وضع التطوير وحده (`vite.config.ts`) ولا تدخل حزمة المتجر. */
const DEV_PAGES = /(?:^|\/)(?:gallery|popup-preview|capture-preview)(?:[/.-]|$)/iu
const TEXT = /\.(?:js|mjs|css|html|json)$/u

/** صيغة النسخة التي يقبلها Chrome: حتى أربعة أعداد بلا أصفار بادئة، كلٌّ ≤ 65535، لا كلّها أصفار. */
export function chromeVersionProblem(version) {
  if (!/^(?:0|[1-9]\d{0,4})(?:\.(?:0|[1-9]\d{0,4})){0,3}$/u.test(version)) {
    return `النسخة «${version}» ليست صيغة Chrome: أعداد مفصولة بنقاط بلا أصفار بادئة`
  }
  const parts = version.split('.').map(Number)
  if (parts.some((n) => n > 65535)) return `النسخة «${version}» فيها عددٌ فوق 65535`
  if (parts.every((n) => n === 0)) return `النسخة «${version}» أصفار كلّها`
  return null
}

/**
 * عيوب الحزمة — قائمة فارغة تعني أنها قابلة للضغط.
 * `version` نسخة `package.json`، و`dependencies` أسماء تبعياته.
 */
export function packageProblems(files, { version, dependencies }) {
  const problems = []
  const byPath = new Map(files.map((f) => [f.path, f]))

  for (const { path, data } of files) {
    if (DEV_PAGES.test(path)) problems.push(`صفحة معاينة أو أداة تطوير في الحزمة: ${path}`)
    if (path.endsWith('.map')) problems.push(`خريطة مصدر في الحزمة: ${path}`)
    else if (TEXT.test(path) && data.includes('sourceMappingURL=')) {
      problems.push(`إشارة إلى خريطة مصدر في: ${path}`)
    }
  }

  const versionProblem = chromeVersionProblem(version)
  if (versionProblem) problems.push(versionProblem)

  const manifest = byPath.get('manifest.json')
  if (!manifest) problems.push('لا manifest.json في الحزمة')
  else {
    try {
      const built = JSON.parse(manifest.data.toString('utf8')).version
      if (built !== version) {
        problems.push(`نسخة البيان «${built}» لا تطابق package.json «${version}» — المصدر واحد`)
      }
    } catch {
      problems.push('manifest.json ليس JSON صالحًا')
    }
  }

  const licenses = byPath.get(LICENSES_FILE)
  if (!licenses) problems.push(`لا ${LICENSES_FILE} في الحزمة`)
  else {
    const listed = new Set(listedPackages(licenses.data.toString('utf8')))
    const missing = dependencies.filter((name) => !listed.has(name))
    if (missing.length > 0) {
      problems.push(`${LICENSES_FILE} لا يذكر: ${missing.join(' · ')}`)
    }
  }
  return problems
}

// ═══ الوسم والنسخة ══════════════════════════════════════════════════

const TAG = /^v(\d+\.\d+\.\d+)(?:-([0-9A-Za-z][0-9A-Za-z.-]*))?$/u

/** `v1.2.3` إصدار، و`v1.2.3-trial.1` تجريبي (إصدار مسبق) — وغيرهما لا يُقرأ. */
export function parseTag(tag) {
  const match = TAG.exec(tag)
  if (!match) return null
  return { version: match[1], prerelease: match[2] ?? null }
}

const compare = (a, b) => {
  const x = a.split('.').map(Number)
  const y = b.split('.').map(Number)
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

/**
 * عيوب الوسم: يطابق نسخة `package.json`، والإصدار (بلا لاحقة) أعلى من كل إصدار وُسم قبله — رقم النسخة
 * يحكم مسار الترقية فلا يُنقَص ولا يُكرَّر. والتجريبي لا يُقاس بالسلسلة: لا يُنشر.
 */
export function tagProblems(tag, version, existingTags) {
  const parsed = parseTag(tag)
  if (!parsed) return [`الوسم «${tag}» ليس vX.Y.Z ولا vX.Y.Z-<لاحقة>`]
  if (parsed.version !== version) {
    return [`الوسم «${tag}» لا يطابق نسخة package.json «${version}»`]
  }
  if (parsed.prerelease) return []
  const higher = existingTags
    .filter((other) => other !== tag)
    .map(parseTag)
    .filter((other) => other && !other.prerelease && compare(other.version, version) >= 0)
    .map((other) => `v${other.version}`)
  return higher.length > 0
    ? [
        `النسخة ${version} لا تعلو ما وُسم قبلها (${higher.join(' · ')}) — النسخة لا تُنقَص ولا تتكرّر`,
      ]
    : []
}

// ═══ الضغط الحتمي ═══════════════════════════════════════════════════

/** 1980-01-01 00:00 بصيغة DOS — أقدم ما تحمله ZIP، ثابتٌ في كل مدخل. */
const DOS_TIME = 0
const DOS_DATE = (1 << 5) | 1
/** ملفّ عادي `-rw-r--r--` بصيغة يونكس في الحقل الخارجي، و«صُنع على يونكس» في رأس الدليل. */
const EXTERNAL_ATTRS = (0o100644 << 16) >>> 0
const MADE_BY = (3 << 8) | 20

/** ملفّ ZIP من `[{ path, data }]` — مرتّبٌ بالمسار، فالبايتات دالّة المحتوى وحده. */
export function zip(files) {
  const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  const locals = []
  const centrals = []
  let offset = 0
  for (const { path, data } of sorted) {
    const name = Buffer.from(path, 'utf8')
    const deflated = deflateRawSync(data, { level: 9 })
    const stored = deflated.length >= data.length
    const body = stored ? data : deflated
    const method = stored ? 0 : 8
    const crc = crc32(data)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6)
    local.writeUInt16LE(method, 8)
    local.writeUInt16LE(DOS_TIME, 10)
    local.writeUInt16LE(DOS_DATE, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(body.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)
    locals.push(local, name, body)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(MADE_BY, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(method, 10)
    central.writeUInt16LE(DOS_TIME, 12)
    central.writeUInt16LE(DOS_DATE, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(body.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(EXTERNAL_ATTRS, 38)
    central.writeUInt32LE(offset, 42)
    centrals.push(central, name)

    offset += local.length + name.length + body.length
  }
  const directory = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(sorted.length, 8)
  end.writeUInt16LE(sorted.length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, directory, end])
}

export const sha256 = (data) => createHash('sha256').update(data).digest('hex')

// ═══ الحزمة كاملة ═══════════════════════════════════════════════════

/**
 * يفحص `files` ثمّ يضغطها. `verify` فحص الحزمة المبنيّة (`verify:dist` في السطر) — يُستدعى أوّلًا،
 * وسقوطه يرفض الضغط. يعيد `{ problems }` عند الرفض، أو `{ zip, sha, name, prerelease }`.
 */
export function pack({ files, version, dependencies, tag = null, tags = [], verify }) {
  if (!verify()) return { problems: ['فحص الحزمة (verify:dist) سقط — لا ضغط'] }
  const problems = [
    ...packageProblems(files, { version, dependencies }),
    ...(tag ? tagProblems(tag, version, tags) : []),
  ]
  if (problems.length > 0) return { problems }
  const archive = zip(files)
  const label = tag ? tag.slice(1) : version
  return {
    zip: archive,
    sha: sha256(archive),
    name: `rasd-${label}.zip`,
    prerelease: tag ? parseTag(tag)?.prerelease !== null : false,
  }
}
