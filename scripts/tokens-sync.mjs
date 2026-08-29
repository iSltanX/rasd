#!/usr/bin/env node
/**
 * خطّ أنابيب التوكنز: لقطة Figma ← `tokens.json` (W3C) ← ثلاثة مخرجات.
 *
 * **لماذا لقطة مُلتقَطة لا نداء REST مباشر:** واجهة المتغيّرات في Figma REST
 * متاحة لخطط Enterprise وحدها. اللقطة تُلتقَط عبر Figma MCP/الملحق وتُودَع في
 * `src/tokens/figma-snapshot.json`، فيصير التوليد **حتميًا وبلا شبكة** — وهو
 * شرط معيار الاكتمال: «`pnpm tokens:sync` يعيد إنتاج الملفات بلا فروق».
 *
 *   pnpm tokens:sync           يولّد
 *   pnpm tokens:sync --check   يتحقّق من عدم الانحراف (يُستخدم في CI)
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const tokensDir = join(root, 'src', 'tokens')
/** الورقة تُخدَم من أصل الإضافة: تحتاجها الصفحات والطبقة داخل الصفحة معًا. */
const assetsDir = join(root, 'public', 'assets')
const snapshotPath = join(tokensDir, 'figma-snapshot.json')

/** أين يعيش كل مخرَج. */
const DEST = {
  'tokens.json': tokensDir,
  'tokens.ts': tokensDir,
  'tailwind.tokens.js': tokensDir,
  'tokens.css': assetsDir,
  'tokens-shadow.css': assetsDir,
}

const CHECK = process.argv.includes('--check')
const PREFIX = '--rasd'

const BANNER = `/* مولَّد من ملف Figma عبر \`pnpm tokens:sync\` — لا يُحرَّر يدويًا.
   المصدر: src/tokens/figma-snapshot.json */`

