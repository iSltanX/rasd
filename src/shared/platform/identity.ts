/**
 * هوية المتصفّح للتشخيص — من أيّ متصفّح ومحرّك وهدف بناء ومصدر تثبيت جاء البلاغ (`Docs/Browsers/Architecture.md` §4.11).
 *
 * **بالكشف لا بالهدف:** المتصفّح يُقرأ من واجهته (`runtime.getBrowserInfo` في Firefox) أو من علامات العميل
 * (`userAgentData`)، لا من `TARGET`؛ فحزمة chromium قد تعمل في Chrome أو Edge أو Brave أو Opera أو Vivaldi، ويُفصَل
 * بينها بما يقوله المتصفّح عن نفسه. و`build_target` وحده من `TARGET` لأنه سؤال «أيّ حزمةٍ شُحنت».
 *
 * كل مصدرٍ يتدهور إلى `unknown` لا إلى غياب الحقل ولا إلى تخمين: قيمةٌ مجهولة صادقة خيرٌ من اسمٍ خاطئ يوسِم بلاغًا.
 * **Vivaldi** يخفي علامته من `Sec-CH-UA` فيُقرأ `chromium` — وهو وصفٌ صحيح لمحرّكه.
 */

import { TARGET, type BuildTarget } from './target'

/** القاموس المغلق للوسم والعنوان عند الخادم — فلا يحلّل الخادم نصًّا حرًّا. */
export type BrowserId = 'firefox' | 'chrome' | 'edge' | 'brave' | 'opera' | 'chromium' | 'unknown'

/** `store` هنا اسم قيمةٍ مكتوبة في البلاغ، وكلها مقيسة من المتصفّح نفسه. */
export type InstallSource =
  'chrome-web-store' | 'edge-add-ons' | 'opera-add-ons' | 'unpacked' | 'unknown'

export interface BrowserIdentity {
  /** الاسم كما يُعرض: `Firefox` · `Google Chrome` · `Microsoft Edge` · `Brave` · `Opera` · `Chromium` · `unknown`. */
  readonly browser: string
  readonly browserVersion: string
  readonly browserId: BrowserId
  /** `Gecko 157.0` · `Chromium 152.0.7977.134` · `unknown`. */
  readonly engine: string
  readonly buildTarget: BuildTarget
  readonly installSource: InstallSource
}

interface Brand {
  readonly brand: string
  readonly version: string
}

interface HighEntropy {
  readonly fullVersionList?: readonly Brand[]
}

interface UaData {
  readonly brands?: readonly Brand[]
  getHighEntropyValues?(hints: string[]): Promise<HighEntropy>
}

interface FirefoxInfo {
  readonly name?: string
  readonly version?: string
}

/** مصادر الهوية — تُحقن في الاختبار؛ والحيّة أدناه. وغياب مصدرٍ يعني أن المتصفّح لا يملكه. */
export interface IdentitySources {
  readonly browserInfo: () => Promise<FirefoxInfo> | undefined
  readonly uaData: () => UaData | undefined
  readonly updateUrl: () => string | undefined
  readonly installType: () => Promise<string | undefined> | undefined
}

/** العلامة التي تسمّي المتصفّح: لا «Chromium» ولا علامة التمويه («Not A;Brand» بأشكالها). */
export function pickBrowser(brands: readonly Brand[] | undefined): Brand | null {
  const list = brands ?? []
  const real = list.filter((b) => !/not.?a.?brand/iu.test(b.brand))
  return real.find((b) => b.brand !== 'Chromium') ?? real[0] ?? null
}

/** علامة المحرّك في قائمة العميل — `Chromium` نفسها التي يستبعدها `pickBrowser` اسمًا للمتصفّح. */
function chromiumBrand(brands: readonly Brand[] | undefined): Brand | null {
  return (brands ?? []).find((b) => b.brand === 'Chromium') ?? null
}

