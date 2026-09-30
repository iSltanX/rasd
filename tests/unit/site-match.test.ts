import { describe, expect, it, vi } from 'vitest'

import { evaluateGate } from '@/shared/injection-gate'
import { isSiteExcluded, matchesSitePattern, normalizeSitePattern } from '@/shared/site-match'

/**
 * مُطابِق المواقع المستثناة — أربعة وستون متجهًا مُولَّدة بفريق أحمر.
 *
 * **لماذا جدولٌ بهذا الحجم لدالّةٍ بهذا الصغر.** هذه الدالّة هي كل ما يقف
 * بين وعدٍ مكتوب في شاشة الإعدادات («لا تعمل الإضافة هنا») وبين نقضه
 * صامتًا. وخطؤها لا يُرى: لا رسالة، ولا سجلّ، ولا شيء يخبر المستخدم أن
 * مصرفه لم يكن مستثنى قطّ. فالتغطية هنا ليست ترفًا بل الشيء الوحيد الذي
 * يمكن أن يكشف العطل أصلًا.
 *
 * والمتجهات مُولَّدة بخمس عدسات مستقلّة — كلٌّ عمياء عمّا تراه الأخرى:
 * يونيكود ونطاقات دولية · خدع سلطة العنوان · دلالة البدل · المخطّطات
 * ودورة الحياة · حدود `localOnly`. والتنوّع مقصود: التكرار يجد العطل
 * نفسه خمس مرّات، والاختلاف يجد خمسة أعطال.
 *
 * **ويُفحَص القرار المركَّب لا المُطابِق وحده.** `about:blank` و`blob:` و
 * `view-source:` و`file://` أعطت المُطابِقَ وحده «لا تطابق» وهي مواضع يجب
 * منعها — لأن مانعها `checkInjectable` لا المُطابِق. ففحصُ نصف البوّابة
 * كان سيُظهر ثمانية أعطال لا وجود لها، ويُخفي ما لا يُكشَف إلّا بتركيبهما.
 *
 * **الانحرافان المقصودان** مُعلَّمان أدناه بـ«انحراف مُسجَّل»، وكلاهما في
 * اتجاه **توسيع** المنع لا اختراقه. وعدد التجاوزات صفر.
 */

describe('عدسة: نطاقات دولية ويونيكود', () => {
  it('يمنع https://xn--ngb8ci.xn--wgbh1c/login ← بنك.مصر', () => {
    expect(evaluateGate('https://xn--ngb8ci.xn--wgbh1c/login', ['بنك.مصر']).allowed).toBe(false)
  })
  it('يمنع https://xn--ngb8ci.xn--wgbh1c/login ← xn--ngb8ci.xn--wgbh1c', () => {
    expect(
      evaluateGate('https://xn--ngb8ci.xn--wgbh1c/login', ['xn--ngb8ci.xn--wgbh1c']).allowed,
    ).toBe(false)
  })
  it('يمنع https://xn--istanbul-o0e.com/ ← İstanbul.com', () => {
    expect(evaluateGate('https://xn--istanbul-o0e.com/', ['İstanbul.com']).allowed).toBe(false)
  })
  it('يمنع https://rasd.app/settings ← ｒａｓｄ．ａｐｐ', () => {
    expect(evaluateGate('https://rasd.app/settings', ['ｒａｓｄ．ａｐｐ']).allowed).toBe(false)
  })
  it('يمنع https://xn--caf-dma.com/ ← café.com', () => {
    expect(evaluateGate('https://xn--caf-dma.com/', ['café.com']).allowed).toBe(false)
  })
  it('يمنع https://xn--ngb8ci.xn--wgbh1c/login ← بًنك.مصر', () => {
    expect(evaluateGate('https://xn--ngb8ci.xn--wgbh1c/login', ['بًنك.مصر']).allowed).toBe(false)
  })
  it('يمنع https://rasd.app/settings ← ‏rasd.app', () => {
    expect(evaluateGate('https://rasd.app/settings', ['‏rasd.app']).allowed).toBe(false)
  })
  it('يمنع https://www.xn--ngb8ci.xn--wgbh1c/dashboard ← *.بنك.مصر', () => {
    expect(evaluateGate('https://www.xn--ngb8ci.xn--wgbh1c/dashboard', ['*.بنك.مصر']).allowed).toBe(
      false,
    )
  })
  it('يسمح بـ https://xn--ngbof43d.xn--wgbh1c/inbox ← بريد.مصر', () => {
    expect(evaluateGate('https://xn--ngbof43d.xn--wgbh1c/inbox', ['بريد.مصر']).allowed).toBe(true)
  })
  it('يسمح بـ https://xn--pple-43d.com/id ← apple.com', () => {
    expect(evaluateGate('https://xn--pple-43d.com/id', ['apple.com']).allowed).toBe(true)
  })
  it('يسمح بـ https://xn--mgbab1b0a8ein4b0481c.xn--mgberp4a5d4ar/ ← بنك-الرياض.السعودية', () => {
    expect(
      evaluateGate('https://xn--mgbab1b0a8ein4b0481c.xn--mgberp4a5d4ar/', ['بنك-الرياض.السعودية'])
        .allowed,
    ).toBe(true)
  })
})

