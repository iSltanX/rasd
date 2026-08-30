import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it } from 'vitest'

import { applyPatches } from '@/modules/editor/commands'
import { summariseRedaction } from '@/modules/editor/redact'
import { asNodeId, SCENE_SCHEMA_VERSION, type RedactNode, type Scene } from '@/modules/editor/scene'
import { addNode } from '@/modules/editor/scene-ops'
import { emptyScene } from '@/modules/editor/scene-schema'
import {
  captureIdFromLocation,
  loadEditorContext,
  releaseContext,
  saveScene,
} from '@/pages/editor/context'
import { deviceRect } from '@/shared/geometry'
import {
  annotations,
  captures,
  clearAllStores,
  deleteCaptureWithBlob,
  putCaptureWithBlob,
} from '@/shared/storage/repository'

import type { ObjectUrls } from '@/pages/editor/context'
import type { CaptureRecord } from '@/shared/storage/schema'

/**
 * عناوين كائنات وهمية.
 *
 * `URL.createObjectURL` في happy-dom يرفض ما يعود من `fake-indexeddb` — النسخ
 * الهيكلي يُعيد كائنًا لا `Blob` بمعناه هناك. والحقن يُبقي المُختبَر منطقَ
 * التحميل، ويُتيح فوق ذلك التحقّق من **أن العنوان يُحرَّر** وهو ما لا
 * يستطيعه اختبارٌ يعتمد الواجهة الحقيقية.
 */
const urls = (): ObjectUrls & { readonly created: string[]; readonly revoked: string[] } => {
  const created: string[] = []
  const revoked: string[] = []
  let n = 0
  return {
    created,
    revoked,
    create: () => {
      const url = `blob:test/${n++}`
      created.push(url)
      return url
    },
    revoke: (url) => {
      revoked.push(url)
    },
  }
}

/**
 * سياق المحرر عبر قاعدة بيانات حقيقية (`fake-indexeddb`).
 *
 * ما يُختبَر هنا لا يُختبَر بوحدة: **ذرّية** الحفظ المشروط، وسلسلة الحذف،
 * وأن الصورة تُقرأ من `blobs` لا من مكان آخر.
 */

const CAPTURE_ID = 'cap-1'

function record(): CaptureRecord {
  return {
    id: CAPTURE_ID,
    createdAt: 1,
    origin: 'https://example.test',
    url: 'https://example.test/page',
    title: 'صفحة الاختبار',
    kind: 'viewport',
    status: 'ready',
    projectId: null,
    tags: [],
    width: 800,
    height: 600,
    devicePixelRatio: 2,
    favorite: false,
    trashedAt: null,
    archived: false,
  }
}

const stroke = { colorToken: 'tool/annotate/solid', widthPx: 3, dash: [], opacity: 1 } as const

const redactNode = (id: string, mode: RedactNode['mode']): RedactNode => ({
  kind: 'redact',
  id: asNodeId(id),
  locked: false,
  rotation: 0,
  stroke,
  rect: deviceRect(0, 0, 10, 10),
  mode,
  strength: 8,
  coverToken: 'status/danger/solid',
})

async function seed(): Promise<void> {
  await clearAllStores()
  await putCaptureWithBlob(record(), new Blob(['png-bytes'], { type: 'image/png' }))
}

beforeEach(async () => {
  await seed()
})

describe('قراءة المعرّف من العنوان', () => {
  it('يقرأ `?capture=`', () => {
    expect(captureIdFromLocation('chrome-extension://x/editor.html?capture=abc')).toBe('abc')
  })

  it('يُرجع `null` بلا معامل، وبعنوان تالف', () => {
    expect(captureIdFromLocation('chrome-extension://x/editor.html')).toBeNull()
    expect(captureIdFromLocation('not a url')).toBeNull()
  })
})

