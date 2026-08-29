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

beforeEach(() => {
  fakeBrowser.reset()
  installManifest()
})