describe('عدسة: خدع سلطة العنوان', () => {
  it('يمنع https://user:pass@bank.com/login ← bank.com', () => {
    expect(evaluateGate('https://user:pass@bank.com/login', ['bank.com']).allowed).toBe(false)
  })
  it('يسمح بـ https://bank.com@evil.com/ ← bank.com', () => {
    expect(evaluateGate('https://bank.com@evil.com/', ['bank.com']).allowed).toBe(true)
  })
  it('يمنع https://bank.com:8443/login ← bank.com', () => {
    expect(evaluateGate('https://bank.com:8443/login', ['bank.com']).allowed).toBe(false)
  })
  it('يسمح بـ https://bank.com/login ← bank.com:8443', () => {
    expect(evaluateGate('https://bank.com/login', ['bank.com:8443']).allowed).toBe(true)
  })
  it('يمنع https://bank.com./login ← bank.com', () => {
    expect(evaluateGate('https://bank.com./login', ['bank.com']).allowed).toBe(false)
  })
  it('يمنع https://www.bank.com/login ← .bank.com', () => {
    expect(evaluateGate('https://www.bank.com/login', ['.bank.com']).allowed).toBe(false)
  })
  it('يمنع https://bank.com/login ← Bank.com', () => {
    expect(evaluateGate('https://bank.com/login', ['Bank.com']).allowed).toBe(false)
  })
  it('يمنع http://127.0.0.1/ ← 0177.0.0.1', () => {
    expect(evaluateGate('http://127.0.0.1/', ['0177.0.0.1']).allowed).toBe(false)
  })
  it('يمنع http://127.0.0.1:5000/ ← 2130706433', () => {
    expect(evaluateGate('http://127.0.0.1:5000/', ['2130706433']).allowed).toBe(false)
  })
  it('يمنع http://[::1]:3000/ ← ::1', () => {
    expect(evaluateGate('http://[::1]:3000/', ['::1']).allowed).toBe(false)
  })
  it('يسمح بـ http://127.0.0.1:8080/ ← localhost', () => {
    expect(evaluateGate('http://127.0.0.1:8080/', ['localhost']).allowed).toBe(true)
  })
  it('يمنع https://bank.com/login ← bank.com\\login', () => {
    expect(evaluateGate('https://bank.com/login', ['bank.com\\login']).allowed).toBe(false)
  })
  it('يمنع https://bank.com/login ←  bank.com ', () => {
    expect(evaluateGate('https://bank.com/login', [' bank.com ']).allowed).toBe(false)
  })
  it('يمنع https://bank.com/dashboard ← https://bank.com/login?x=1', () => {
    expect(evaluateGate('https://bank.com/dashboard', ['https://bank.com/login?x=1']).allowed).toBe(
      false,
    )
  })
  it('يسمح بـ http://bankXcom.attacker.example/ ← bank.com', () => {
    expect(evaluateGate('http://bankXcom.attacker.example/', ['bank.com']).allowed).toBe(true)
  })
  it('يسمح بـ https://anything.example/ ← ', () => {
    expect(evaluateGate('https://anything.example/', ['']).allowed).toBe(true)
  })
  it('يمنع https://bank.com/login ← bank.com', () => {
    expect(evaluateGate('https://bank.com/login', ['bank.com']).allowed).toBe(false)
  })
})

