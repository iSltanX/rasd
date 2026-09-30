import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * فكّ الحزمة بأداة قياسية — `unzip` من Info-ZIP، الموجودة على macOS وعلى مشغّلات CI بلينكس.
 *
 * **لا قارئ ZIP مكتوبٌ هنا:** قارئٌ من كتابتنا يشارك الكاتب افتراضاته، فيقبل ما يرفضه العالم. والأداة إن غابت
 * أسقطت الاختبار برسالتها — لا تخطٍّ صامت يجعل «تُفكّ بأداة قياسية» ادّعاءً بلا قياس.
 */

export interface Unzipped {
  /** مخرج `unzip -t`: فحص CRC لكل ملفّ. */
  readonly test: string
  /** الأسماء كما يسردها `zipinfo -1`، بترتيبها — ASCII: نسخة Apple منه تطبع غيرها علامات استفهام. */
  readonly names: readonly string[]
  /**
   * الأسماء كما يقرؤها `zipfile` في Python 3 — قارئٌ قياسي ثانٍ يحترم بتّ UTF-8 (البتّ 11) فيُثبت الأسماء
   * غير اللاتينية، حيث `zipinfo` على macOS يطبعها `?` أيًّا كان كاتبها (قِيس على حزمةٍ من `zip` نفسه).
   */
  readonly utf8Names: () => readonly string[]
  /** محتوى ملفّ باسمه، مقروءًا من الأداة نفسها. */
  read(name: string): Buffer
  dispose(): void
}

export function unzip(bytes: Uint8Array): Unzipped {
  const dir = mkdtempSync(join(tmpdir(), 'rasd-zip-'))
  const file = join(dir, 'package.zip')
  writeFileSync(file, bytes)
  const run = (cmd: string, args: string[]) =>
    execFileSync(cmd, args, {
      maxBuffer: 256 * 1024 * 1024,
      env: { ...process.env, LC_ALL: 'C.UTF-8' },
    })
  const test = run('unzip', ['-t', file]).toString('utf8')
  const names = run('zipinfo', ['-1', file])
    .toString('utf8')
    .split('\n')
    .filter((line) => line.length > 0)
  return {
    test,
    names,
    utf8Names: () =>
      JSON.parse(
        run('python3', [
          '-c',
          'import json,sys,zipfile; print(json.dumps(zipfile.ZipFile(sys.argv[1]).namelist()))',
          file,
        ]).toString('utf8'),
      ) as string[],
    read: (name) => run('unzip', ['-p', file, name]),
    dispose: () => rmSync(dir, { recursive: true, force: true }),
  }
}
