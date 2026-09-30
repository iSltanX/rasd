#!/usr/bin/env node
/**
 * قارئ خطّة الموجات وفاحص اتّساقها (ADR 0026) — **مصدرٌ واحد لثلاثة مستهلكين**:
 * مولّد اللوحة (`waves-board.mjs`)، ومُشغِّل بوّابة الموجة (`wave-verify.mjs`)، واختبار
 * `tests/unit/waves-plan.test.ts` الذي يُسقط البوّابة حين تفترق الخطّة عن الترويسات.
 *
 * الخطّة `Docs/Waves.md` Markdown يقرؤه المالك، وجدولاه («الموجات» و«المراحل») يُقرآن آليًّا هنا.
 * والحالة لا تُقرأ منها أبدًا: مصدرها ترويسات `STAGES/NN.md` ووسوم `wave-XX/base`.
 *
 *   node scripts/waves-plan.mjs     يطبع مخالفات الخطّة ويخرج بغير صفر إن وُجدت
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

export const root = fileURLToPath(new URL('..', import.meta.url))
export const PLAN_PATH = join(root, 'Docs', 'Waves.md')
export const STAGES_DIR = join(root, 'STAGES')

export const CHECKS = ['all', 'blocking', 'cone']
export const MODELS = { 'Opus 5.5': 'claude-opus-5-5', 'Sonnet 5.5': 'claude-sonnet-5-5' }
export const SIZES = ['S', 'M', 'L', 'XL']

/** الملفّات الحسّاسة (`AGENTS.md` §4) — مرحلتان متوازيتان عليها تحتاجان ضرورةً مكتوبة. */
export const SENSITIVE = [
  'src/shared/messaging/contract.ts',
  'src/shared/storage/',
  'src/shared/settings/',
  'src/content/host.ts',
  'src/shared/permission-policy.ts',
  'manifest.config.ts',
  'src/background/lifecycle.ts',
  'src/background/gate.ts',
]

/** مسارات تدخل الحزمة — مرحلةٌ تمسّها لا تكفيها بوّابة بالمخروط وحده. */
const BUNDLE = /(^|`)(src\/|public\/|manifest\.config\.ts|vite[\w.]*\.config\.ts|package\.json)/mu

export const pad = (n) => String(n).padStart(2, '0')

// ── قراءة Markdown ───────────────────────────────────────────────

/** أقسام `## ` بعناوينها — المفتاح العنوان كما هو. */
export function sections(text, level = 2) {
  const mark = '#'.repeat(level) + ' '
  const out = {}
  let current = null
  for (const line of text.split('\n')) {
    if (line.startsWith(mark)) {
      current = line.slice(mark.length).trim()
      out[current] = []
    } else if (current !== null) out[current].push(line)
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.join('\n').trim()]))
}

/** أوّل جدول في نصّ: صفوفٌ من خلايا مقصوصة، بلا العنوان والفاصل. */
export function firstTable(body) {
  const lines = body.split('\n')
  const start = lines.findIndex((line) => line.startsWith('|'))
  if (start === -1) return []
  const rows = []
  for (const line of lines.slice(start)) {
    if (!line.startsWith('|')) break
    rows.push(
      line
        .slice(1, line.endsWith('|') ? -1 : undefined)
        .split('|')
        .map((cell) => cell.trim()),
    )
  }
  return rows.slice(2)
}

/** أوّل كتلة ```text في نصّ. */
export function firstFence(body) {
  return /```text\n([\s\S]*?)\n```/u.exec(body)?.[1] ?? null
}

