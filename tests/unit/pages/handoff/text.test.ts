import { describe, expect, it } from 'vitest'

import { buildHandoff } from '@/modules/handoff/model'
import {
  contentsLabel,
  doneLabel,
  failureText,
  issuesLabel,
  progressLabel,
  readyParts,
} from '@/pages/handoff/text'

import { KNOWN_ISSUE, META, OPTIONS, SPACING_ISSUE } from '../../modules/handoff/fixture'

/** نصوص نافذة الحزمة: العدّ البشري بأرقام هندية وقاعدة العدد، والتقنيّ غربيّ. */

describe('نصوص نافذة الحزمة', () => {
  it('ما في الحزمة: الصور بعددها ثمّ الملفّان، وبلا صور الملفّان وحدهما', () => {
    expect(contentsLabel(2)).toBe('صورتان وملفّان: Markdown · JSON')
    expect(contentsLabel(1)).toBe('صورة واحدة وملفّان: Markdown · JSON')
    expect(contentsLabel(3)).toBe('٣ صور وملفّان: Markdown · JSON')
    expect(contentsLabel(0)).toBe('ملفّان: Markdown · JSON')
    expect(doneLabel(2)).toBe('ملفّ واحد فيه صورتان ونسختان: Markdown · JSON.')
    expect(doneLabel(0)).toBe('ملفّ واحد فيه نسختان: Markdown · JSON.')
  })

  it('المشكلات بضميرها: حالتها · حالتهما · حالاتها', () => {
    expect(issuesLabel(1)).toBe('مشكلة واحدة — حالتها كما هي في المكتبة')
    expect(issuesLabel(2)).toBe('مشكلتان — حالتهما كما هي في المكتبة')
    expect(issuesLabel(11)).toBe('١١ مشكلة — حالاتها كما هي في المكتبة')
  })

  it('التقدّم بأرقام هندية، والخطوة لا تتجاوز العدد', () => {
    expect(progressLabel(1, 3)).toEqual({ step: 'يُرمَّز مقتطع المشكلة ٢', count: '١ من ٣' })
    expect(progressLabel(3, 3).step).toBe('يُرمَّز مقتطع المشكلة ٣')
  })

  it('ما بقي جاهزًا في المشكلة من النموذج نفسه', () => {
    const model = buildHandoff([KNOWN_ISSUE, SPACING_ISSUE], OPTIONS, META)
    expect(readyParts(model, KNOWN_ISSUE.id)).toBe('مقتطع · خصائص · خطوات')
    expect(readyParts(model, SPACING_ISSUE.id)).toBe('مقتطع')
    const bare = buildHandoff([SPACING_ISSUE], { ...OPTIONS, images: false }, META)
    expect(readyParts(bare, SPACING_ISSUE.id)).toBe('القيمتان والمحدِّد')
    expect(readyParts(model, 'لا-مشكلة')).toBe('')
  })

  it('لقطةٌ فُقدت تُقال بما يُفعل بها، وغيرها برسالة عطله', () => {
    expect(failureText({ title: 'أ' }, { code: 'not-found', message: 'x' })).toBe(
      'لقطة الدليل للمشكلة «أ» لم تعد في المكتبة. أزلها من الحزمة، أو أعد تسجيلها من الصفحة.',
    )
    expect(failureText({ title: 'أ' }, { code: 'invalid-data', message: 'تالف.' })).toBe(
      'المشكلة «أ»: تالف.',
    )
  })
})
