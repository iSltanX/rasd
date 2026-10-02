/**
 * تشخيص البلاغ — إصدار رصد والمتصفّح والنظام، من الإضافة والمتصفّح وحدهما.
 *
 * **ولا شيء من الصفحة:** لا رابط ولا عنوان ولا محتوى، ولا شيء من المكتبة ولا من الإعدادات. والقراءة من صفحة إضافة،
 * فـ`navigator.userAgentData` هنا متصفّح المستخدم لا صفحةٌ يزورها.
 *
 * كل مصدرٍ يتدهور إلى قيمةٍ صريحة (`unknown`) لا إلى غياب الحقل: العقد يشترط الحقول، وقيمةٌ مجهولة صادقة خيرٌ من
 * بلاغٍ يرفضه الخادم.
 */

import { detectIdentity, type BrowserIdentity } from '@/shared/platform/identity'

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

/**
 * `runtime.PlatformArch` ← قيم العقد. وFirefox يسمّي ARM64 `aarch64` حيث يسمّيه كروم `arm64` (قِيس في Firefox 157 على
 * Apple Silicon، SS7) — فالاسمان قيمةٌ واحدة كما يرسلها كروم من الجهاز نفسه.
 */
const ARCH: Readonly<Record<string, string>> = {
  arm: 'arm',
  arm64: 'arm64',
  aarch64: 'arm64',
  'x86-32': 'x86',
  'x86-64': 'x86_64',
  mips: 'mips',
  mips64: 'mips64',
}

interface HighEntropy {
  readonly platformVersion?: string
}

interface UaData {
  getHighEntropyValues?(hints: string[]): Promise<HighEntropy>
}

export interface DiagnosticsSources {
  readonly manifestVersion: () => string
  readonly platformInfo: () => Promise<{ os: string; arch: string }>
  readonly uaData: () => UaData | undefined
  /** هوية المتصفّح (`platform/identity.ts`) — تُحقن في الاختبار. */
  readonly identity: () => Promise<BrowserIdentity>
}

const live: DiagnosticsSources = {
  manifestVersion: () => chrome.runtime.getManifest().version,
  platformInfo: () => chrome.runtime.getPlatformInfo(),
  uaData: () => (navigator as Navigator & { userAgentData?: UaData }).userAgentData,
  identity: () => detectIdentity(),
}

export async function collectDiagnostics(sources: DiagnosticsSources = live): Promise<Diagnostics> {
  const platform = await sources.platformInfo().catch(() => ({ os: 'unknown', arch: 'unknown' }))
  const ua = sources.uaData()
  const high: HighEntropy = await (
    ua?.getHighEntropyValues?.(['platformVersion']) ?? Promise.resolve({})
  ).catch(() => ({}))
  const identity = await sources.identity()

  return {
    appVersion: sources.manifestVersion(),
    os: OS[platform.os] ?? 'unknown',
    osVersion: high.platformVersion?.trim() || 'unknown',
    arch: ARCH[platform.arch] ?? 'unknown',
    browser: identity.browser,
    browserVersion: identity.browserVersion,
    browserId: identity.browserId,
    engine: identity.engine,
    buildTarget: identity.buildTarget,
    installSource: identity.installSource,
  }
}
