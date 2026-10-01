/**
 * ملفّ تراخيص الطرف الثالث — يولَّد عند البناء من الوحدات المحزومة فعلًا (`STAGES/27`).
 *
 * **المصدر ما دخل الحزمة، لا ما في `package.json`.** إغلاق `dependencies` يجرّ ما لا يُشحن (`pngjs`
 * تبعيةُ أداة `pixelmatch` السطرية ولا تبلغها شيفرتنا)، وقائمةٌ مكتوبة بيد تنسى ما يحقنه البنّاء نفسه.
 * فالملحق يقرأ مسار كل وحدة في كل قطعة، ويستخرج منها اسم الحزمة التي جاءت منها، ثمّ يقرأ رخصتها من
 * مجلّدها. ويُضاف إليها كل ما في `dependencies` وإن لم يُحزم — الذكر الزائد لا يضرّ، والناقص يضرّ.
 *
 * **بناءان لا واحد.** `vite.config.ts` يكتب الملفّ، و`vite.content.config.ts` يبني `content.js` بعده في
 * المجلّد نفسه فيدمج فيه ما حزمه: `@preact/signals-core` مثلًا في `content.js` وحده، لا تبلغها صفحة.
 * والخطوط ليست وحدات JavaScript: نصوص رخصها مودَعة في `licenses/fonts/`.
 *
 * الناتج حتمي — مرتّب بالاسم، بلا تاريخ ولا مسار مطلق — فلا يكسر قابلية البناء للتكرار.
 */

import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { LICENSES_FILE } from '../src/pages/settings/parts/licenses.ts'

import type { Plugin } from 'vite'

export { LICENSES_FILE }

export interface ShippedPackage {
  readonly name: string
  readonly version: string
  readonly license: string
  readonly homepage: string | null
  readonly text: string
}

export interface FontNotice {
  readonly name: string
  readonly text: string
}

/** اسم الحزمة من مسار وحدة — آخر `node_modules/` فيه، فيصحّ تحت `.pnpm/` المتداخل. */
export function packageOf(moduleId: string): string | null {
  const path = moduleId.replace(/\\/gu, '/').replace(/\?.*$/u, '')
  const match = /.*\/node_modules\/((?:@[^/]+\/)?[^/.][^/]*)\//u.exec(path)
  return match?.[1] ?? null
}

/** مجلّد الحزمة بخوارزمية Node: صعودًا من `from` حتى `node_modules/<name>`. */
function packageDir(name: string, from: string): string | null {
  for (let dir = from; ; dir = dirname(dir)) {
    const candidate = join(dir, 'node_modules', name)
    if (existsSync(join(candidate, 'package.json'))) return realpathSync(candidate)
    if (dirname(dir) === dir) return null
  }
}

const LICENSE_FILE = /^(?:licen[cs]e|copying)(?:\.(?:md|txt))?$/iu

/**
 * مجلّد كل حزمة في إغلاق `dependencies` — الاسم وحده لا يكفي تحت pnpm: `pako` لا تبلغها من الجذر بل
 * من مجلّد `pdf-lib`. يُستعمل لحزمةٍ عُرف اسمها من الملفّ المكتوب قبلًا لا من وحدة في هذا البناء.
 */
