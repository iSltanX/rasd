// @vitest-environment node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import manifestExport from '../../../manifest.config'

/**
 * أيقونات الإضافة المشحونة هي أيقونات الهوية المعتمدة بايتًا.
 *
 * `pnpm icons:brand` يولّد `public/icons/` من `src/ui/mark-geometry.ts`، و
 * `Docs/Brand/build.mjs` يولّد `Docs/Brand/png/` من الهندسة نفسها بطريقة الترسيم نفسها.
 * فإن عُدّل أحدهما ولم يُعَد توليد الآخر سقط هذا الاختبار — وهو انحراف الشعار الصامت
 * الذي وُجد ADR 0016 لمنعه.
 */

const manifest = manifestExport as unknown as {
  icons: Record<string, string>
  action: { default_icon: Record<string, string> }
}
const root = process.cwd()
const png = (path: string): Buffer => readFileSync(join(root, path))

/** عرض وارتفاع PNG من ترويسة IHDR. */
const size = (buf: Buffer): [number, number] => [buf.readUInt32BE(16), buf.readUInt32BE(20)]

const PAIRS = [
  ['public/icons/icon-16.png', 'Docs/Brand/png/rasd-icon-idle-16.png', 16],
  ['public/icons/icon-32.png', 'Docs/Brand/png/rasd-icon-idle-32.png', 32],
  ['public/icons/icon-48.png', 'Docs/Brand/png/rasd-icon-idle-48.png', 48],
  ['public/icons/icon-128.png', 'Docs/Brand/png/rasd-icon-idle-128.png', 128],
  ['public/icons/icon-active-16.png', 'Docs/Brand/png/rasd-icon-active-16.png', 16],
  ['public/icons/icon-active-32.png', 'Docs/Brand/png/rasd-icon-active-32.png', 32],
] as const

describe('أيقونات الإضافة = أيقونات الهوية', () => {
  it.each(PAIRS)('%s مطابقة بايتًا لـ%s', (shipped, brand, px) => {
    const buf = png(shipped)
    expect(size(buf)).toEqual([px, px])
    expect(buf.equals(png(brand))).toBe(true)
  })

  it('المقارنة تستطيع أن تسقط: الخاملة والنشطة عند 16 مختلفتان', () => {
    expect(png('public/icons/icon-16.png').equals(png('public/icons/icon-active-16.png'))).toBe(
      false,
    )
  })

  it('البيان يعلن المقاسات الأربعة بالأيقونة الخاملة', () => {
    const expected = {
      16: 'icons/icon-16.png',
      32: 'icons/icon-32.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    }
    expect(manifest.icons).toEqual(expected)
    expect(manifest.action.default_icon).toEqual(expected)
  })
})
