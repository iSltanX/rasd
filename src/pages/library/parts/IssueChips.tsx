/**
 * رقاقتا المشكلة — الحالة ونوع الفحص، في الجدول والتفصيل معًا.
 *
 * **لون الحالة واحد في كل موضع** (`Docs/Design.md`، «المشكلة»): التسمية والدرجة من `modules/issues/labels`
 * — الموضع الوحيد — فلا تتباعد رقاقة الجدول عن رقاقة التفصيل ولا عن رقاقة الطبقة.
 */

import { KIND_LABEL, STATUS_LABEL, STATUS_TONE } from '@/modules/issues/labels'
import { Chip, type ChipTone } from '@/ui/components/Chip/Chip'

import type { CheckKind, IssueStatus } from '@/shared/issue-schema'
import type { JSX } from 'preact'

/** نوع الفحص يُلوَّن بالأداة التي فُتح منها: نمط من الفحص، ومسافة من القياس، ولون وتباين من اللون. */
const KIND_TONE: Readonly<Record<CheckKind, ChipTone>> = {
  style: 'inspect',
  spacing: 'measure',
  colour: 'colors',
  contrast: 'colors',
}

export function StatusChip({ status }: { status: IssueStatus }): JSX.Element {
  return <Chip tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Chip>
}

export function KindChip({ kind }: { kind: CheckKind }): JSX.Element {
  return (
    <Chip tone={KIND_TONE[kind]} dot={false}>
      {KIND_LABEL[kind]}
    </Chip>
  )
}