// ── أدوات ─────────────────────────────────────────────────────────
/** `surface/canvas` → `surface-canvas` */
const kebab = (name) => name.replace(/\//g, '-').replace(/\s+/g, '-').toLowerCase()

/** `Latin/UI/S Strong` → `latin-ui-s-strong` */
const classOf = (name) => kebab(name)

/** يزيل ضجيج الفاصلة العائمة القادم من Figma: 139.9999976 → 140 */
const clean = (n) => {
  const r = Math.round(n * 1000) / 1000
  return Number.isInteger(r) ? String(r) : String(r)
}

const px = (n) => (n === 0 ? '0' : `${clean(n)}px`)

/** أوزان الخطوط كما تسمّيها Figma → أرقام CSS. */
const WEIGHTS = {
  Regular: 400,
  Medium: 500,
  SemiBold: 600,
  Bold: 700,
  ExtraBold: 800,
}

/** مجموعات القيم الرقمية التي تصير متغيّرات CSS بوحدة px. */
const PX_GROUPS = ['space', 'radius', 'icon', 'control', 'stroke']

// ── 1) اللقطة → tokens.json بصيغة W3C draft ───────────────────────
function buildW3C(snapshot) {
  const { primitives, semantic, type } = snapshot.collections

  /** يبني شجرة متداخلة من مسارات مفصولة بـ`/`. */
  const nest = (flat, leaf) => {
    const out = {}
    for (const [path, value] of Object.entries(flat)) {
      const parts = path.split('/')
      let node = out
      for (const part of parts.slice(0, -1)) {
        node[part] ??= {}
        node = node[part]
      }
      node[parts[parts.length - 1]] = leaf(path, value)
    }
    return out
  }

  const typeOf = (path, value) => {
    if (typeof value === 'string' && value.startsWith('#')) return 'color'
    if (path.startsWith('space/') || path.startsWith('radius/')) return 'dimension'
    if (path.startsWith('icon/') || path.startsWith('control/')) return 'dimension'
    if (path.startsWith('stroke/')) return 'dimension'
    if (path.startsWith('font/size/')) return 'dimension'
    if (path.startsWith('motion/duration/')) return 'duration'
    if (path.startsWith('motion/ease/')) return 'cubicBezier'
    if (path.startsWith('font/family/')) return 'fontFamily'
    return 'number'
  }

  const primitiveLeaf = (path, value) => {
    const $type = typeOf(path, value)
    const $value =
      $type === 'dimension' ? px(value) : $type === 'duration' ? `${clean(value)}ms` : value
    return { $type, $value }
  }

  /** مرجع W3C: `color/signal/300` → `{color.signal.300}` */
  const refOf = (name) => `{${name.replace(/\//g, '.')}}`

  const modalLeaf = (modes) => (_path, per) => {
    const value = {}
    for (const mode of modes) {
      const raw = per[mode]
      value[mode.toLowerCase()] =
        raw && typeof raw === 'object' && 'ref' in raw ? refOf(raw.ref) : raw
    }
    const sample = value[modes[0].toLowerCase()]
    const $type =
      typeof sample === 'string' && (sample.startsWith('#') || sample.startsWith('{'))
        ? 'color'
        : typeof sample === 'number'
          ? 'number'
          : 'string'
    return { $type, $extensions: { 'rasd.modes': value } }
  }

  return {
    $description: 'مولَّد من Figma — لا يُحرَّر يدويًا.',
    $extensions: { 'rasd.source': snapshot.source },
    primitives: nest(primitives.values, primitiveLeaf),
    semantic: nest(semantic.values, modalLeaf(semantic.modes)),
    type: nest(type.values, modalLeaf(type.modes)),
  }
}

// ── 2) tokens.css ─────────────────────────────────────────────────
function buildCss(snapshot) {
  const { primitives, semantic, type } = snapshot.collections
  const L = []

  L.push(BANNER, '')

  // (أ) الأوليات — قيم خام، وضع واحد
  L.push('/* ── 1 · Primitives — قيم خام لا تُشار إليها من مكوّن ── */')
  L.push(':root {')
  for (const [name, value] of Object.entries(primitives.values)) {
    const group = name.split('/')[0]
    if (group === 'color') {
      L.push(`  ${PREFIX}-${kebab(name).replace(/^color-/, 'color-')}: ${value};`)
    } else if (PX_GROUPS.includes(group)) {
      L.push(`  ${PREFIX}-${kebab(name)}: ${px(value)};`)
    } else if (name.startsWith('font/size/')) {
      L.push(`  ${PREFIX}-${kebab(name)}: ${px(value)};`)
    } else if (name.startsWith('font/leading/')) {
      L.push(`  ${PREFIX}-${kebab(name)}: ${clean(value)};`)
    } else if (name.startsWith('motion/duration/')) {
      L.push(`  ${PREFIX}-${kebab(name)}: ${clean(value)}ms;`)
    } else if (name.startsWith('motion/ease/') || name.startsWith('font/family/')) {
      L.push(`  ${PREFIX}-${kebab(name)}: ${value};`)
    }
  }
  L.push('}', '')

  // (ب) الدلالية — الوضع الداكن على :root، فهو الافتراضي في رصد
  const semanticBlock = (mode, indent = '  ') => {
    const out = []
    for (const [name, per] of Object.entries(semantic.values)) {
      const raw = per[mode]
      const value =
        raw && typeof raw === 'object' && 'ref' in raw ? `var(${PREFIX}-${kebab(raw.ref)})` : raw
      out.push(`${indent}${PREFIX}-${kebab(name)}: ${value};`)
    }
    return out
  }

  L.push('/* ── 2 · Semantic — الطبقة الوحيدة التي يُشير إليها المكوّن ── */')
  L.push('/* الداكن هو الافتراضي: رصد يعمل فوق صفحات لا يملكها، والداكن أهدأ عليها. */')
  L.push(':root {', ...semanticBlock('Dark'), '}', '')
  L.push('/* الفاتح: تفضيل النظام، ما لم يفرض المستخدم الداكن صراحةً. */')
  L.push('@media (prefers-color-scheme: light) {')
  L.push(`  :root:not([data-theme='dark']) {`, ...semanticBlock('Light', '    '), '  }')
  L.push('}', '')
  L.push('/* الفاتح: اختيار صريح من المستخدم — يتفوّق على تفضيل النظام. */')
  L.push(`:root[data-theme='light'] {`, ...semanticBlock('Light'), '}', '')

  // (ج) المقاييس ثنائية اللغة — العربية هي الأساس
  const typeBlock = (mode, indent = '  ') => {
    const out = []
    for (const [name, per] of Object.entries(type.values)) {
      const raw = per[mode]
      if (name === 'direction') {
        out.push(`${indent}${PREFIX}-direction: ${String(raw).toLowerCase()};`)
      } else if (name === 'align/start') {
        out.push(`${indent}${PREFIX}-align-start: ${String(raw).toLowerCase()};`)
      } else if (name.startsWith('tracking/')) {
        out.push(`${indent}${PREFIX}-${kebab(name)}: ${clean(raw / 100)}em;`)
      } else if (name.startsWith('leading/')) {
        out.push(`${indent}${PREFIX}-${kebab(name)}: ${clean(raw / 100)};`)
      } else {
        out.push(`${indent}${PREFIX}-${kebab(name)}: ${raw};`)
      }
    }
    return out
  }

  L.push('/* ── 3 · Type — المقاييس ثنائية اللغة. العربية هي الأساس لا الترجمة. ── */')
  L.push(':root {', ...typeBlock('Arabic'), '}', '')
  L.push(`:root[lang='en'], [lang='en'] {`, ...typeBlock('Latin'), '}', '')

  // (د) الارتفاع والتوهّج — من أنماط التأثير
  L.push('/* ── أنماط التأثير — ظلّان لكل مستوى، لأن رصد يجلس فوق صفحات لا يملكها ── */')
  L.push(':root {')
  for (const [name, effects] of Object.entries(snapshot.effectStyles)) {
    const key = kebab(name.replace(/\s*·\s*.*$/, ''))
    const shadow = effects
      .map(
        (fx) =>
          `${fx.type === 'INNER_SHADOW' ? 'inset ' : ''}${px(fx.x)} ${px(fx.y)} ${px(fx.blur)}${
            fx.spread ? ` ${px(fx.spread)}` : ''
          } ${fx.color}`,
      )
      .join(', ')
    L.push(`  ${PREFIX}-${key}: ${shadow};`)
  }
  L.push('}', '')

  // (هـ) الحركة تحت تفضيل تقليلها — في ورقة التوكنز لا في كل مكوّن
  L.push('/* ── تقليل الحركة: تُصفَّر المدد هنا مرّة واحدة، لا في كل مكوّن ── */')
  L.push('@media (prefers-reduced-motion: reduce) {')
  L.push('  :root {')
  for (const name of Object.keys(primitives.values)) {
    if (name.startsWith('motion/duration/')) L.push(`    ${PREFIX}-${kebab(name)}: 0ms;`)
  }
  L.push('  }')
  L.push('}', '')

  // (و) أنماط النص — لا `font-size` مباشر في أي مكوّن
  L.push('/* ── أنماط النص — 62 فئة. المكوّن يستخدم الفئة، لا font-size. ── */')
  for (const [name, s] of Object.entries(snapshot.textStyles)) {
    const role = s.f === 'Almarai' ? 'display' : s.f === 'Cairo' ? 'text' : 'mono'
    // الاحتياطي يطابق دور الخط: المونو لا يسقط إلى sans-serif.
    const fallback = role === 'mono' ? 'ui-monospace, monospace' : 'system-ui, sans-serif'
    const decl = [
      `font-family: var(${PREFIX}-font-family-${role}), ${fallback}`,
      `font-size: ${px(s.size)}`,
      `font-weight: ${WEIGHTS[s.w] ?? 400}`,
      `line-height: ${clean(s.lh / 100)}`,
      `letter-spacing: ${s.ls === 0 ? '0' : `${clean(s.ls / 100)}em`}`,
    ]
    if (s.case === 'UPPER') decl.push('text-transform: uppercase')
    L.push(`.t-${classOf(name)} { ${decl.join('; ')}; }`)
  }
  L.push('')

  // (ز) الاتجاه — المونو والكود لا يُعكسان أبدًا
  L.push('/* ── الاتجاه: المونو وكتل الكود تبقى LTR داخل واجهة RTL ── */')
  L.push(`[class^='t-mono-'], [class*=' t-mono-'], code, pre, kbd, samp {`)
  L.push('  direction: ltr;')
  L.push('  unicode-bidi: isolate;')
  L.push('  text-align: left;')
  L.push('}', '')
  L.push('/* المقطع التقني داخل نصّ عربي — يعزل نفسه فلا يعيد bidi ترتيب السطر. */')
  L.push('bdi[data-technical] {')
  L.push('  direction: ltr;')
  L.push('  unicode-bidi: isolate;')
  L.push('}', '')
  L.push('/* الأيقونات الاتجاهية تُعكس؛ ما عداها لا. */')
  L.push(`[data-mirror='true'] {`)
  L.push('  scale: -1 1;')
  L.push('}')

  return L.join('\n') + '\n'
}

// ── 3) tailwind.tokens.js — مخرَج للمستهلك ────────────────────────
function buildTailwind(snapshot) {
  const { primitives, semantic } = snapshot.collections
  const group = (prefix, transform) => {
    const out = {}
    for (const name of Object.keys(primitives.values)) {
      if (!name.startsWith(prefix)) continue
      out[name.slice(prefix.length)] = transform(name)
    }
    return out
  }

  const colors = {}
  for (const name of Object.keys(semantic.values)) {
    const [head, ...rest] = name.split('/')
    colors[head] ??= {}
    colors[head][rest.join('-') || 'DEFAULT'] = `var(${PREFIX}-${kebab(name)})`
  }

  const config = {
    theme: {
      extend: {
        colors,
        spacing: group('space/', (n) => `var(${PREFIX}-${kebab(n)})`),
        borderRadius: group('radius/', (n) => `var(${PREFIX}-${kebab(n)})`),
        transitionDuration: group('motion/duration/', (n) => `var(${PREFIX}-${kebab(n)})`),
        transitionTimingFunction: group('motion/ease/', (n) => `var(${PREFIX}-${kebab(n)})`),
        boxShadow: Object.fromEntries(
          Object.keys(snapshot.effectStyles).map((n) => [
            kebab(n.replace(/\s*·\s*.*$/, '')),
            `var(${PREFIX}-${kebab(n.replace(/\s*·\s*.*$/, ''))})`,
          ]),
        ),
      },
    },
  }

  return `${BANNER}\nmodule.exports = ${JSON.stringify(config, null, 2)}\n`
}

// ── 4) tokens.ts — أنواع حرفية تجعل التوكن الخاطئ خطأ ترجمة ───────
function buildTs(snapshot) {
  const { primitives, semantic, type } = snapshot.collections
  const union = (names) =>
    names.length === 0 ? 'never' : names.map((n) => `\n  | '${n}'`).join('')

  const semanticNames = Object.keys(semantic.values)
  const spaceNames = Object.keys(primitives.values).filter((n) => n.startsWith('space/'))
  const radiusNames = Object.keys(primitives.values).filter((n) => n.startsWith('radius/'))
  const textStyleNames = Object.keys(snapshot.textStyles)
  const effectNames = Object.keys(snapshot.effectStyles).map((n) => n.replace(/\s*·\s*.*$/, ''))

  // يحسم سلسلة المراجع إلى قيمة سداسية نهائية لكل وضع.
  const resolveRef = (raw) => {
    if (raw && typeof raw === 'object' && 'ref' in raw) {
      const target = primitives.values[raw.ref]
      return typeof target === 'string' ? target : String(target)
    }
    return raw
  }
  const resolvedHex = {}
  for (const [name, per] of Object.entries(semantic.values)) {
    resolvedHex[name] = { dark: resolveRef(per.Dark), light: resolveRef(per.Light) }
  }

  const tsBanner = [
    '/**',
    ' * مولَّد من ملف Figma عبر `pnpm tokens:sync` — لا يُحرَّر يدويًا.',
    ' * المصدر: src/tokens/figma-snapshot.json',
    ' */',
  ].join('\n')

  return `${tsBanner}

/** كل توكن دلالي. التوكن الخاطئ خطأ ترجمة لا عطل وقت تشغيل. */
export type SemanticToken =${union(semanticNames)}

export type SpaceToken =${union(spaceNames)}

export type RadiusToken =${union(radiusNames)}

export type TextStyle =${union(textStyleNames)}

export type EffectStyle =${union(effectNames)}

export type TypeToken =${union(Object.keys(type.values))}

/** يحوّل اسم التوكن إلى \`var(--rasd-…)\` جاهزة للاستخدام في CSS. */
export function cssVar(token: SemanticToken | SpaceToken | RadiusToken): string {
  return \`var(--rasd-\${token.replace(/\\//g, '-')})\`
}

/** يحوّل اسم نمط النص إلى اسم فئته. */
export function textClass(style: TextStyle): string {
  return \`t-\${style.replace(/\\//g, '-').replace(/\\s+/g, '-').toLowerCase()}\`
}

/**
 * القيم المحسومة لكل توكن دلالي في الوضعين.
 *
 * ضرورية للشيفرة التي ترسم على Canvas (المرحلة 15) ولا تصلها متغيّرات CSS.
 * الاستخدام في CSS يبقى \`var(--rasd-…)\`، لا هذه الخريطة.
 */
export const SEMANTIC_HEX: Record<SemanticToken, { dark: string; light: string }> = ${JSON.stringify(resolvedHex, null, 2)}

/** يحوّل توكنًا دلاليًّا إلى قيمة سداسية في وضع محدَّد. */
export function resolveColor(token: SemanticToken, mode: 'dark' | 'light' = 'dark'): string {
  return SEMANTIC_HEX[token][mode]
}

export const SEMANTIC_TOKENS = ${JSON.stringify(semanticNames, null, 2)} as const

export const TEXT_STYLES = ${JSON.stringify(textStyleNames, null, 2)} as const
`
}

// ── نسخة الظلّ ────────────────────────────────────────────────────
/**
 * يحوّل ورقة التوكنز إلى نسخة صالحة **داخل Shadow Root**.
 *
 * الطبقة داخل الصفحة تعيش في جذر ظلّ مغلق، و`:root` هناك لا يطابق شيئًا —
 * فالجذر في شجرة الظلّ هو `:host`. بلا هذه النسخة تفقد كل عناصر الطبقة كل
 * توكن، وتعود إلى قيم المتصفّح الافتراضية.
 *
 * ولماذا داخل الظلّ لا على العنصر المضيف: الصفحة المضيفة تستطيع أن تكتب
 * `* { --rasd-…: … !important }` وتصيب عنصرًا في مستندها، لكنها **لا تستطيع
 * الوصول إلى داخل جذر ظلّ مغلق إطلاقًا**. تعريف التوكنز في الداخل يجعل
 * التلوين محصّنًا لا مجرّد مرجَّح.
 *
 * التحويل يعمل على نصّ نحن ولّدناه، فأشكال المحدِّدات معروفة ومحصورة:
 *   `:root {`                        → `:host {`
 *   `:root:not([data-theme='dark'])` → `:host(:not([data-theme='dark']))`
 *   `:root[lang='en'], [lang='en']`  → `:host([lang='en']), [lang='en']`
 * وترتيب البدائل مهمّ: الشكل المركَّب قبل المجرَّد.
 */
export function toShadowScope(cssText) {
  return cssText
    .split('\n')
    .map((line) => {
      if (!line.includes(':root')) return line
      return line
        .replace(/:root(:not\([^)]*\))/g, ':host($1)')
        .replace(/:root(\[[^\]]*\])/g, ':host($1)')
        .replace(/:root\b(?!\()/g, ':host')
    })
    .join('\n')
    .replace(
      'لا يُحرَّر يدويًا.',
      'لا يُحرَّر يدويًا.\n   نسخة Shadow Root: الجذر هنا `:host` لا `:root`.',
    )
}