describe('عدسة: دلالة البدل والنطاقات الفرعية', () => {
  it('يمنع https://www.bank.com/login ← bank.com', () => {
    expect(evaluateGate('https://www.bank.com/login', ['bank.com']).allowed).toBe(false)
  })
  it('يمنع https://bank.com/ ← bank.com', () => {
    expect(evaluateGate('https://bank.com/', ['bank.com']).allowed).toBe(false)
  })
  it('يمنع https://login.secure.bank.com/otp ← bank.com', () => {
    expect(evaluateGate('https://login.secure.bank.com/otp', ['bank.com']).allowed).toBe(false)
  })
  it('يسمح بـ https://notbank.com/ ← bank.com', () => {
    expect(evaluateGate('https://notbank.com/', ['bank.com']).allowed).toBe(true)
  })
  it('يسمح بـ https://evil-bank.com/ ← bank.com', () => {
    expect(evaluateGate('https://evil-bank.com/', ['bank.com']).allowed).toBe(true)
  })
  it('يسمح بـ https://bank.com.evil.com/phish ← bank.com', () => {
    expect(evaluateGate('https://bank.com.evil.com/phish', ['bank.com']).allowed).toBe(true)
  })
  it('يمنع https://www.bank.com/ ← *.bank.com', () => {
    expect(evaluateGate('https://www.bank.com/', ['*.bank.com']).allowed).toBe(false)
  })
  it('يمنع https://bank.com/ ← *.bank.com', () => {
    // **انحراف مُسجَّل عن المتجه** (توقّع السماح): الجذر داخلٌ في `*.` — دلالة أنماط Chrome، والانحراف توسيعٌ لا ثغرة
    expect(evaluateGate('https://bank.com/', ['*.bank.com']).allowed).toBe(false)
  })
  it('يمنع https://example.com/anything ← *', () => {
    expect(evaluateGate('https://example.com/anything', ['*']).allowed).toBe(false)
  })
  it('يمنع https://bank.com/private/statements/2024.pdf ← bank.com/private/*', () => {
    expect(
      evaluateGate('https://bank.com/private/statements/2024.pdf', ['bank.com/private/*']).allowed,
    ).toBe(false)
  })
  it('يسمح بـ https://bank.com/public/landing ← bank.com/private/*', () => {
    expect(evaluateGate('https://bank.com/public/landing', ['bank.com/private/*']).allowed).toBe(
      true,
    )
  })
  it('يمنع https://bank.com/dashboard?session=abc123&lang=ar ← bank.com', () => {
    expect(
      evaluateGate('https://bank.com/dashboard?session=abc123&lang=ar', ['bank.com']).allowed,
    ).toBe(false)
  })
  it('يمنع https://bank.com/ar/(qsm)/transfer ← bank.com/ar/(qsm)/*', () => {
    expect(
      evaluateGate('https://bank.com/ar/(qsm)/transfer', ['bank.com/ar/(qsm)/*']).allowed,
    ).toBe(false)
  })
  it('يمنع https://bank.com/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaay ← bank.com/****************x', () => {
    // **انحراف مُسجَّل عن المتجه** (توقّع السماح): ما قبل أوّل `*` هو `/` فيُمنع المضيف كلّه — بلا `RegExp` فبلا تراجع أُسّي
    expect(
      evaluateGate(
        'https://bank.com/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaay',
        ['bank.com/****************x'],
      ).allowed,
    ).toBe(false)
  })
  it('يمنع https://xn--ngb8ci.xn--mgberp4a5d4ar/login ← بنك.السعودية', () => {
    expect(
      evaluateGate('https://xn--ngb8ci.xn--mgberp4a5d4ar/login', ['بنك.السعودية']).allowed,
    ).toBe(false)
  })
  it('يمنع https://bank.com/ ← Bank.com', () => {
    expect(evaluateGate('https://bank.com/', ['Bank.com']).allowed).toBe(false)
  })
  it('يمنع https://www.bank.com/accounts ← https://www.bank.com/', () => {
    expect(evaluateGate('https://www.bank.com/accounts', ['https://www.bank.com/']).allowed).toBe(
      false,
    )
  })
})

