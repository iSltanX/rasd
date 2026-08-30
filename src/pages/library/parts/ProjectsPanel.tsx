/**
 * لوحة المشاريع (§10.2) — إنشاء، إعادة تسمية، لون مميّز، حذف مع نقل المحتوى.
 *
 * حالة الحذف **مُركَّبة عمدًا لا حوارًا منبثقًا منفصلًا**: تظهر صفًّا ثانيًا
 * تحت المشروع المطلوب حذفه، يحمل اختيار «انقل المحتوى إلى» — لأن التأكيد
 * بلا معرفة الوجهة تأكيدٌ أعمى، والوجهة جزءٌ من القرار نفسه لا تفصيل بعده.
 */

import { useState } from 'preact/hooks'

import { Button } from '@/ui/components/Button/Button'
import { IconButton } from '@/ui/components/IconButton/IconButton'
import { Input } from '@/ui/components/Input/Input'
import { cx } from '@/ui/cx'

import { DEFAULT_PROJECT_COLOR, PROJECT_COLORS } from '../project-colors'

import styles from './ProjectsPanel.module.css'

import type { ProjectRecord } from '@/shared/storage/schema'
import type { JSX } from 'preact'

export interface ProjectsPanelProps {
  projects: readonly ProjectRecord[]
  onCreate: (name: string, color: string) => void
  onRename: (id: string, name: string) => void
  onSetColor: (id: string, color: string) => void
  onDelete: (id: string, moveContentTo: string | null) => void
  onClose: () => void
}

const NO_PROJECT_VALUE = '__none__'

export function ProjectsPanel({
  projects,
  onCreate,
  onRename,
  onSetColor,
  onDelete,
  onClose,
}: ProjectsPanelProps): JSX.Element {
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(DEFAULT_PROJECT_COLOR)
  /** وضع تحرير واحد يحمل الاسم واللون معًا — لا حالتان منفصلتان لحقلَي المشروع الواحد. */
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [moveTarget, setMoveTarget] = useState<string>(NO_PROJECT_VALUE)

  const submitCreate = (e: JSX.TargetedEvent<HTMLFormElement>) => {
    e.preventDefault()
    const trimmed = newName.trim()
    if (!trimmed) return
    onCreate(trimmed, newColor)
    setNewName('')
    setNewColor(DEFAULT_PROJECT_COLOR)
  }

  const startEdit = (project: ProjectRecord) => {
    setEditingId(project.id)
    setEditName(project.name)
    setEditColor(project.color)
  }

  const submitEdit = (project: ProjectRecord) => {
    const trimmed = editName.trim()
    if (trimmed && trimmed !== project.name) onRename(project.id, trimmed)
    if (editColor && editColor !== project.color) onSetColor(project.id, editColor)
    setEditingId(null)
  }

  const startDelete = (id: string) => {
    setDeletingId(id)
    setMoveTarget(NO_PROJECT_VALUE)
  }

  const confirmDelete = (id: string) => {
    onDelete(id, moveTarget === NO_PROJECT_VALUE ? null : moveTarget)
    setDeletingId(null)
  }

  return (
    <aside class={styles.panel} aria-label="المشاريع">
      <div class={styles.header}>
        <h2 class={styles.title}>المشاريع</h2>
        <IconButton icon="close" aria-label="إغلاق لوحة المشاريع" onClick={onClose} />
      </div>

      <form class={styles.createForm} onSubmit={submitCreate}>
        <Input
          value={newName}
          onInput={setNewName}
          placeholder="اسم مشروع جديد…"
          aria-label="اسم المشروع الجديد"
        />
        <div class={styles.swatches} role="radiogroup" aria-label="لون المشروع الجديد">
          {PROJECT_COLORS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={newColor === option.value}
              aria-label={option.label}
              class={cx(styles.swatch, newColor === option.value && styles.swatchSelected)}
              style={{ backgroundColor: option.value }}
              onClick={() => setNewColor(option.value)}
            />
          ))}
        </div>
        <Button type="submit" variant="primary" size="s">
          إنشاء
        </Button>
      </form>

      {projects.length === 0 ? (
        <p class={styles.empty}>لا مشاريع بعد — أنشئ أوّلها أعلاه.</p>
      ) : (
        <ul class={styles.list}>
          {projects.map((project) => (
            <li key={project.id} class={styles.item} data-project-id={project.id}>
              <span
                class={styles.dot}
                style={{ backgroundColor: project.color }}
                aria-hidden="true"
              />

              {editingId === project.id ? (
                <div class={styles.editRow}>
                  <Input
                    value={editName}
                    onInput={setEditName}
                    aria-label={`إعادة تسمية ${project.name}`}
                    class={styles.renameInput}
                  />
                  <div
                    class={styles.swatches}
                    role="radiogroup"
                    aria-label={`لون مشروع ${project.name}`}
                  >
                    {PROJECT_COLORS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={editColor === option.value}
                        aria-label={option.label}
                        class={cx(
                          styles.swatch,
                          editColor === option.value && styles.swatchSelected,
                        )}
                        style={{ backgroundColor: option.value }}
                        onClick={() => setEditColor(option.value)}
                      />
                    ))}
                  </div>
                  <IconButton icon="check" aria-label="حفظ" onClick={() => submitEdit(project)} />
                  <IconButton icon="close" aria-label="إلغاء" onClick={() => setEditingId(null)} />
                </div>
              ) : (
                <>
                  <span class={styles.name}>{project.name}</span>
                  <IconButton
                    icon="more-h"
                    aria-label={`تعديل مشروع ${project.name}`}
                    onClick={() => startEdit(project)}
                  />
                  <IconButton
                    icon="trash"
                    aria-label={`حذف مشروع ${project.name}`}
                    onClick={() => startDelete(project.id)}
                  />
                </>
              )}

              {deletingId === project.id ? (
                <div
                  class={styles.deleteConfirm}
                  role="group"
                  aria-label={`تأكيد حذف ${project.name}`}
                >
                  <label class={styles.moveLabel}>
                    انقل محتواه إلى
                    <select
                      class={styles.moveSelect}
                      value={moveTarget}
                      onChange={(e: JSX.TargetedEvent<HTMLSelectElement>) =>
                        setMoveTarget(e.currentTarget.value)
                      }
                    >
                      <option value={NO_PROJECT_VALUE}>بلا مشروع</option>
                      {projects
                        .filter((p) => p.id !== project.id)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <Button variant="danger" size="s" onClick={() => confirmDelete(project.id)}>
                    احذف نهائيًا
                  </Button>
                  <Button variant="ghost" size="s" onClick={() => setDeletingId(null)}>
                    تراجع
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
