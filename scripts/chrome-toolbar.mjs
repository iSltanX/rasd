#!/usr/bin/env node
/**
 * ألوان شريط Chrome الحقيقية بالوضعين، وتباين أيقونة الشريط عليها (`Docs/Brand/README.md`).
 *
 * **ليست حارسًا.** تقيس ولا تحكم: كانت ألوان الأشرطة في دليل العلامة مفترَضة، وهذه تقرؤها من Chrome
 * نفسه. صفحات Chrome الداخلية تحمّل `chrome://theme/colors.css` بألوان المزوِّد الذي يرسم الشريط
 * (`--color-toolbar`)، والوضع يُفرض من تفضيل الملفّ الشخصي (`browser.theme.color_scheme`: 1 فاتح،
 * 2 داكن) لا من سمة النظام — بلا التفضيل يتبع الملفّ الجديد سمة الجهاز فيخرج الوضعان واحدًا.
 *
 *   node scripts/chrome-toolbar.mjs
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
]
const chromePath = process.env.CHROME_PATH ?? CANDIDATES.find((p) => existsSync(p))
if (!chromePath) {
  console.error('لم يُعثر على Chrome. مرّر المسار عبر CHROME_PATH.')
  process.exit(1)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** يقرأ متغيّرات ألوان Chrome في وضع واحد. */
async function readColours(scheme, port) {
  const profile = mkdtempSync(join(tmpdir(), 'rasd-toolbar-'))
  mkdirSync(join(profile, 'Default'))
  writeFileSync(
    join(profile, 'Default', 'Preferences'),
    JSON.stringify({ browser: { theme: { color_scheme: scheme, color_scheme2: scheme } } }),
  )
  const proc = spawn(
    chromePath,
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      '--no-first-run',
      'about:blank',
    ],
    { stdio: 'ignore' },
  )
  try {
    let version = null
    for (let i = 0; i < 200 && !version; i++) {
      try {
        version = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).Browser
      } catch {
        await sleep(100)
      }
    }
    if (!version) throw new Error('تعذّر الاتصال بـDevTools')
    const [page] = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
    const sock = new WebSocket(page.webSocketDebuggerUrl)
    await new Promise((r) => sock.addEventListener('open', r, { once: true }))
    let nextId = 0
    const send = (method, params = {}) =>
      new Promise((resolve) => {
        const id = ++nextId
        const onMsg = (ev) => {
          const msg = JSON.parse(ev.data)
          if (msg.id !== id) return
          sock.removeEventListener('message', onMsg)
          resolve(msg.result)
        }
        sock.addEventListener('message', onMsg)
        sock.send(JSON.stringify({ id, method, params }))
      })
    await send('Page.navigate', { url: 'chrome://theme/colors.css?sets=ui,chrome' })
    let css = ''
    for (let i = 0; i < 50 && !css.includes('--color-toolbar:'); i++) {
      await sleep(100)
      const res = await send('Runtime.evaluate', {
        expression: 'document.body ? document.body.innerText : ""',
        returnByValue: true,
      })
      css = res?.result?.value ?? ''
    }
    sock.close()
    const pick = (name) => css.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i'))?.[1]
    return { version, toolbar: pick('color-toolbar'), icon: pick('color-toolbar-button-icon') }
  } finally {
    proc.kill('SIGKILL')
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    } catch {
      /* Chrome ما يزال يكتب */
    }
  }
}

function luminance(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const [r, g, b] = c.map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return ((hi + 0.05) / (lo + 0.05)).toFixed(2)
}

// ألوان الأيقونة من التوكنز المولَّدة — لا نسخة يدوية تنجرف عنها.
const tokens = readFileSync(join(root, 'public', 'assets', 'tokens.css'), 'utf8')
const token = (name) => tokens.match(new RegExp(`--rasd-color-${name}:\\s*(#[0-9a-f]{6})`, 'i'))[1]
const ICON = {
  'البلاطة الخاملة ink/1000': token('ink-1000'),
  'البلاطة النشطة signal/300': token('signal-300'),
  'الأحادية signal/600': token('signal-600'),
}

for (const [label, scheme, port] of [
  ['فاتح', 1, 9451],
  ['داكن', 2, 9452],
]) {
  const { version, toolbar, icon } = await readColours(scheme, port)
  console.log(`${label} — ${version}: الشريط ${toolbar} · أيقونات Chrome ${icon}`)
  for (const [name, hex] of Object.entries(ICON)) {
    console.log(`   ${name} ${hex}: ${contrast(hex, toolbar)} : 1`)
  }
}
