// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import { describe, expect, it } from 'vitest'

import { PAGE_PATHS } from '@/shared/page-paths'
import {
  extensionPagesCsp,
  FORBIDDEN_PERMISSIONS,
  NETWORK_ORIGINS,
  OPTIONAL_HOST_PERMISSIONS,
  OPTIONAL_PERMISSIONS,
  REQUIRED_PERMISSIONS,
} from '@/shared/permission-policy'

import manifestExport from '../../manifest.config'

/**
 * البيان المصدري مقابل السياسة.
 *
 * `scripts/verify-dist.mjs` يفحص البيان **المبنيّ**؛ هذا يفحص المصدر قبل
 * البناء، فيفشل أسرع وأوضح عند أي تعديل يخالف السياسة.
 */

const manifest = manifestExport as unknown as Record<string, unknown>
const root = fileURLToPath(new URL('../..', import.meta.url))

describe('بيان الإضافة', () => {
  it('Manifest V3 بلغة أساس عربية', () => {
    expect(manifest.manifest_version).toBe(3)
    expect(manifest.default_locale).toBe('ar')
  })

  it('الاسم والوصف يمرّان عبر chrome.i18n لا نصًّا صريحًا', () => {
    expect(manifest.name).toBe('__MSG_extName__')
    expect(manifest.description).toBe('__MSG_extDescription__')
  })

  it('كل رسالة يشير إليها البيان معرَّفة في لغتَي ar و en', () => {
    const referenced = new Set<string>()
    const collect = (value: unknown) => {
      if (typeof value === 'string') {
        const m = /^__MSG_(\w+)__$/.exec(value)
        if (m?.[1]) referenced.add(m[1])
      } else if (value && typeof value === 'object') {
        Object.values(value).forEach(collect)
      }
    }
    collect(manifest)
    expect(referenced.size).toBeGreaterThan(0)

    for (const locale of ['ar', 'en']) {
      const messages = JSON.parse(
        readFileSync(`${root}public/_locales/${locale}/messages.json`, 'utf8'),
      ) as Record<string, unknown>
      for (const key of referenced) {
        expect(messages[key], `الرسالة ${key} مفقودة في ${locale}`).toBeDefined()
      }
    }
  })
})

describe('سياسة الصلاحيات في البيان', () => {
  it('التثبيت النظيف لا يطلب أي صلاحية مضيف', () => {
    // هذا هو معيار الاكتمال الحاسم للمرحلة 2.
    expect(manifest.host_permissions).toBeUndefined()
    expect(manifest.optional_host_permissions).toEqual([...OPTIONAL_HOST_PERMISSIONS])
  })

  it('الصلاحيات الدائمة تطابق السياسة حرفيًا', () => {
    expect(manifest.permissions).toEqual([...REQUIRED_PERMISSIONS])
  })

  it('الصلاحيات الاختيارية تطابق السياسة حرفيًا', () => {
    expect(manifest.optional_permissions).toEqual([...OPTIONAL_PERMISSIONS])
  })

  it('لا صلاحية محظورة', () => {
    const declared = [
      ...((manifest.permissions as string[]) ?? []),
      ...((manifest.optional_permissions as string[]) ?? []),
    ]
    for (const forbidden of FORBIDDEN_PERMISSIONS) {
      expect(declared, `الصلاحية ${forbidden} محظورة`).not.toContain(forbidden)
    }
  })
})

describe('سياسة الحقن والأمن', () => {
  it('لا content_scripts تلقائي — الحقن يدوي (ADR 0005)', () => {
    expect(manifest.content_scripts).toBeUndefined()
  })

  it('CSP بلا unsafe-* ومصادرها الخارجية الخدمات المسمّاة وحدها (ADR 0046)', () => {
    const csp = (manifest.content_security_policy as { extension_pages?: string } | undefined)
      ?.extension_pages
    expect(csp).toBe(extensionPagesCsp())
    expect(csp).not.toMatch(/unsafe-/)
    const external = [...(csp ?? '').matchAll(/https?:\/\/\S+/g)].map((m) => m[0])
    expect(external).toEqual([...NETWORK_ORIGINS])
  })

  it('التصفّح الخاص منفصل', () => {
    expect(manifest.incognito).toBe('split')
  })

  it('الموارد المتاحة للصفحة تستخدم عناوين ديناميكية', () => {
    const war = manifest.web_accessible_resources as { use_dynamic_url?: boolean }[]
    expect(war.length).toBeGreaterThan(0)
    for (const entry of war) expect(entry.use_dynamic_url).toBe(true)
  })

  it('لا يتجاوز حدّ Chrome البالغ أربعة اختصارات مقترحة', () => {
    const commands = manifest.commands as Record<string, { suggested_key?: unknown }>
    const suggested = Object.values(commands).filter((c) => c.suggested_key)
    expect(suggested.length).toBeLessThanOrEqual(4)
  })

  it('النافذة مسجَّلة من سجلّ الصفحات لا نصًّا مكرَّرًا', () => {
    const action = manifest.action as { default_popup?: string }
    expect(action.default_popup).toBe(PAGE_PATHS.popup)
  })
})
