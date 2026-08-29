/** يدمج أسماء الفئات، متجاهلًا القيم الفارغة. */
export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}