/** تطبيع الاسم المعروض إلى القاموس المغلق. ما لا يُعرف `unknown` لا `chromium`: الاسم الفارغ ليس «Chromium». */
export function normaliseBrowser(name: string): BrowserId {
  const n = name.trim().toLowerCase()
  if (n === 'firefox' || n === 'mozilla firefox') return 'firefox'
  if (n === 'google chrome' || n === 'chrome') return 'chrome'
  if (n === 'microsoft edge' || n === 'edge') return 'edge'
  if (n === 'brave') return 'brave'
  if (n === 'opera') return 'opera'
  if (n === 'chromium') return 'chromium'
  return 'unknown'
}

/**
 * مصدر التثبيت من `update_url` الذي يحقنه كل متجر في بيان حزمته. المضيف يُقارَن كاملًا (لا `includes`)، وما سواه —
 * ومنه غياب الحقل — `unknown`. والتحميل غير المعبّأ يُعرف بـ`installType` لا بغياب `update_url`.
 */
const STORE_HOSTS: Readonly<Record<string, InstallSource>> = {
  'clients2.google.com': 'chrome-web-store',
  'clients2.googleusercontent.com': 'chrome-web-store',
  'edge.microsoft.com': 'edge-add-ons',
  'extension-updates.opera.com': 'opera-add-ons',
}

export function installSourceOf(
  updateUrl: string | undefined,
  installType: string | undefined,
): InstallSource {
  if (installType === 'development') return 'unpacked'
  if (!updateUrl) return 'unknown'
  try {
    return STORE_HOSTS[new URL(updateUrl).hostname] ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

type RuntimeApi = {
  getBrowserInfo?: () => Promise<FirefoxInfo>
  getManifest: () => { update_url?: string }
}
type ManagementApi = { getSelf?: () => Promise<{ installType?: string }> }

const api = (): { runtime: RuntimeApi; management?: ManagementApi } => {
  const ns = (globalThis as { browser?: typeof chrome }).browser ?? chrome
  return {
    runtime: ns.runtime as unknown as RuntimeApi,
    management: ns.management,
  }
}

const live: IdentitySources = {
  browserInfo: () => api().runtime.getBrowserInfo?.(),
  uaData: () => (navigator as Navigator & { userAgentData?: UaData }).userAgentData,
  updateUrl: () => api().runtime.getManifest().update_url,
  installType: () =>
    api()
      .management?.getSelf?.()
      .then((self) => self.installType),
}

const settle = async <T>(read: () => Promise<T> | undefined): Promise<T | undefined> => {
  try {
    return await read()
  } catch {
    return undefined
  }
}

export async function detectIdentity(sources: IdentitySources = live): Promise<BrowserIdentity> {
  const [info, installType] = await Promise.all([
    settle(sources.browserInfo),
    settle(sources.installType),
  ])
  const installSource = installSourceOf(safe(sources.updateUrl), installType)

  // Firefox: الواجهة تقول الاسم والإصدار، والمحرّك Gecko بإصدار المتصفّح نفسه.
  if (info?.name && info.version) {
    const browser = info.name.trim()
    return {
      browser,
      browserVersion: info.version,
      browserId: normaliseBrowser(browser),
      engine: `Gecko ${info.version}`,
      buildTarget: TARGET,
      installSource,
    }
  }

  const ua = safe(sources.uaData)
  const high: HighEntropy = await (
    ua?.getHighEntropyValues?.(['fullVersionList']) ?? Promise.resolve({})
  ).catch(() => ({}))
  const brands = high.fullVersionList ?? ua?.brands
  const picked = pickBrowser(brands)
  const engine = chromiumBrand(brands)
  return {
    browser: picked?.brand ?? 'unknown',
    browserVersion: picked?.version ?? 'unknown',
    browserId: picked ? normaliseBrowser(picked.brand) : 'unknown',
    engine: engine ? `Chromium ${engine.version}` : 'unknown',
    buildTarget: TARGET,
    installSource,
  }
}

function safe<T>(read: () => T): T | undefined {
  try {
    return read()
  } catch {
    return undefined
  }
}
