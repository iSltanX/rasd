import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it } from 'vitest'

import { loadSidebarData } from '@/pages/shell/sidebar-data'
import { closeDatabase, setIncognitoWritePolicy } from '@/shared/storage/db'
import { issues } from '@/shared/storage/repository'

import { issueFixture } from '../../modules/issues/fixture'

beforeEach(async () => {
  setIncognitoWritePolicy(false)
  await closeDatabase()
  indexedDB.deleteDatabase('rasd')
  await new Promise((r) => setTimeout(r, 0))
})

describe('الشريط الجانبي — عدّاد المشكلات', () => {
  it('صفرٌ حين لا مشكلات', async () => {
    const data = await loadSidebarData()
    expect(data.ok && data.value.issues).toBe(0)
  })

  it('يعدّ كل المشكلات مهما كانت حالتها — عدٌّ من المخزن لا حقلٌ مخزَّن', async () => {
    await issues.put(issueFixture({ id: 'a', status: 'open' }))
    await issues.put(issueFixture({ id: 'b', status: 'resolved' }))
    await issues.put(issueFixture({ id: 'c', status: 'needs-verification' }))
    const data = await loadSidebarData()
    expect(data.ok && data.value.issues).toBe(3)
    await issues.remove('b')
    const after = await loadSidebarData()
    expect(after.ok && after.value.issues).toBe(2)
  })
})