export function dependencyDirs(root: string): Map<string, string> {
  const dirs = new Map<string, string>()
  const queue: [string, string][] = []
  const enqueue = (from: string): void => {
    const meta = JSON.parse(readFileSync(join(from, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
    }
    for (const name of Object.keys(meta.dependencies ?? {})) queue.push([name, from])
  }
  enqueue(root)
  for (let next = queue.shift(); next; next = queue.shift()) {
    const [name, from] = next
    if (dirs.has(name)) continue
    const dir = packageDir(name, from)
    if (!dir) continue
    dirs.set(name, dir)
    enqueue(dir)
  }
  return dirs
}

/** بيانات الحزمة ونصّ رخصتها، من أوّل مجلّد يبلغها صعودًا من `from`. */
export function readPackage(name: string, from: string): ShippedPackage {
  const dir = packageDir(name, from)
  if (!dir) throw new Error(`لم تُعثر على الحزمة «${name}» من ${from}`)
  const meta = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
    version: string
    license?: string
    homepage?: string
    repository?: string | { url?: string }
  }
  const file = readdirSync(dir).find((entry) => LICENSE_FILE.test(entry))
  if (!file) throw new Error(`الحزمة «${name}» بلا ملفّ رخصة — لا تُشحن بلا نسبة.`)
  if (!meta.license) throw new Error(`الحزمة «${name}» بلا حقل license في package.json.`)
  const repository = typeof meta.repository === 'string' ? meta.repository : meta.repository?.url
  return {
    name,
    version: meta.version,
    license: meta.license,
    homepage: meta.homepage ?? repository ?? null,
    text: readFileSync(join(dir, file), 'utf8').replace(/\r\n?/gu, '\n').trim(),
  }
}

const RULE = '='.repeat(72)

/** النصّ الكامل: ترويسة، ثمّ الحزم مرتّبةً بالاسم، ثمّ الخطوط. */
export function renderLicenses(
  packages: readonly ShippedPackage[],
  fonts: readonly FontNotice[],
): string {
  const sorted = [...packages].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  const blocks = [
    [
      'Rasd — third-party software notices',
      '',
      'Rasd ships the open-source libraries and fonts listed below.',
      'Each is used under the license reproduced here.',
      '',
      ...sorted.map((p) => `  ${p.name}@${p.version} — ${p.license}`),
      ...fonts.map((f) => `  ${f.name} (font) — OFL-1.1`),
    ].join('\n'),
    ...sorted.map((p) =>
      [
        `${p.name}@${p.version}`,
        `License: ${p.license}`,
        ...(p.homepage ? [`Source: ${p.homepage}`] : []),
        '',
        p.text,
      ].join('\n'),
    ),
    ...fonts.map((f) => [`${f.name} (font)`, 'License: OFL-1.1', '', f.text.trim()].join('\n')),
  ]
  return `${blocks.join(`\n\n${RULE}\n\n`)}\n`
}

/** أسماء الحزم المذكورة في ملفّ مولَّد — من سطور الفهرس في ترويسته. */
export function listedPackages(text: string): string[] {
  const head = text.split(RULE)[0] ?? ''
  return [...head.matchAll(/^ {2}(\S+)@\S+ — /gmu)].map((m) => m[1] as string)
}

const FONTS: readonly { name: string; file: string }[] = [
  { name: 'Almarai', file: 'almarai.txt' },
  { name: 'Cairo', file: 'cairo.txt' },
  { name: 'Geist Mono', file: 'geist-mono.txt' },
]

interface Options {
  /** جذر المشروع: منه `package.json` و`licenses/fonts/`. */
  readonly root: string
  /** `emit` يكتب الملفّ (البناء الأوّل)، و`merge` يضيف إليه ما حزمه بناء `content.js` بعده. */
  readonly mode: 'emit' | 'merge'
}

export function thirdPartyLicenses({ root, mode }: Options): Plugin {
  let outDir = ''
  return {
    name: 'rasd:third-party-licenses',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir.startsWith('/')
        ? config.build.outDir
        : join(config.root, config.build.outDir)
    },
    generateBundle(_options, bundle) {
      // الاسم ← مجلّدٌ يُبلَغ منه: مجلّد الوحدة نفسها لما حُزم في هذا البناء.
      const shipped = new Map<string, string>()
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk') continue
        for (const id of chunk.moduleIds) {
          const name = packageOf(id)
          if (name && !shipped.has(name)) shipped.set(name, dirname(id.replace(/\?.*$/u, '')))
        }
      }

      const closure = dependencyDirs(root)
      const earlier: string[] = []
      if (mode === 'merge') {
        const file = join(outDir, LICENSES_FILE)
        if (!existsSync(file)) {
          this.error(
            `${LICENSES_FILE} غير موجود في ${outDir} — يكتبه البناء الأوّل: pnpm build:bundle`,
          )
        }
        earlier.push(...listedPackages(readFileSync(file, 'utf8')))
      }
      const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
        dependencies?: Record<string, string>
      }
      for (const name of [...earlier, ...Object.keys(pkg.dependencies ?? {})]) {
        if (!shipped.has(name)) shipped.set(name, closure.get(name) ?? root)
      }

      const packages = [...shipped].map(([name, from]) => readPackage(name, from))
      const fonts = FONTS.map((f) => ({
        name: f.name,
        text: readFileSync(join(root, 'licenses', 'fonts', f.file), 'utf8'),
      }))
      this.emitFile({
        type: 'asset',
        fileName: LICENSES_FILE,
        source: renderLicenses(packages, fonts),
      })
    },
  }
}