const plain = (cell) => cell.replace(/`/gu, '').trim()
const ids = (cell) =>
  cell
    .split('·')
    .map((part) => Number(part.trim()))
    .filter((n) => Number.isInteger(n) && n > 0)

/** `152–161` ⇐ [152, 161] · `0030–0032` ⇐ [30, 32] · `0027` ⇐ [27, 27] · غير ذلك ⇐ null. */
export function range(cell) {
  const m = /^(\d+)(?:\s*[–-]\s*(\d+))?$/u.exec(plain(cell))
  if (!m) return null
  return [Number(m[1]), Number(m[2] ?? m[1])]
}

// ── الخطّة ───────────────────────────────────────────────────────

export function parsePlan(text) {
  const parts = sections(text)
  const waves = firstTable(parts['الموجات'] ?? '').map((cells) => ({
    wave: Number(cells[0]),
    stages: ids(cells[1] ?? ''),
    check: plain(cells[2] ?? ''),
    migration: ids((cells[3] ?? '').split(' ')[0])[0] ?? null,
    manual: (cells[4] ?? '').startsWith('وجوبًا')
      ? 'required'
      : (cells[4] ?? '').startsWith('مستحقّة')
        ? 'due'
        : 'none',
    manualText: cells[4] ?? '',
    why: cells[5] ?? '',
  }))
  const stages = firstTable(parts['المراحل'] ?? '').map((cells) => ({
    id: Number(cells[0]),
    wave: Number(cells[1]),
    branch: plain(cells[2] ?? ''),
    model: cells[3] ?? '',
    size: cells[4] ?? '',
    rowsText: cells[5] ?? '',
    rows: range(cells[5] ?? ''),
    adrText: cells[6] ?? '',
    adr: range(cells[6] ?? ''),
    owns: cells[7] ?? '',
    risks: cells[8] ?? '',
  }))
  return {
    text,
    parts,
    waves,
    stages,
    templates: {
      stage: firstFence(parts['قالب البرومبت الكامل — مرحلة'] ?? ''),
      merge: firstFence(parts['قالب البرومبت الكامل — دمج موجة'] ?? ''),
      report: firstFence(parts['تقرير التسليم'] ?? ''),
    },
    roles: {
      parallel: parts['دور: مرحلة ضمن موجة'] ?? null,
      solo: parts['دور: مرحلة في موجة منفردة'] ?? null,
      merge: parts['دور: منسّق الدمج — إغلاق الموجة'] ?? null,
    },
  }
}

export function readPlan(path = PLAN_PATH) {
  return parsePlan(readFileSync(path, 'utf8'))
}

// ── المراحل ──────────────────────────────────────────────────────

/** ترويسة مرحلة وأقسامها — قراءةٌ بسيطة على وزن `stages-sync.mjs`. */
export function parseStage(text) {
  const match = /^---\n([\s\S]*?)\n---\n/u.exec(text)
  const header = {}
  for (const line of (match?.[1] ?? '').split('\n')) {
    const pair = /^([a-z]+):\s*(.*)$/u.exec(line)
    if (pair) header[pair[1]] = pair[2].trim()
  }
  const depends = /^\[(.*)\]$/u.exec(header.depends ?? '[]')?.[1] ?? ''
  return {
    id: Number(header.id),
    title: header.title ?? '',
    status: header.status ?? '',
    delivery: header.delivery ?? '',
    commit: header.commit ?? '',
    resume: header.resume ?? '',
    wave: header.wave === undefined ? null : Number(header.wave),
    depends: depends.trim() === '' ? [] : depends.split(',').map((d) => Number(d.trim())),
    sections: sections(text.slice(match?.[0].length ?? 0)),
  }
}

export function readStages(dir = STAGES_DIR) {
  return readdirSync(dir)
    .filter((name) => /^\d{2}\.md$/u.test(name))
    .sort()
    .map((name) => parseStage(readFileSync(join(dir, name), 'utf8')))
}

/** قائمة «الملفّات المتوقَّع تأثّرها» من قسم النطاق في مواصفة المرحلة. */
export function scopeFiles(stage) {
  const scope = stage.sections['النطاق'] ?? ''
  const at = scope.indexOf('**الملفّات المتوقَّع تأثّرها**')
  const out = scope.indexOf('**خارج النطاق**')
  const block = at === -1 ? '' : scope.slice(at, out === -1 ? undefined : out)
  return block
    .split('\n')
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2).trim())
}

export function outOfScope(stage) {
  const scope = stage.sections['النطاق'] ?? ''
  const out = scope.indexOf('**خارج النطاق**')
  if (out === -1) return []
  return scope
    .slice(out)
    .split('\n')
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2).trim())
}

// ── الفحص ────────────────────────────────────────────────────────

/**
 * مخالفات الخطّة مقابل الترويسات — قائمة نصوص، فارغةٌ حين تتّسق. كل قاعدة ثنائية بلا حكم،
 * وكلٌّ منها في `tests/unit/waves-plan.test.ts` بعيّنة تسقط عليها.
 */
export function checkPlan(plan, stages) {
  const errors = []
  const byId = new Map(stages.map((stage) => [stage.id, stage]))
  const rowById = new Map()

  for (const row of plan.stages) {
    if (rowById.has(row.id)) errors.push(`المرحلة ${pad(row.id)} مكرَّرة في جدول المراحل`)
    rowById.set(row.id, row)
    const stage = byId.get(row.id)
    if (!stage) {
      errors.push(`المرحلة ${pad(row.id)} في الخطّة بلا ملفّ في STAGES/`)
      continue
    }
    if (stage.wave !== row.wave) {
      errors.push(
        `المرحلة ${pad(row.id)}: الخطّة تضعها في الموجة ${row.wave} وترويستها ${stage.wave ?? 'بلا wave'}`,
      )
    }
    if (!(row.model in MODELS))
      errors.push(`المرحلة ${pad(row.id)}: نموذج غير معتمد «${row.model}»`)
    if (!SIZES.includes(row.size))
      errors.push(`المرحلة ${pad(row.id)}: حجم غير معروف «${row.size}»`)
  }
  for (const stage of stages) {
    if (stage.wave !== null && !rowById.has(stage.id)) {
      errors.push(`المرحلة ${pad(stage.id)} تحمل wave: ${stage.wave} وليست في جدول المراحل`)
    }
  }

  // الموجات: متتابعة، وكل مرحلة في صفّ موجتها مرّة واحدة.
  const seen = new Map()
  plan.waves.forEach((wave, index) => {
    if (wave.wave !== index + 1)
      errors.push(`الموجات غير متتابعة: الصفّ ${index + 1} يحمل ${wave.wave}`)
    if (!CHECKS.includes(wave.check)) {
      errors.push(`الموجة ${wave.wave}: حجم فحص غير معروف «${wave.check}»`)
    }
    for (const id of wave.stages) {
      if (seen.has(id)) errors.push(`المرحلة ${pad(id)} في الموجتين ${seen.get(id)} و${wave.wave}`)
      seen.set(id, wave.wave)
      const row = rowById.get(id)
      if (!row) errors.push(`الموجة ${wave.wave} تسمّي ${pad(id)} ولا صفّ لها في جدول المراحل`)
      else if (row.wave !== wave.wave) {
        errors.push(`المرحلة ${pad(id)} في صفّ الموجة ${wave.wave} وجدول المراحل يقول ${row.wave}`)
      }
    }
    const solo = wave.stages.length === 1
    for (const id of wave.stages) {
      const row = rowById.get(id)
      if (!row) continue
      // الفرع يدخل أمر الطرفية في اللوحة كما هو، فشكله مغلق: لا مسافة ولا رمز صدفة.
      const want = solo ? 'main' : `stage/${pad(id)}-`
      const shape = new RegExp(`^stage/${pad(id)}-[a-z0-9]+(-[a-z0-9]+)*$`, 'u')
      if (solo ? row.branch !== 'main' : !shape.test(row.branch)) {
        errors.push(
          `المرحلة ${pad(id)}: فرعها «${row.branch}» والمتوقَّع ${solo ? 'main' : `${want}…`}`,
        )
      }
    }
    // صاحبة الترحيل في موجتها، وأوّل الدمج.
    if (wave.migration !== null) {
      if (!wave.stages.includes(wave.migration)) {
        errors.push(`الموجة ${wave.wave}: صاحبة الترحيل ${pad(wave.migration)} ليست فيها`)
      } else if (wave.stages[0] !== wave.migration) {
        errors.push(`الموجة ${wave.wave}: صاحبة الترحيل ${pad(wave.migration)} ليست أوّل الدمج`)
      }
    }
    // موجةٌ تمسّ الحزمة لا تكفيها بوّابة المخروط.
    const bundle = wave.stages.filter((id) => {
      const stage = byId.get(id)
      return stage && scopeFiles(stage).some((file) => BUNDLE.test(file))
    })
    if (wave.check === 'cone' && bundle.length > 0) {
      errors.push(
        `الموجة ${wave.wave} تمسّ الحزمة (${bundle.map(pad).join(' · ')}) وفحصها cone وحده`,
      )
    }
    // ملفٌّ حسّاس بين مرحلتين متوازيتين: الضرورة مكتوبة في «مخاطر التعارض» لكلتيهما.
    for (const path of SENSITIVE) {
      const holders = wave.stages.filter((id) => {
        const stage = byId.get(id)
        return stage && scopeFiles(stage).some((file) => file.includes(path))
      })
      if (holders.length < 2) continue
      const name = path.split('/').filter(Boolean).pop()
      const unwritten = holders.filter((id) => !(rowById.get(id)?.risks ?? '').includes(name))
      if (unwritten.length > 0) {
        errors.push(
          `الموجة ${wave.wave}: ${holders.map(pad).join(' و')} تمسّان ${path} بلا ضرورة مكتوبة في مخاطر التعارض`,
        )
      }
    }
  })
  for (const stage of stages) {
    if (stage.wave !== null && !seen.has(stage.id)) {
      errors.push(`المرحلة ${pad(stage.id)} ليست في أي صفّ من جدول الموجات`)
    }
  }

  // الاعتماد: كل اعتمادية مكتملة أو في موجة أسبق — ونقاط التكامل لا تصنع دورًا.
  for (const row of plan.stages) {
    for (const dep of byId.get(row.id)?.depends ?? []) {
      const other = byId.get(dep)
      if (!other || other.status === 'done') continue
      const depWave = rowById.get(dep)?.wave
      if (depWave === undefined || depWave >= row.wave) {
        errors.push(
          `المرحلة ${pad(row.id)} (الموجة ${row.wave}) تعتمد على ${pad(dep)} (${depWave ?? '—'})`,
        )
      }
    }
  }

  // معالم الإصدار: جولة يدوية واجبة.
  for (const id of [27, 29, 30]) {
    const wave = plan.waves.find((w) => w.stages.includes(id))
    if (wave && wave.manual !== 'required') {
      errors.push(`الموجة ${wave.wave} (${pad(id)}): الجولة اليدوية «وجوبًا» شرطٌ قبل الإصدار`)
    }
  }

  // الأرقام المحجوزة: كتلٌ متصاعدة بلا تداخل بترتيب الدمج.
  for (const [key, label] of [
    ['rows', 'صفوف §6'],
    ['adr', 'ADR'],
  ]) {
    let last = 0
    for (const wave of plan.waves) {
      for (const id of wave.stages) {
        const block = rowById.get(id)?.[key]
        if (!block) continue
        if (block[0] > block[1] || block[0] <= last) {
          errors.push(`${label} للمرحلة ${pad(id)} (${block.join('–')}) تتداخل أو لا تتصاعد`)
        }
        last = block[1]
      }
    }
  }

  // لا بصمة التزام في الخطّة: أساس كل موجة وسمٌ في git لا رقمٌ في ملفّ.
  const sha = /(?<![\w/-])[0-9a-f]{7,40}(?![\w-])/u.exec(plan.text)
  if (sha) errors.push(`بصمة التزام في الخطّة «${sha[0]}» — الأساس وسمٌ لا بصمة`)

  if (!plan.templates.stage || !plan.templates.merge || !plan.templates.report) {
    errors.push('قالب مرحلة أو قالب دمج أو صيغة التقرير غائبة من الخطّة')
  }
  if (!plan.roles.parallel || !plan.roles.solo || !plan.roles.merge) {
    errors.push('قسم دورٍ غائب من الخطّة')
  }
  return errors
}

// ── التشغيل المباشر ──────────────────────────────────────────────

const invokedDirectly =
  process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())
if (invokedDirectly) {
  if (!existsSync(PLAN_PATH)) {
    console.error('✗ Docs/Waves.md غير موجود.')
    process.exit(1)
  }
  const errors = checkPlan(readPlan(), readStages())
  if (errors.length > 0) {
    for (const message of errors) console.error(`  ✗ ${message}`)
    console.error(`\n✗ ${errors.length} مخالفة في خطّة الموجات.\n`)
    process.exit(1)
  }
  console.log('✓ خطّة الموجات تتّسق مع الترويسات.')
}
