/**
 * حفظ المناطق المستثناة مع المرجع المعروض (ADR 0034) — الطبقة تعرض القائمة الجديدة فورًا، وهذا يكتبها.
 *
 * ثلاث قواعد، كلٌّ منها من المراجعة المستقلّة (`STAGES/34`):
 *
 * - **المقاس مقاس المرجع المعروض لا مقاس النافذة الآن.** المرجع يُحمَّل مرّة عند الدخول، وتغيير عرض النافذة
 *   بعدها (لوحة المطوّر جانبًا) ينقل `classifyViewport` إلى مقاسٍ آخر — فكانت منطقةٌ رُسمت فوق مرجع سطح المكتب
 *   تُكتب قائمةً كاملةً فوق مرجع الجهاز اللوحي وتمحو مناطقه.
 * - **الحفظ متسلسل.** `guardWrite` في الخلفية ينتظر `estimate()` قبل المعاملة، فحفظان متلاحقان قد يُثبَّت
 *   أقدمهما آخرًا — وتعرض الطبقة ما لم يبقَ. والتسلسل هنا يجعل آخر ما أُرسل آخر ما كُتب.
 * - **الفشل يعيد آخر قائمةٍ أكّدتها الخلفية** لا القائمة التي سبقت هذا الحفظ: تلك قد تكون متفائلةً هي الأخرى.
 *
 * بلا DOM ولا `chrome.*`: الإرسال والعرض والإعلام معاودات، فيُختبر وحده.
 */

import type { ExclusionZone } from '@/shared/exclusion-schema'
import type { Result } from '@/shared/result'
import type { Viewport } from '@/shared/storage/schema'

export interface ZoneSaverDeps {
  readonly send: (
    viewport: Viewport,
    zones: readonly ExclusionZone[],
  ) => Promise<Result<{ readonly exclusions: readonly ExclusionZone[] }>>
  /** يعرض القائمة المؤكَّدة — ما كُتب فعلًا، أو آخر ما كُتب بعد فشل. */
  readonly apply: (zones: readonly ExclusionZone[]) => void
  readonly failed: (message: string) => void
}

export interface ZoneSaver {
  /** مرجعٌ حُمِّل (أو غاب): مقاسه وقائمته كما قرأتها الخلفية. ما كان معلَّقًا لمرجعٍ سابق لا يُطبَّق. */
  reset(viewport: Viewport | null, confirmed: readonly ExclusionZone[]): void
  save(zones: readonly ExclusionZone[]): void
  /** يُحلّ بعد آخر حفظ — للاختبار. */
  idle(): Promise<void>
}

export function createZoneSaver(deps: ZoneSaverDeps): ZoneSaver {
  let viewport: Viewport | null = null
  let confirmed: readonly ExclusionZone[] = []
  let generation = 0
  let latest = 0
  let chain: Promise<void> = Promise.resolve()

  return {
    reset(nextViewport, nextConfirmed) {
      generation++
      viewport = nextViewport
      confirmed = nextConfirmed
    },

    save(zones) {
      const target = viewport
      const myGeneration = generation
      const mySave = ++latest
      if (!target) {
        deps.failed('لا مرجع معروضًا تُحفظ معه المناطق.')
        return
      }
      chain = chain.then(async () => {
        if (generation !== myGeneration) return
        const written = await deps.send(target, zones)
        if (generation !== myGeneration) return
        if (written.ok) confirmed = written.value.exclusions
        else deps.failed(written.error.message)
        // حفظٌ أحدث في الطابور يقرّر ما يُعرض — هذا لا يسبقه إلى الشاشة.
        if (mySave === latest) deps.apply(confirmed)
      })
    },

    idle: () => chain,
  }
}
