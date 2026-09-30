/**
 * ترحيل مخطّط قاعدة البيانات.
 *
 * **لماذا الآن ولا شيء لترحيله بعد:** إضافة نظام ترحيل بعد أن تصير لدى
 * المستخدمين بيانات تعني فقدانها. البنية تُبنى فارغة اليوم، ويُكتب لكل نسخة
 * خطوتها ساعة إضافتها.
 */

import type { RasdDB, StoreName } from './schema'
import type { IDBPDatabase, IDBPTransaction } from 'idb'

/** معاملة الترقية ترى كل المخازن — `idb` يشتقّ النوع من أسمائها. */
export type UpgradeTransaction = IDBPTransaction<RasdDB, StoreName[], 'versionchange'>

export type MigrationStep = (db: IDBPDatabase<RasdDB>, transaction: UpgradeTransaction) => void

/**
 * خطوة لكل نسخة. المفتاح هو النسخة **المستهدَفة**:
 * `1` تُنفَّذ عند الترقية من 0 إلى 1.
 */
export const MIGRATIONS: Readonly<Record<number, MigrationStep>> = {
  1: (db) => {
    const captures = db.createObjectStore('captures', { keyPath: 'id' })
    captures.createIndex('createdAt', 'createdAt')
    captures.createIndex('projectId', 'projectId')
    captures.createIndex('origin', 'origin')
    captures.createIndex('kind', 'kind')
    captures.createIndex('status', 'status')

    // بلا فهارس: يُقرأ بالمعرّف فقط، ولا يُمسح أبدًا في استعلام.
    db.createObjectStore('blobs', { keyPath: 'id' })

    const projects = db.createObjectStore('projects', { keyPath: 'id' })
    projects.createIndex('name', 'name')
    projects.createIndex('updatedAt', 'updatedAt')

    const colors = db.createObjectStore('colors', { keyPath: 'id' })
    colors.createIndex('hex', 'hex')
    colors.createIndex('projectId', 'projectId')
    colors.createIndex('source', 'source')

    const palettes = db.createObjectStore('palettes', { keyPath: 'id' })
    palettes.createIndex('projectId', 'projectId')
    palettes.createIndex('createdAt', 'createdAt')

    const references = db.createObjectStore('references', { keyPath: 'id' })
    references.createIndex('projectId', 'projectId')
    references.createIndex('viewport', 'viewport')
    references.createIndex('origin', 'origin')

    db.createObjectStore('annotations', { keyPath: 'captureId' })

    const guides = db.createObjectStore('guides', { keyPath: 'id' })
    guides.createIndex('projectId', 'projectId')

    db.createObjectStore('tags', { keyPath: 'name' })
  },

  // بلا فهارس — كأختها `blobs`: تُقرأ بمعرّف اللقطة نفسه فقط، ولا تُمسح أبدًا في استعلام.
  2: (db) => {
    db.createObjectStore('thumbnails', { keyPath: 'id' })
  },

  /*
   * المشكلة المرتبطة بعنصر (ADR 0030). مخزنٌ جديد لا يمسّ سجلًّا قائمًا، فلا نقل بيانات.
   * الفهارس بمسارات متداخلة: `origin` لـ«مشكلات هذه الصفحة» في النافذة والطبقة، و`captureId` لرقاقة
   * الحالة في المحرّر، والثلاثة الباقية لمرشّحات المكتبة وترتيبها.
   */
  3: (db) => {
    const issues = db.createObjectStore('issues', { keyPath: 'id' })
    issues.createIndex('projectId', 'projectId')
    issues.createIndex('origin', 'page.origin')
    issues.createIndex('status', 'status')
    issues.createIndex('updatedAt', 'updatedAt')
    issues.createIndex('captureId', 'evidence.captureId')
  },
}

/** أعلى نسخة لها خطوة — يجب أن تساوي `DB_VERSION`. */
export const LATEST_MIGRATION = Math.max(...Object.keys(MIGRATIONS).map(Number))

/** الخطوات الواجب تنفيذها للانتقال من نسخة إلى أخرى، مرتَّبة. */
export function migrationPath(from: number, to: number): number[] {
  const path: number[] = []
  for (let v = from + 1; v <= to; v++) path.push(v)
  return path
}

/**
 * ينفّذ الترحيل. نسخة بلا خطوة تُوقف العملية بخطأ صريح بدل ترك القاعدة نصف
 * مُرحَّلة — الفشل الصاخب أأمن من قاعدة بيانات غامضة.
 */
export function runMigrations(
  db: IDBPDatabase<RasdDB>,
  transaction: UpgradeTransaction,
  from: number,
  to: number,
): void {
  for (const version of migrationPath(from, to)) {
    const step = MIGRATIONS[version]
    if (!step) {
      throw new Error(`لا خطوة ترحيل للنسخة ${version} — الترقية من ${from} إلى ${to} متوقّفة`)
    }
    step(db, transaction)
  }
}
