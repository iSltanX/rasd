import { describe, expect, it } from 'vitest'

import { COLOUR_HINTS } from '@/ui/overlay/colour/ColourPanel'

/** `colors / idle` (`98:424`): مفاتيح التلميح رموز أو عربية — لا كلمة إنجليزية غير تقنية. */
describe('COLOUR_HINTS — لا كلمة إنجليزية في المفاتيح', () => {
  it('«⌥ انقر» لا «⌥ click»، و`Esc` اسم مفتاح يبقى', () => {
    const words = COLOUR_HINTS.flatMap((h) => h.key.match(/[a-z]{2,}/giu) ?? [])
    expect(words.filter((w) => w !== 'Esc')).toEqual([])
    expect(COLOUR_HINTS.map((h) => h.key)).toContain('⌥ انقر')
  })
})