describe('تحميل السياق', () => {
  it('يفتح على لقطة موجودة بمشهد فارغ صالح', async () => {
    const loaded = await loadEditorContext(CAPTURE_ID, urls())
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return

    expect(loaded.value.capture.title).toBe('صفحة الاختبار')
    expect(loaded.value.scene.nodes).toHaveLength(0)
    expect(loaded.value.baseUpdatedAt).toBeNull()
    expect(loaded.value.sceneError).toBeNull()
  })

  it('**كثافة البكسل من سجلّ اللقطة لا من الجهاز**', async () => {
    const loaded = await loadEditorContext(CAPTURE_ID, urls())
    expect(loaded.ok && loaded.value.scene.source.dpr).toBe(2)
  })

  it('**عنوان الكائن يُحرَّر** — المحرر يبقى مفتوحًا ساعات ولقطته مئات الميغابايتات', async () => {
    const u = urls()
    const loaded = await loadEditorContext(CAPTURE_ID, u)
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return

    expect(u.created).toHaveLength(1)
    expect(u.revoked).toHaveLength(0)

    releaseContext(loaded.value, u)
    expect(u.revoked).toEqual(u.created)
  })

  it('لقطة غير موجودة تُعطي رسالة تخصّها', async () => {
    const loaded = await loadEditorContext('ghost', urls())
    expect(loaded.ok).toBe(false)
    if (!loaded.ok) expect(loaded.error.message).toContain('لم تعد موجودة')
  })

  it('**مشهد تالف لا يُسقط الصفحة** — يُفتح فارغًا ويُعلَن الخطأ', async () => {
    await annotations.put({ captureId: CAPTURE_ID, scene: { nope: true }, updatedAt: 5 })
    const loaded = await loadEditorContext(CAPTURE_ID, urls())
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.value.sceneError).not.toBeNull()
    expect(loaded.value.scene.nodes).toHaveLength(0)
    // والأصل التالف **لم يُكتب فوقه**.
    const still = await annotations.get(CAPTURE_ID)
    expect(still.ok && (still.value.scene as Record<string, unknown>)['nope']).toBe(true)
  })
})

describe('الحفظ المشروط — منعُ تعارض لا كشفُه', () => {
  const sceneOf = (): Scene =>
    emptyScene({ captureId: CAPTURE_ID, width: 800, height: 600, dpr: 2 })

  it('أوّل حفظ ينجح ويكتب النسخة والملخّص', async () => {
    const out = await saveScene(sceneOf(), null, 100)
    expect(out.kind).toBe('saved')

    const stored = await annotations.get(CAPTURE_ID)
    expect(stored.ok).toBe(true)
    if (!stored.ok) return
    expect(stored.value.schemaVersion).toBe(SCENE_SCHEMA_VERSION)
    expect(stored.value.redaction).toEqual({ total: 0, irreversible: 0 })
  })

  it('حفظ ثانٍ بالطابع الصحيح ينجح', async () => {
    await saveScene(sceneOf(), null, 100)
    expect((await saveScene(sceneOf(), 100, 200)).kind).toBe('saved')
  })

  it('**تبويب ثانٍ لا يمحو الأوّل**', async () => {
    // التبويبان فتحا على مشهد غير موجود، فكلاهما يحمل `null`.
    expect((await saveScene(sceneOf(), null, 100)).kind).toBe('saved')

    const second = await saveScene(sceneOf(), null, 200)
    expect(second.kind).toBe('conflict')

    // والسجلّ ما زال يحمل كتابة الأوّل.
    const stored = await annotations.get(CAPTURE_ID)
    expect(stored.ok && stored.value.updatedAt).toBe(100)
  })

  it('تعارض بعد كتابة خارجية بين القراءة والحفظ', async () => {
    await saveScene(sceneOf(), null, 100)
    // «تبويب آخر» يكتب.
    await annotations.put({ captureId: CAPTURE_ID, scene: sceneOf(), updatedAt: 150 })
    // نحن ما زلنا نحمل 100.
    expect((await saveScene(sceneOf(), 100, 200)).kind).toBe('conflict')
  })
})

describe('ملخّص الحجب يُقرأ بلا فكّ المشهد', () => {
  it('يعدّ التغطية وحدها في `irreversible`', () => {
    let scene = emptyScene({ captureId: CAPTURE_ID, width: 10, height: 10, dpr: 1 })
    for (const [id, mode] of [
      ['a', 'cover'],
      ['b', 'blur'],
      ['c', 'pixelate'],
      ['d', 'cover'],
    ] as const) {
      scene = applyPatches(scene, addNode(scene, redactNode(id, mode)).patches)
    }
    expect(summariseRedaction(scene)).toEqual({ total: 4, irreversible: 2 })
  })

  it('يُكتب مع السجلّ فيُقرأ بلا تحميل المشهد', async () => {
    let scene = emptyScene({ captureId: CAPTURE_ID, width: 10, height: 10, dpr: 1 })
    scene = applyPatches(scene, addNode(scene, redactNode('a', 'cover')).patches)
    await saveScene(scene, null, 10)

    const stored = await annotations.get(CAPTURE_ID)
    expect(stored.ok && stored.value.redaction).toEqual({ total: 1, irreversible: 1 })
  })
})

describe('سلسلة الحذف', () => {
  it('**حذف اللقطة يحذف مشهدها** — لا وصف حجب ييتم بعد صورته', async () => {
    await saveScene(emptyScene({ captureId: CAPTURE_ID, width: 8, height: 6, dpr: 1 }), null, 10)
    expect((await annotations.get(CAPTURE_ID)).ok).toBe(true)

    await deleteCaptureWithBlob(CAPTURE_ID)

    expect((await captures.get(CAPTURE_ID)).ok).toBe(false)
    expect((await annotations.get(CAPTURE_ID)).ok).toBe(false)
  })
})