describe('عدسة: المخطّطات ودورة الحياة', () => {
  it('يمنع about:blank ← bank.com', () => {
    expect(evaluateGate('about:blank', ['bank.com']).allowed).toBe(false)
  })
  it('يمنع about:srcdoc ← bank.com', () => {
    expect(evaluateGate('about:srcdoc', ['bank.com']).allowed).toBe(false)
  })
  it('يمنع view-source:https://example.com/anything ← designtool.io', () => {
    expect(
      evaluateGate('view-source:https://example.com/anything', ['designtool.io']).allowed,
    ).toBe(false)
  })
  it('يمنع blob:https://bank.com/550e8400-e29b-41d4-a716-446655440000 ← bank.com', () => {
    expect(
      evaluateGate('blob:https://bank.com/550e8400-e29b-41d4-a716-446655440000', ['bank.com'])
        .allowed,
    ).toBe(false)
  })
  it('يمنع data:text/html,<h1>bank.com</h1> ← bank.com', () => {
    expect(evaluateGate('data:text/html,<h1>bank.com</h1>', ['bank.com']).allowed).toBe(false)
  })
  it('يمنع http://bank.com/login ← bank.com', () => {
    expect(evaluateGate('http://bank.com/login', ['bank.com']).allowed).toBe(false)
  })
  it('يمنع http://bank.com/login ← https://bank.com', () => {
    expect(evaluateGate('http://bank.com/login', ['https://bank.com']).allowed).toBe(false)
  })
  it('يمنع https://bank.com/ ← bank.com', () => {
    expect(evaluateGate('https://bank.com/', ['bank.com']).allowed).toBe(false)
  })
  it('يمنع https://app.example.com/admin/customer-records ← app.example.com/admin', () => {
    expect(
      evaluateGate('https://app.example.com/admin/customer-records', ['app.example.com/admin'])
        .allowed,
    ).toBe(false)
  })
  it('يمنع https://bank.com/login ← bank.com', () => {
    expect(evaluateGate('https://bank.com/login', ['bank.com']).allowed).toBe(false)
  })
  it('يمنع https://bank.com/statement ← bank.com', () => {
    expect(evaluateGate('https://bank.com/statement', ['bank.com']).allowed).toBe(false)
  })
  it('يمنع https://bank.com/anything ← bank.com', () => {
    expect(evaluateGate('https://bank.com/anything', ['bank.com']).allowed).toBe(false)
  })
  it('يسمح بـ https://designtool.io/canvas ← ', () => {
    expect(evaluateGate('https://designtool.io/canvas', ['']).allowed).toBe(true)
  })
})

describe('عدسة: حدود localOnly', () => {
  it('يسمح بـ https://mybank.example.com/login ← *.doubleclick.net', () => {
    expect(evaluateGate('https://mybank.example.com/login', ['*.doubleclick.net']).allowed).toBe(
      true,
    )
  })
  it('يمنع http://localhost:4000/internal-tool ← localhost', () => {
    expect(evaluateGate('http://localhost:4000/internal-tool', ['localhost']).allowed).toBe(false)
  })
  it('يمنع file:///Users/sara/Desktop/client-nda/mockup.html ← file://*', () => {
    expect(
      evaluateGate('file:///Users/sara/Desktop/client-nda/mockup.html', ['file://*']).allowed,
    ).toBe(false)
  })
  it('يسمح بـ https://www.figma.com/file/abc123/Design ← *.tracking-pixel.io', () => {
    expect(
      evaluateGate('https://www.figma.com/file/abc123/Design', ['*.tracking-pixel.io']).allowed,
    ).toBe(true)
  })
  it('يسمح بـ https://البنك-الأهلي.السعودية/حسابي ← *.ads.snapchat.com', () => {
    expect(
      evaluateGate('https://البنك-الأهلي.السعودية/حسابي', ['*.ads.snapchat.com']).allowed,
    ).toBe(true)
  })
  it('يسمح بـ https://drive.google.com/file/d/xyz/view ← *.pinterest.com', () => {
    expect(
      evaluateGate('https://drive.google.com/file/d/xyz/view', ['*.pinterest.com']).allowed,
    ).toBe(true)
  })
})

/**
 * المُطبِّع مُصدَّر كي ترفض شاشة الإعدادات النمط التالف **وقت الحفظ**.
 *
 * نمطٌ يُحفَظ ثمّ يُتخطّى صامتًا وقت المطابقة هو بعينه «يظنّ نفسه محميًّا
 * وليس» — أي العطل الذي بُني هذا الملفّ كلّه لمنعه.
 */
