import { fakeBrowser } from '@webext-core/fake-browser'
import { beforeEach } from 'vitest'

import pkg from '../package.json' with { type: 'json' }

// `chrome.*` غير موجود خارج المتصفح — نركّب بديلًا مزيّفًا قبل أي اختبار.
Object.assign(globalThis, { chrome: fakeBrowser, browser: fakeBrowser })

/** `fake-browser` لا يطبّق `getManifest`؛ نعطيه بيانًا واقعيًا من `package.json`. */
function installManifest() {
  fakeBrowser.runtime.getManifest = () => ({
    manifest_version: 3,
    name: 'رصد',
    version: pkg.version,
  })
}

installManifest()

/**
 * happy-dom لا يُعرِّف خصائص `on*` لأحداث السحب-والإفلات (`ondrop`،
 * `ondragover`…) على `HTMLElement.prototype` — غير المدعومة في DOM
 * الحقيقي حيث GlobalEventHandlers تشملها دومًا. Preact يستدلّ حالة حرف
 * اسم الحدث بفحص `'ondrop' in dom`؛ حين يغيب يسجّل مستمعًا باسم
 * `Drop` (بحرف كبير كما وردت الخاصية JSX) بدل `drop` القياسي، فلا
 * يطابق أي حدث DOM حقيقي أبدًا. رقعة بيئة اختبار لا كود — السلوك
 * الحقيقي في المتصفح سليم أصلًا.
 */
const DRAG_EVENT_HANDLER_PROPS = [
  'ondrag',
  'ondragend',
  'ondragenter',
  'ondragleave',
  'ondragover',
  'ondragstart',
  'ondrop',
] as const

// بعض ملفّات الاختبار تُشغَّل ببيئة `node` (بلا DOM) — `HTMLElement` غائب
// كليًا هناك، لا القيد وحده.
if (typeof HTMLElement !== 'undefined') {
  for (const prop of DRAG_EVENT_HANDLER_PROPS) {
    if (!(prop in HTMLElement.prototype)) {
      Object.defineProperty(HTMLElement.prototype, prop, {
        value: null,
        writable: true,
        configurable: true,
      })
    }
  }
}

beforeEach(() => {
  fakeBrowser.reset()
  installManifest()
})
