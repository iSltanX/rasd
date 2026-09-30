/**
 * المكتبات والخطوط المضمَّنة في الحزمة وتراخيصها — تُعرض في «عن رصد».
 *
 * القائمة تطابق `dependencies` في `package.json` وما تجرّه إلى الحزمة (`@preact/signals-core`، وما تجرّه
 * `pdf-lib` إلى قطعتها الكسولة: `pako` و`@pdf-lib/standard-fonts` و`@pdf-lib/upng` و`tslib`)،
 * والخطوط الثلاثة من Google Fonts. ملفّ التراخيص الكامل المولَّد آليًّا في `STAGES/27`؛
 * و`tests/unit/pages/settings/licenses.test.ts` يُسقط أي تبعية تُضاف بلا سطر هنا.
 */

export interface LicenseEntry {
  readonly name: string
  readonly license: string
  readonly kind: 'library' | 'font'
}

export const LICENSES: readonly LicenseEntry[] = [
  { name: 'preact', license: 'MIT', kind: 'library' },
  { name: '@preact/signals', license: 'MIT', kind: 'library' },
  { name: '@preact/signals-core', license: 'MIT', kind: 'library' },
  { name: 'culori', license: 'MIT', kind: 'library' },
  { name: 'idb', license: 'ISC', kind: 'library' },
  { name: 'pixelmatch', license: 'ISC', kind: 'library' },
  { name: 'valibot', license: 'MIT', kind: 'library' },
  { name: 'pdf-lib', license: 'MIT', kind: 'library' },
  { name: 'pako', license: '(MIT AND Zlib)', kind: 'library' },
  { name: '@pdf-lib/standard-fonts', license: 'MIT', kind: 'library' },
  { name: '@pdf-lib/upng', license: 'MIT', kind: 'library' },
  { name: 'tslib', license: '0BSD', kind: 'library' },
  { name: 'Almarai', license: 'OFL-1.1', kind: 'font' },
  { name: 'Cairo', license: 'OFL-1.1', kind: 'font' },
  { name: 'Geist Mono', license: 'OFL-1.1', kind: 'font' },
]