describe('normalizeSitePattern — ما يُرفَض وقت الحفظ', () => {
  it.each(['', '   ', '.', '*.', 'chrome://settings', 'file:///x', '\u200f\u200e', 'http://.'])(
    'يرفض %j',
    (raw) => {
      expect(normalizeSitePattern(raw)).toBeNull()
    },
  )

  /*
   * `URL` في Chrome ليس `URL` في Node: الأوّل يقبل مضيفًا دوليًّا فيه فراغ ويُبقي الفراغ مهرَّبًا
   * `%20` داخل الترميز، والثاني يرمي. قِيس في Chrome 153: `new URL('https://ليس نمطا').hostname`
   * = `xn--%20-qze0d1a0gmi9a`. فيُحاكى سلوكه هنا — بلا المحاكاة يمرّ الاختبار في Node على شيفرة
   * تحفظ النمط في المتصفّح الحقيقي، وهو ما وقع (`STAGES/04`).
   */
  it.each(['ليس نمطًا', 'bank com', 'بنك الرياض.com'])(
    'يرفض %j ولو قبله `URL` في Chrome مضيفًا بـ`%20`',
    (raw) => {
      const Real = URL
      /** ما يعطيه Chrome لمضيف فيه فراغ: الأصل مقبولًا والفراغ مهرَّبًا في الترميز. */
      class ChromeUrl {
        protocol = 'https:'
        hostname = 'xn--%20-qze0d1a0gmi9a'
        port = ''
        pathname = '/'
        constructor(url: string | URL, base?: string | URL) {
          const text = String(url)
          if (!/^https?:\/\/[^/]*\s/u.test(text)) return new Real(text, base)
        }
      }
      vi.stubGlobal('URL', ChromeUrl)
      try {
        expect(normalizeSitePattern(raw)).toBeNull()
      } finally {
        vi.unstubAllGlobals()
      }
    },
  )

  /*
   * المراجعة المستقلّة لـ`STAGES/04`: `URL` في Node وChrome كليهما يقبل في المضيف `,` و`;` و`"` و`(`
   * و`&` و`{` و`*` — فكان `bank.com,mail.com` يُحفَظ مضيفًا واحدًا لا يطابق أيًّا من الموقعين، وإشعار
   * «أُضيف الموقع» يؤكّد حمايةً غير موجودة. المضيف المقبول حروف وأرقام و`-` و`_` ونقاط، أو IPv6.
   */
  it.each([
    'bank.com,mail.com',
    'bank.com;mail.com',
    'ban{k}.com',
    'bank"com',
    '(bank).com',
    'bank&co.com',
    '*bank.com',
  ])('يرفض %j — مضيف لا يطابق موقعًا أبدًا', (raw) => {
    expect(normalizeSitePattern(raw)).toBeNull()
  })

  // والفراغ في المسار أو الاستعلام لا يُفسد النمط: كان يُحفظ مهرَّبًا ويطابق، ورفضه كلّه أسقطه.
  it('يقبل فراغًا في المسار أو الاستعلام، والمضيف سليم', () => {
    expect(normalizeSitePattern('bank.com/my docs/*')).toMatchObject({
      host: 'bank.com',
      pathPrefix: '/my%20docs/',
    })
    expect(normalizeSitePattern('bank.com/login?q=a b')).toMatchObject({
      host: 'bank.com',
      pathPrefix: null,
    })
  })

  it('يقبل مضيفًا فيه `_` وIPv6 بقوسيه', () => {
    expect(normalizeSitePattern('dev_box.example.com')).toMatchObject({
      host: 'dev_box.example.com',
    })
    expect(normalizeSitePattern('[::1]:3000')).toMatchObject({ host: '[::1]', port: '3000' })
  })

  it('يعيد المضيف مُطبَّعًا كي تعرضه الشاشة كما سيُطبَّق فعلًا', () => {
    expect(normalizeSitePattern('  HTTPS://Bank.com./login?x=1  ')).toMatchObject({
      host: 'bank.com',
      pathPrefix: null,
    })
    expect(normalizeSitePattern('بنك.مصر')).toMatchObject({ host: 'xn--ngb8ci.xn--wgbh1c' })
    expect(normalizeSitePattern('bank.com/private/*')).toMatchObject({
      host: 'bank.com',
      pathPrefix: '/private/',
    })
  })
})

/**
 * قائمةٌ كاملة لا نمطٌ واحد — وإدخالٌ تالف لا يُبطل ما حوله.
 */
describe('القائمة كاملةً', () => {
  it('يكفي نمطٌ واحد مطابقٌ في قائمة طويلة', () => {
    const list = ['example.com', 'أنماط تالفة', '', 'bank.com']
    expect(evaluateGate('https://login.bank.com/', list).allowed).toBe(false)
  })

  it('التالف يُتخطّى ولا يُسقط البقيّة ولا يمنع ما لم يُذكَر', () => {
    expect(evaluateGate('https://safe.example/', ['???', '   ', '.']).allowed).toBe(true)
  })

  it('قائمة فارغة لا تمنع شيئًا', () => {
    expect(evaluateGate('https://example.com/', []).allowed).toBe(true)
  })
})

