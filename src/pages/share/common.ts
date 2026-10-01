/**
 * ما يشترك فيه محرّكا المشاركة — اللقطة (`CaptureShare`) والدليل (`GuideShare`).
 */

import { getSettingsResult } from '@/shared/settings'

/** نسخة رصد من البيان — وفي بيئةٍ بلا بيان (الاختبار) علامةٌ لا رقمٌ مخترَع. */
export function rasdVersion(): string {
  try {
    return chrome.runtime.getManifest().version
  } catch {
    return 'dev'
  }
}

/**
 * `privacy.stripMetadataOnExport` لحظة المشاركة — **ويُغلق على الفشل:** قراءةٌ فاشلة حذفٌ، فالحذف لا يضرّ
 * والإبقاء قد يضرّ (نمط `ExportFlow` و`HandoffDialog`).
 */
export async function stripSetting(): Promise<boolean> {
  const settings = await getSettingsResult()
  return settings.ok ? settings.value.privacy.stripMetadataOnExport : true
}

/** عنوان كائنٍ واحد حيّ في كل مرّة — الجديد يحرّر سابقه، والإغلاق يحرّر الأخير. */
export interface UrlKeeper {
  keep(blob: Blob): string
  release(): void
}

export function urlKeeper(): UrlKeeper {
  let current: string | null = null
  return {
    keep(blob) {
      const url = URL.createObjectURL(blob)
      if (current) URL.revokeObjectURL(current)
      current = url
      return url
    },
    release() {
      if (current) URL.revokeObjectURL(current)
      current = null
    },
  }
}