// ── التشغيل ───────────────────────────────────────────────────────
if (!existsSync(snapshotPath)) {
  console.error(`لقطة Figma غير موجودة: ${snapshotPath}`)
  process.exit(1)
}
const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'))

const css = buildCss(snapshot)

const outputs = {
  'tokens.json': JSON.stringify(buildW3C(snapshot), null, 2) + '\n',
  'tokens.css': css,
  'tokens-shadow.css': toShadowScope(css),
  'tailwind.tokens.js': buildTailwind(snapshot),
  'tokens.ts': buildTs(snapshot),
}

let drift = 0
for (const [file, content] of Object.entries(outputs)) {
  const path = join(DEST[file], file)
  const previous = existsSync(path) ? readFileSync(path, 'utf8') : null
  if (CHECK) {
    if (previous !== content) {
      console.error(`✗ انحراف في ${file} — شغّل \`pnpm tokens:sync\``)
      drift++
    }
  } else {
    writeFileSync(path, content)
  }
}

const counts = {
  primitives: Object.keys(snapshot.collections.primitives.values).length,
  semantic: Object.keys(snapshot.collections.semantic.values).length,
  type: Object.keys(snapshot.collections.type.values).length,
  textStyles: Object.keys(snapshot.textStyles).length,
  effectStyles: Object.keys(snapshot.effectStyles).length,
}

if (CHECK) {
  if (drift > 0) process.exit(1)
  console.log('✓ التوكنز متطابقة مع اللقطة — لا انحراف.')
} else {
  console.log('توليد التوكنز:')
  console.log(
    `  ✓ ${counts.primitives} أوليًّا · ${counts.semantic} دلاليًّا · ${counts.type} مقياسًا`,
  )
  console.log(`  ✓ ${counts.textStyles} نمط نص · ${counts.effectStyles} نمط تأثير`)
  for (const file of Object.keys(outputs)) {
    const where = DEST[file] === assetsDir ? 'public/assets' : 'src/tokens'
    console.log(`  ✓ ${where}/${file}`)
  }
}