/**
 * المنفذ جزء من هوية الموقع: `bank.com:8443` خدمةٌ غير `bank.com`. والمنفذ
 * الضمني للمخطّط يُقارَن بقيمته لا بغيابه، وإلّا سقط النمط الصريح على عنوانٍ
 * لا يكتب منفذه.
 */
describe('المنفذ في النمط', () => {
  it('منفذٌ صريح في العنوان يطابق النمط الذي يسمّيه', () => {
    expect(isSiteExcluded('https://bank.com:8443/login', ['bank.com:8443'])).toBe(true)
  })

  it('منفذٌ صريح مغاير لا يطابق — الاستثناء لخدمةٍ بعينها لا للمضيف كلّه', () => {
    expect(isSiteExcluded('https://bank.com:8443/login', ['bank.com:9000'])).toBe(false)
  })

  it('العنوان بلا منفذ يُقارَن بالمنفذ الضمني لمخطّطه', () => {
    // 80 ضمنيّ لـhttp: فيطابق النمط `:80`، ولا يطابقه عنوان https الذي منفذه الضمني 443.
    expect(isSiteExcluded('http://bank.com/x', ['bank.com:80'])).toBe(true)
    expect(isSiteExcluded('https://bank.com/x', ['bank.com:80'])).toBe(false)
  })

  it('مخطّط بلا منفذ ضمني معروف لا يطابق نمطًا بمنفذ صريح', () => {
    // `ftp:` خارج جدول المنافذ الضمنية (http/https وحدهما) فمنفذه «غير معلوم»، لا مطابقٌ لأيّ رقم.
    // ولا أثر عمليّ: بوّابة الحقن تصدّ هذه المخطّطات قبل بلوغ المُطابِق.
    expect(isSiteExcluded('ftp://bank.com/', ['bank.com:21'])).toBe(false)
  })

  it('النمط بلا منفذ يطابق أيّ منفذ', () => {
    expect(isSiteExcluded('https://bank.com:8443/', ['bank.com'])).toBe(true)
    expect(isSiteExcluded('http://bank.com:3000/', ['bank.com'])).toBe(true)
  })
})

/**
 * `matchesSitePattern` تُمرّر مضيف العنوان من أنبوب النمط نفسه — التماثل شرط لا
 * تجميل. و`new URL` الحقيقي يُخرج مضيفًا نظيفًا دائمًا، فلا يصل إليها مضيفٌ
 * ملوَّث إلّا من كائنٍ شبيه بـ`URL` يُمرَّر إليها مباشرةً — وهو ما تُظهره هذه
 * الحالات، لأنها الصنف الذي يفلت لو لم يُنقَّ الطرفان بالأداة نفسها.
 */
describe('تنقية مضيف العنوان قبل المقارنة', () => {
  const urlLike = (hostname: string) =>
    ({ hostname, port: '', protocol: 'https:', pathname: '/' }) as unknown as URL

  it('علامة اتجاه في المضيف لا تُفلِت الموقع المستثنى', () => {
    const pattern = normalizeSitePattern('bank.com')!

    expect(matchesSitePattern(urlLike('bank\u200f.com'), pattern)).toBe(true)
  })

  it('ومعها نقطة جذر تُنزَع كذلك بعد التنقية', () => {
    const pattern = normalizeSitePattern('bank.com')!

    expect(matchesSitePattern(urlLike('bank\u200b.com.'), pattern)).toBe(true)
  })

  it('مضيفٌ ملوَّث لا يصلح مضيفًا بعد التنقية يُقارَن كما وصل — فلا يطابق خطأً', () => {
    const pattern = normalizeSitePattern('bank.com')!

    // بعد حذف العلامة يبقى فراغٌ داخل الاسم فيرفضه المحلِّل: يُرجَع إلى الأصل ولا يطابق.
    expect(matchesSitePattern(urlLike('bank\u200f .com'), pattern)).toBe(false)
  })
})

describe('isSiteExcluded — الحدود', () => {
  it('عنوانٌ لا يُحلَّل لا يُعدّ مستثنى ولا يرمي', () => {
    expect(isSiteExcluded('ليس عنوانًا', ['bank.com'])).toBe(false)
  })

  it('لا أنماط → لا استثناء حتى لعنوانٍ لا يُحلَّل', () => {
    expect(isSiteExcluded('https://bank.com/', [])).toBe(false)
    expect(isSiteExcluded('ليس عنوانًا', [])).toBe(false)
  })
})
