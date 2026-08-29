#!/usr/bin/env node
/**
 * خادم ثابت لعيّنات المواقع.
 *
 * العيّنات تُخدَم من `http://127.0.0.1:5399/<name>/` بدل مواقع حقيقية: CI محكمة،
 * ولا موقع يتغيّر تحت الاختبار. الأهمّ أن الخادم **صامت شبكيًا** — لا يُصدر ولا
 * يقبل أي طلب خارجي — فيصير أي طلب يظهر في تتبّع الشبكة طلبَنا نحن لا طلب
 * العيّنة، وهذا ما يجعل ادّعاء «رصد لا يُصدر أي طلب» قابلًا للإثبات.
 *
 * عيّنة `spa/` تنقّل بـ`pushState` إلى مسارات لا ملفّ لها (`/spa/tasks`)؛ لذلك
 * أي مسار داخل مجلّد عيّنة لا يطابق ملفًّا يعود إلى `index.html` الخاص بها.
 *
 *   pnpm fixtures:serve            # يبقى يعمل
 *   pnpm fixtures:serve --once     # يطبع العنوان ويخرج (فحص صحّة)
 */
import { readFile, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

const root = fileURLToPath(new URL('../tests/fixtures/sites', import.meta.url))
const PORT = Number(process.env.RASD_FIXTURES_PORT ?? 5399)

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.md': 'text/markdown; charset=utf-8',
}

/** يمنع الخروج من جذر العيّنات عبر `..` في المسار. */
function safeJoin(base, urlPath) {
  const clean = normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, '')
  const full = resolve(base, '.' + (clean.startsWith('/') ? clean : '/' + clean))
  return full.startsWith(base) ? full : null
}

async function tryFile(path) {
  try {
    const s = await stat(path)
    if (s.isFile()) return path
    if (s.isDirectory()) {
      const index = join(path, 'index.html')
      const si = await stat(index)
      if (si.isFile()) return index
    }
  } catch {
    /* غير موجود */
  }
  return null
}

const server = createServer(async (req, res) => {
  const urlPath = (req.url ?? '/').split('?')[0]

  if (urlPath === '/') {
    res.writeHead(200, { 'content-type': TYPES['.html'] })
    res.end('<!doctype html><meta charset="utf-8"><title>rasd fixtures</title>')
    return
  }

  const target = safeJoin(root, urlPath)
  if (!target) {
    res.writeHead(403).end('forbidden')
    return
  }

  let file = await tryFile(target)

  // احتياطي SPA: أوّل مقطع هو اسم العيّنة، وأي مسار تحته يعود إلى صفحتها.
  if (!file) {
    const first = urlPath.split('/').filter(Boolean)[0]
    if (first) file = await tryFile(join(root, first, 'index.html'))
  }

  if (!file) {
    res.writeHead(404, { 'content-type': TYPES['.html'] }).end('<h1>404</h1>')
    return
  }

  const body = await readFile(file)
  res.writeHead(200, {
    'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
    // العيّنات تتغيّر أثناء التطوير، والتخزين المؤقّت يخفي التغيير.
    'cache-control': 'no-store',
  })
  res.end(body)
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\nعيّنات المواقع: http://127.0.0.1:${PORT}/\n`)
  if (process.argv.includes('--once')) server.close()
})
