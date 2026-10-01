/**
 * تشخيص البلاغ — إصدار رصد والمتصفّح والنظام، من الإضافة والمتصفّح وحدهما.
 *
 * **ولا شيء من الصفحة:** لا رابط ولا عنوان ولا محتوى، ولا شيء من المكتبة ولا من الإعدادات. والقراءة من صفحة إضافة،
 * فـ`navigator.userAgentData` هنا متصفّح المستخدم لا صفحةٌ يزورها.
 *
 * كل مصدرٍ يتدهور إلى قيمةٍ صريحة (`unknown`) لا إلى غياب الحقل: العقد يشترط الحقول، وقيمةٌ مجهولة صادقة خيرٌ من
 * بلاغٍ يرفضه الخادم.
 */

import type { Diagnostics } from './payload'

/** `chrome.runtime.PlatformOs` ← قيم العقد (`macos` · `windows` · …). */
const OS: Readonly<Record<string, string>> = {
  mac: 'macos',
  win: 'windows',
  linux: 'linux',
  cros: 'chromeos',
  android: 'android',
  openbsd: 'openbsd',
  fuchsia: 'fuchsia',
}

const ARCH: Readonly<Record<string, string>> = {
  arm: 'arm',
  arm64: 'arm64',
  'x86-32': 'x86',
  'x86-64': 'x86_64',
  mips: 'mips',
  mips64: 'mips64',
}

interface Brand {
  readonly brand: string
  readonly version: string
}

interface HighEntropy {
  readonly platformVersion?: string
  readonly fullVersionList?: readonly Brand[]
}

interface UaData {
  readonly brands?: readonly Brand[]
  getHighEntropyValues?(hints: string[]): Promise<HighEntropy>
}

/** العلامة التي تسمّي المتصفّح: لا «Chromium» ولا علامة التمويه («Not A;Brand» بأشكالها). */
export function pickBrowser(brands: readonly Brand[] | undefined): Brand | null {
  const list = brands ?? []
  const real = list.filter((b) => !/not.?a.?brand/iu.test(b.brand))
  return real.find((b) => b.brand !== 'Chromium') ?? real[0] ?? null
}

export interface DiagnosticsSources {
  readonly manifestVersion: () => string
  readonly platformInfo: () => Promise<{ os: string; arch: string }>
  readonly uaData: () => UaData | undefined
}

const live: DiagnosticsSources = {
  manifestVersion: () => chrome.runtime.getManifest().version,
  platformInfo: () => chrome.runtime.getPlatformInfo(),
  uaData: () => (navigator as Navigator & { userAgentData?: UaData }).userAgentData,
}

export async function collectDiagnostics(sources: DiagnosticsSources = live): Promise<Diagnostics> {
  const platform = await sources.platformInfo().catch(() => ({ os: 'unknown', arch: 'unknown' }))
  const ua = sources.uaData()
  const high: HighEntropy = await (
    ua?.getHighEntropyValues?.(['platformVersion', 'fullVersionList']) ?? Promise.resolve({})
  ).catch(() => ({}))
  const browser = pickBrowser(high.fullVersionList ?? ua?.brands)

  return {
    appVersion: sources.manifestVersion(),
    os: OS[platform.os] ?? 'unknown',
    osVersion: high.platformVersion?.trim() || 'unknown',
    arch: ARCH[platform.arch] ?? 'unknown',
    browser: browser?.brand ?? 'unknown',
    browserVersion: browser?.version ?? 'unknown',
  }
}
