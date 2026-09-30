/**
 * مدقّق JSON Schema مصغَّر — أداة اختبار لا شيفرة إنتاج.
 *
 * يكفي المخطّط المنشور `Docs/Schemas/rasd.handoff-1.schema.json` وحده: `type` (ومصفوفتها) · `const` · `enum` ·
 * `properties` · `required` · `additionalProperties: false` · `items` · `$ref` إلى `#/$defs/…` · `minimum` ·
 * `minLength` · `pattern`. **وكلمةٌ لا يعرفها يرمي عندها** ولا يتجاوزها: مدقّقٌ يتخطّى قيدًا بصمت يجعل
 * الاختبار الموجب يمرّ على ما لم يُفحص. فإن احتاج المخطّط كلمةً جديدة أُضيفت هنا مع حالتها السالبة.
 *
 * واختيارُه على اعتمادية (`ajv`): المشروع لا يحملها، ومخطّطٌ واحد صغير لا يبرّر اعتماديةً في القفل.
 */

type Schema = Readonly<Record<string, unknown>>

const KNOWN = new Set([
  '$schema',
  '$id',
  '$defs',
  'title',
  'description',
  'type',
  'const',
  'enum',
  'properties',
  'required',
  'additionalProperties',
  'items',
  '$ref',
  'minimum',
  'minLength',
  'pattern',
])

function typeOf(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number'
  return typeof value
}

function matchesType(value: unknown, type: string): boolean {
  const actual = typeOf(value)
  return actual === type || (type === 'number' && actual === 'integer')
}

/** يعيد قائمة المخالفات بمساراتها — فارغة للمطابق. */
export function validate(root: Schema, value: unknown): string[] {
  const errors: string[] = []

  const resolve = (ref: string): Schema => {
    const m = /^#\/\$defs\/([\w-]+)$/u.exec(ref)
    const defs = root.$defs as Record<string, Schema> | undefined
    const found = m?.[1] ? defs?.[m[1]] : undefined
    if (!found) throw new Error(`مرجعٌ لا يُحلّ: ${ref}`)
    return found
  }

  const walk = (schema: Schema, v: unknown, path: string): void => {
    for (const key of Object.keys(schema)) {
      if (!KNOWN.has(key)) throw new Error(`كلمة مخطّط لا يعرفها المدقّق: ${key} عند ${path}`)
    }
    if (typeof schema.$ref === 'string') {
      walk(resolve(schema.$ref), v, path)
      return
    }
    if (schema.type !== undefined) {
      const types = Array.isArray(schema.type) ? (schema.type as string[]) : [schema.type as string]
      if (!types.some((t) => matchesType(v, t))) {
        errors.push(`${path}: النوع ${typeOf(v)} وليس ${types.join('|')}`)
        return
      }
    }
    if ('const' in schema && v !== schema.const) {
      errors.push(`${path}: ${JSON.stringify(v)} ≠ ${JSON.stringify(schema.const)}`)
    }
    if (Array.isArray(schema.enum) && !schema.enum.includes(v)) {
      errors.push(`${path}: ${JSON.stringify(v)} خارج ${JSON.stringify(schema.enum)}`)
    }
    if (typeof v === 'number' && typeof schema.minimum === 'number' && v < schema.minimum) {
      errors.push(`${path}: ${v} < ${schema.minimum}`)
    }
    if (typeof v === 'string') {
      if (typeof schema.minLength === 'number' && v.length < schema.minLength) {
        errors.push(`${path}: أقصر من ${schema.minLength}`)
      }
      if (typeof schema.pattern === 'string' && !new RegExp(schema.pattern, 'u').test(v)) {
        errors.push(`${path}: ${JSON.stringify(v)} لا يطابق ${schema.pattern}`)
      }
    }
    if (Array.isArray(v) && schema.items) {
      v.forEach((item, i) => walk(schema.items as Schema, item, `${path}[${i}]`))
    }
    if (typeOf(v) === 'object') {
      const obj = v as Record<string, unknown>
      const props = (schema.properties ?? {}) as Record<string, Schema>
      for (const key of (schema.required as string[] | undefined) ?? []) {
        if (!(key in obj)) errors.push(`${path}.${key}: مطلوب وغائب`)
      }
      for (const [key, sub] of Object.entries(obj)) {
        if (props[key]) walk(props[key], sub, `${path}.${key}`)
        else if (schema.additionalProperties === false) errors.push(`${path}.${key}: حقلٌ زائد`)
      }
    }
  }

  walk(root, value, '$')
  return errors
}
