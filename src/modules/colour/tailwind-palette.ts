/**
 * لوحة Tailwind الافتراضية — بيانات خام لـ«أقرب لون» (`Rasd_Ar.md §6.8`).
 *
 * **المصدر واحد لا ذاكرة**: `packages/tailwindcss/theme.css` من مستودع
 * `tailwindlabs/tailwindcss` (فرع `main` عند الإصدار 4.3.3)، جُلب في
 * 2026-08-30. والقيم منقولة **حرفًا بحرف** كما وردت هناك — لا إعادة حساب
 * ولا تقريب ولا تحويل. أي تحويل يقع لاحقًا في `formats.ts` عبر `culori`،
 * فمن نقلها هنا بيده لا يُدخل خطأ تحويل في المصدر نفسه.
 *
 * **v4 لا v3**، اتّساقًا مع `TAILWIND_TARGET` في
 * `modules/style-export/tailwind.ts`: v4 أعاد صياغة اللوحة كلّها في OKLCH
 * بمدى P3 أوسع، فقيمها تختلف عن v3 اختلافًا مرئيًّا لا طفيفًا —
 * `blue-500` صار `#2b7fff` بعد أن كان `#3b82f6`. فتسمية لون باسم من
 * اللوحة الخطأ تعطي المستخدم صنفًا يُنتج لونًا آخر عمّا يرى.
 *
 * **لماذا مصفوفتان لا واحدة.** الإصدار 4.2 أضاف أربع عائلات محايدة —
 * `mauve` و`mist` و`olive` و`taupe` — لم تكن في 4.0 و4.1. وهي رماديات
 * تزاحم `slate` و`gray` و`zinc` و`neutral` و`stone` مزاحمةً مباشرة، فلو
 * خُلطت بها لكان أقرب لون لرماديٍّ ما `mist-500`، وهو صنف **لا وجود له**
 * في مشروع يبني على 4.0 أو 4.1. فبقيت `TAILWIND_PALETTE` على الاثنتين
 * والعشرين التي تعمل في كل إصدارات v4، وعُزلت الأربع في
 * `TAILWIND_PALETTE_4_2_NEUTRALS` لمن أراد ضمّها بعلم.
 *
 * **`none` زاويةً ليست خطأً**: الرماديات الخالصة تكتب
 * `oklch(98.5% 0 none)` بنحو CSS Color 4 — لا زاوية للون بلا تشبّع.
 * و`culori` يحلّلها فيُرجع اللون بلا حقل `h`، وهو ما يتوقّعه
 * `formats.ts` أصلًا (`oklchRaw.h ?? 0`).
 *
 * الملفّ **بيانات فقط**: لا منطق ولا استيراد — البحث عن الأقرب يقع في
 * وحدته، وهذه مادّته.
 * **rasd-allow-literal-file** — الملفّ كلّه جدولٌ مرجعي منقول من مصدر خارجي،
 * وقيمه اللونية **هي البيانات نفسها** لا تنسيقًا لواجهة. والتعليق على كل
 * سطر من ثلاثمئة يخفي ما يشرحه.
 */

/** درجة واحدة من اللوحة. */
export interface TailwindSwatch {
  /** الاسم كما يُكتب في Tailwind: `blue-500`. */
  readonly name: string
  /** العائلة: `blue`. */
  readonly family: string
  /** الدرجة: `500`. */
  readonly step: number
  /** القيمة كما هي في مصدر Tailwind — نصّ `oklch(...)` حرفيًّا. */
  readonly oklch: string
}

/** الإصدار المستهدَف — يطابق `TAILWIND_TARGET` في `style-export/tailwind.ts`. */
export const TAILWIND_VERSION = 4 as const

/**
 * الاثنتان والعشرون عائلة المشتركة بين كل إصدارات v4 — 22×11 = 242 درجة.
 *
 * مرتّبة بدائرة الألوان (أحمر ← حجري) ثم المحايدات، لا أبجديًّا: الترتيب
 * يُقرأ في أدوات التطوير، والجوار اللوني أنفع من جوار الحروف.
 */
export const TAILWIND_PALETTE: readonly TailwindSwatch[] = [
  { name: 'red-50', family: 'red', step: 50, oklch: 'oklch(97.1% 0.013 17.38)' },
  { name: 'red-100', family: 'red', step: 100, oklch: 'oklch(93.6% 0.032 17.717)' },
  { name: 'red-200', family: 'red', step: 200, oklch: 'oklch(88.5% 0.062 18.334)' },
  { name: 'red-300', family: 'red', step: 300, oklch: 'oklch(80.8% 0.114 19.571)' },
  { name: 'red-400', family: 'red', step: 400, oklch: 'oklch(70.4% 0.191 22.216)' },
  { name: 'red-500', family: 'red', step: 500, oklch: 'oklch(63.7% 0.237 25.331)' },
  { name: 'red-600', family: 'red', step: 600, oklch: 'oklch(57.7% 0.245 27.325)' },
  { name: 'red-700', family: 'red', step: 700, oklch: 'oklch(50.5% 0.213 27.518)' },
  { name: 'red-800', family: 'red', step: 800, oklch: 'oklch(44.4% 0.177 26.899)' },
  { name: 'red-900', family: 'red', step: 900, oklch: 'oklch(39.6% 0.141 25.723)' },
  { name: 'red-950', family: 'red', step: 950, oklch: 'oklch(25.8% 0.092 26.042)' },

  { name: 'orange-50', family: 'orange', step: 50, oklch: 'oklch(98% 0.016 73.684)' },
  { name: 'orange-100', family: 'orange', step: 100, oklch: 'oklch(95.4% 0.038 75.164)' },
  { name: 'orange-200', family: 'orange', step: 200, oklch: 'oklch(90.1% 0.076 70.697)' },
  { name: 'orange-300', family: 'orange', step: 300, oklch: 'oklch(83.7% 0.128 66.29)' },
  { name: 'orange-400', family: 'orange', step: 400, oklch: 'oklch(75% 0.183 55.934)' },
  { name: 'orange-500', family: 'orange', step: 500, oklch: 'oklch(70.5% 0.213 47.604)' },
  { name: 'orange-600', family: 'orange', step: 600, oklch: 'oklch(64.6% 0.222 41.116)' },
  { name: 'orange-700', family: 'orange', step: 700, oklch: 'oklch(55.3% 0.195 38.402)' },
  { name: 'orange-800', family: 'orange', step: 800, oklch: 'oklch(47% 0.157 37.304)' },
  { name: 'orange-900', family: 'orange', step: 900, oklch: 'oklch(40.8% 0.123 38.172)' },
  { name: 'orange-950', family: 'orange', step: 950, oklch: 'oklch(26.6% 0.079 36.259)' },

  { name: 'amber-50', family: 'amber', step: 50, oklch: 'oklch(98.7% 0.022 95.277)' },
  { name: 'amber-100', family: 'amber', step: 100, oklch: 'oklch(96.2% 0.059 95.617)' },
  { name: 'amber-200', family: 'amber', step: 200, oklch: 'oklch(92.4% 0.12 95.746)' },
  { name: 'amber-300', family: 'amber', step: 300, oklch: 'oklch(87.9% 0.169 91.605)' },
  { name: 'amber-400', family: 'amber', step: 400, oklch: 'oklch(82.8% 0.189 84.429)' },
  { name: 'amber-500', family: 'amber', step: 500, oklch: 'oklch(76.9% 0.188 70.08)' },
  { name: 'amber-600', family: 'amber', step: 600, oklch: 'oklch(66.6% 0.179 58.318)' },
  { name: 'amber-700', family: 'amber', step: 700, oklch: 'oklch(55.5% 0.163 48.998)' },
  { name: 'amber-800', family: 'amber', step: 800, oklch: 'oklch(47.3% 0.137 46.201)' },
  { name: 'amber-900', family: 'amber', step: 900, oklch: 'oklch(41.4% 0.112 45.904)' },
  { name: 'amber-950', family: 'amber', step: 950, oklch: 'oklch(27.9% 0.077 45.635)' },

  { name: 'yellow-50', family: 'yellow', step: 50, oklch: 'oklch(98.7% 0.026 102.212)' },
  { name: 'yellow-100', family: 'yellow', step: 100, oklch: 'oklch(97.3% 0.071 103.193)' },
  { name: 'yellow-200', family: 'yellow', step: 200, oklch: 'oklch(94.5% 0.129 101.54)' },
  { name: 'yellow-300', family: 'yellow', step: 300, oklch: 'oklch(90.5% 0.182 98.111)' },
  { name: 'yellow-400', family: 'yellow', step: 400, oklch: 'oklch(85.2% 0.199 91.936)' },
  { name: 'yellow-500', family: 'yellow', step: 500, oklch: 'oklch(79.5% 0.184 86.047)' },
  { name: 'yellow-600', family: 'yellow', step: 600, oklch: 'oklch(68.1% 0.162 75.834)' },
  { name: 'yellow-700', family: 'yellow', step: 700, oklch: 'oklch(55.4% 0.135 66.442)' },
  { name: 'yellow-800', family: 'yellow', step: 800, oklch: 'oklch(47.6% 0.114 61.907)' },
  { name: 'yellow-900', family: 'yellow', step: 900, oklch: 'oklch(42.1% 0.095 57.708)' },
  { name: 'yellow-950', family: 'yellow', step: 950, oklch: 'oklch(28.6% 0.066 53.813)' },

  { name: 'lime-50', family: 'lime', step: 50, oklch: 'oklch(98.6% 0.031 120.757)' },
  { name: 'lime-100', family: 'lime', step: 100, oklch: 'oklch(96.7% 0.067 122.328)' },
  { name: 'lime-200', family: 'lime', step: 200, oklch: 'oklch(93.8% 0.127 124.321)' },
  { name: 'lime-300', family: 'lime', step: 300, oklch: 'oklch(89.7% 0.196 126.665)' },
  { name: 'lime-400', family: 'lime', step: 400, oklch: 'oklch(84.1% 0.238 128.85)' },
  { name: 'lime-500', family: 'lime', step: 500, oklch: 'oklch(76.8% 0.233 130.85)' },
  { name: 'lime-600', family: 'lime', step: 600, oklch: 'oklch(64.8% 0.2 131.684)' },
  { name: 'lime-700', family: 'lime', step: 700, oklch: 'oklch(53.2% 0.157 131.589)' },
  { name: 'lime-800', family: 'lime', step: 800, oklch: 'oklch(45.3% 0.124 130.933)' },
  { name: 'lime-900', family: 'lime', step: 900, oklch: 'oklch(40.5% 0.101 131.063)' },
  { name: 'lime-950', family: 'lime', step: 950, oklch: 'oklch(27.4% 0.072 132.109)' },

  { name: 'green-50', family: 'green', step: 50, oklch: 'oklch(98.2% 0.018 155.826)' },
  { name: 'green-100', family: 'green', step: 100, oklch: 'oklch(96.2% 0.044 156.743)' },
  { name: 'green-200', family: 'green', step: 200, oklch: 'oklch(92.5% 0.084 155.995)' },
  { name: 'green-300', family: 'green', step: 300, oklch: 'oklch(87.1% 0.15 154.449)' },
  { name: 'green-400', family: 'green', step: 400, oklch: 'oklch(79.2% 0.209 151.711)' },
  { name: 'green-500', family: 'green', step: 500, oklch: 'oklch(72.3% 0.219 149.579)' },
  { name: 'green-600', family: 'green', step: 600, oklch: 'oklch(62.7% 0.194 149.214)' },
  { name: 'green-700', family: 'green', step: 700, oklch: 'oklch(52.7% 0.154 150.069)' },
  { name: 'green-800', family: 'green', step: 800, oklch: 'oklch(44.8% 0.119 151.328)' },
  { name: 'green-900', family: 'green', step: 900, oklch: 'oklch(39.3% 0.095 152.535)' },
  { name: 'green-950', family: 'green', step: 950, oklch: 'oklch(26.6% 0.065 152.934)' },

  { name: 'emerald-50', family: 'emerald', step: 50, oklch: 'oklch(97.9% 0.021 166.113)' },
  { name: 'emerald-100', family: 'emerald', step: 100, oklch: 'oklch(95% 0.052 163.051)' },
  { name: 'emerald-200', family: 'emerald', step: 200, oklch: 'oklch(90.5% 0.093 164.15)' },
  { name: 'emerald-300', family: 'emerald', step: 300, oklch: 'oklch(84.5% 0.143 164.978)' },
  { name: 'emerald-400', family: 'emerald', step: 400, oklch: 'oklch(76.5% 0.177 163.223)' },
  { name: 'emerald-500', family: 'emerald', step: 500, oklch: 'oklch(69.6% 0.17 162.48)' },
  { name: 'emerald-600', family: 'emerald', step: 600, oklch: 'oklch(59.6% 0.145 163.225)' },
  { name: 'emerald-700', family: 'emerald', step: 700, oklch: 'oklch(50.8% 0.118 165.612)' },
  { name: 'emerald-800', family: 'emerald', step: 800, oklch: 'oklch(43.2% 0.095 166.913)' },
  { name: 'emerald-900', family: 'emerald', step: 900, oklch: 'oklch(37.8% 0.077 168.94)' },
  { name: 'emerald-950', family: 'emerald', step: 950, oklch: 'oklch(26.2% 0.051 172.552)' },

  { name: 'teal-50', family: 'teal', step: 50, oklch: 'oklch(98.4% 0.014 180.72)' },
  { name: 'teal-100', family: 'teal', step: 100, oklch: 'oklch(95.3% 0.051 180.801)' },
  { name: 'teal-200', family: 'teal', step: 200, oklch: 'oklch(91% 0.096 180.426)' },
  { name: 'teal-300', family: 'teal', step: 300, oklch: 'oklch(85.5% 0.138 181.071)' },
  { name: 'teal-400', family: 'teal', step: 400, oklch: 'oklch(77.7% 0.152 181.912)' },
  { name: 'teal-500', family: 'teal', step: 500, oklch: 'oklch(70.4% 0.14 182.503)' },
  { name: 'teal-600', family: 'teal', step: 600, oklch: 'oklch(60% 0.118 184.704)' },
  { name: 'teal-700', family: 'teal', step: 700, oklch: 'oklch(51.1% 0.096 186.391)' },
  { name: 'teal-800', family: 'teal', step: 800, oklch: 'oklch(43.7% 0.078 188.216)' },
  { name: 'teal-900', family: 'teal', step: 900, oklch: 'oklch(38.6% 0.063 188.416)' },
  { name: 'teal-950', family: 'teal', step: 950, oklch: 'oklch(27.7% 0.046 192.524)' },

  { name: 'cyan-50', family: 'cyan', step: 50, oklch: 'oklch(98.4% 0.019 200.873)' },
  { name: 'cyan-100', family: 'cyan', step: 100, oklch: 'oklch(95.6% 0.045 203.388)' },
  { name: 'cyan-200', family: 'cyan', step: 200, oklch: 'oklch(91.7% 0.08 205.041)' },
  { name: 'cyan-300', family: 'cyan', step: 300, oklch: 'oklch(86.5% 0.127 207.078)' },
  { name: 'cyan-400', family: 'cyan', step: 400, oklch: 'oklch(78.9% 0.154 211.53)' },
  { name: 'cyan-500', family: 'cyan', step: 500, oklch: 'oklch(71.5% 0.143 215.221)' },
  { name: 'cyan-600', family: 'cyan', step: 600, oklch: 'oklch(60.9% 0.126 221.723)' },
  { name: 'cyan-700', family: 'cyan', step: 700, oklch: 'oklch(52% 0.105 223.128)' },
  { name: 'cyan-800', family: 'cyan', step: 800, oklch: 'oklch(45% 0.085 224.283)' },
  { name: 'cyan-900', family: 'cyan', step: 900, oklch: 'oklch(39.8% 0.07 227.392)' },
  { name: 'cyan-950', family: 'cyan', step: 950, oklch: 'oklch(30.2% 0.056 229.695)' },

  { name: 'sky-50', family: 'sky', step: 50, oklch: 'oklch(97.7% 0.013 236.62)' },
  { name: 'sky-100', family: 'sky', step: 100, oklch: 'oklch(95.1% 0.026 236.824)' },
  { name: 'sky-200', family: 'sky', step: 200, oklch: 'oklch(90.1% 0.058 230.902)' },
  { name: 'sky-300', family: 'sky', step: 300, oklch: 'oklch(82.8% 0.111 230.318)' },
  { name: 'sky-400', family: 'sky', step: 400, oklch: 'oklch(74.6% 0.16 232.661)' },
  { name: 'sky-500', family: 'sky', step: 500, oklch: 'oklch(68.5% 0.169 237.323)' },
  { name: 'sky-600', family: 'sky', step: 600, oklch: 'oklch(58.8% 0.158 241.966)' },
  { name: 'sky-700', family: 'sky', step: 700, oklch: 'oklch(50% 0.134 242.749)' },
  { name: 'sky-800', family: 'sky', step: 800, oklch: 'oklch(44.3% 0.11 240.79)' },
  { name: 'sky-900', family: 'sky', step: 900, oklch: 'oklch(39.1% 0.09 240.876)' },
  { name: 'sky-950', family: 'sky', step: 950, oklch: 'oklch(29.3% 0.066 243.157)' },

  { name: 'blue-50', family: 'blue', step: 50, oklch: 'oklch(97% 0.014 254.604)' },
  { name: 'blue-100', family: 'blue', step: 100, oklch: 'oklch(93.2% 0.032 255.585)' },
  { name: 'blue-200', family: 'blue', step: 200, oklch: 'oklch(88.2% 0.059 254.128)' },
  { name: 'blue-300', family: 'blue', step: 300, oklch: 'oklch(80.9% 0.105 251.813)' },
  { name: 'blue-400', family: 'blue', step: 400, oklch: 'oklch(70.7% 0.165 254.624)' },
  { name: 'blue-500', family: 'blue', step: 500, oklch: 'oklch(62.3% 0.214 259.815)' },
  { name: 'blue-600', family: 'blue', step: 600, oklch: 'oklch(54.6% 0.245 262.881)' },
  { name: 'blue-700', family: 'blue', step: 700, oklch: 'oklch(48.8% 0.243 264.376)' },
  { name: 'blue-800', family: 'blue', step: 800, oklch: 'oklch(42.4% 0.199 265.638)' },
  { name: 'blue-900', family: 'blue', step: 900, oklch: 'oklch(37.9% 0.146 265.522)' },
  { name: 'blue-950', family: 'blue', step: 950, oklch: 'oklch(28.2% 0.091 267.935)' },

  { name: 'indigo-50', family: 'indigo', step: 50, oklch: 'oklch(96.2% 0.018 272.314)' },
  { name: 'indigo-100', family: 'indigo', step: 100, oklch: 'oklch(93% 0.034 272.788)' },
  { name: 'indigo-200', family: 'indigo', step: 200, oklch: 'oklch(87% 0.065 274.039)' },
  { name: 'indigo-300', family: 'indigo', step: 300, oklch: 'oklch(78.5% 0.115 274.713)' },
  { name: 'indigo-400', family: 'indigo', step: 400, oklch: 'oklch(67.3% 0.182 276.935)' },
  { name: 'indigo-500', family: 'indigo', step: 500, oklch: 'oklch(58.5% 0.233 277.117)' },
  { name: 'indigo-600', family: 'indigo', step: 600, oklch: 'oklch(51.1% 0.262 276.966)' },
  { name: 'indigo-700', family: 'indigo', step: 700, oklch: 'oklch(45.7% 0.24 277.023)' },
  { name: 'indigo-800', family: 'indigo', step: 800, oklch: 'oklch(39.8% 0.195 277.366)' },
  { name: 'indigo-900', family: 'indigo', step: 900, oklch: 'oklch(35.9% 0.144 278.697)' },
  { name: 'indigo-950', family: 'indigo', step: 950, oklch: 'oklch(25.7% 0.09 281.288)' },

  { name: 'violet-50', family: 'violet', step: 50, oklch: 'oklch(96.9% 0.016 293.756)' },
  { name: 'violet-100', family: 'violet', step: 100, oklch: 'oklch(94.3% 0.029 294.588)' },
  { name: 'violet-200', family: 'violet', step: 200, oklch: 'oklch(89.4% 0.057 293.283)' },
  { name: 'violet-300', family: 'violet', step: 300, oklch: 'oklch(81.1% 0.111 293.571)' },
  { name: 'violet-400', family: 'violet', step: 400, oklch: 'oklch(70.2% 0.183 293.541)' },
  { name: 'violet-500', family: 'violet', step: 500, oklch: 'oklch(60.6% 0.25 292.717)' },
  { name: 'violet-600', family: 'violet', step: 600, oklch: 'oklch(54.1% 0.281 293.009)' },
  { name: 'violet-700', family: 'violet', step: 700, oklch: 'oklch(49.1% 0.27 292.581)' },
  { name: 'violet-800', family: 'violet', step: 800, oklch: 'oklch(43.2% 0.232 292.759)' },
  { name: 'violet-900', family: 'violet', step: 900, oklch: 'oklch(38% 0.189 293.745)' },
  { name: 'violet-950', family: 'violet', step: 950, oklch: 'oklch(28.3% 0.141 291.089)' },

  { name: 'purple-50', family: 'purple', step: 50, oklch: 'oklch(97.7% 0.014 308.299)' },
  { name: 'purple-100', family: 'purple', step: 100, oklch: 'oklch(94.6% 0.033 307.174)' },
  { name: 'purple-200', family: 'purple', step: 200, oklch: 'oklch(90.2% 0.063 306.703)' },
  { name: 'purple-300', family: 'purple', step: 300, oklch: 'oklch(82.7% 0.119 306.383)' },
  { name: 'purple-400', family: 'purple', step: 400, oklch: 'oklch(71.4% 0.203 305.504)' },
  { name: 'purple-500', family: 'purple', step: 500, oklch: 'oklch(62.7% 0.265 303.9)' },
  { name: 'purple-600', family: 'purple', step: 600, oklch: 'oklch(55.8% 0.288 302.321)' },
  { name: 'purple-700', family: 'purple', step: 700, oklch: 'oklch(49.6% 0.265 301.924)' },
  { name: 'purple-800', family: 'purple', step: 800, oklch: 'oklch(43.8% 0.218 303.724)' },
  { name: 'purple-900', family: 'purple', step: 900, oklch: 'oklch(38.1% 0.176 304.987)' },
  { name: 'purple-950', family: 'purple', step: 950, oklch: 'oklch(29.1% 0.149 302.717)' },

  { name: 'fuchsia-50', family: 'fuchsia', step: 50, oklch: 'oklch(97.7% 0.017 320.058)' },
  { name: 'fuchsia-100', family: 'fuchsia', step: 100, oklch: 'oklch(95.2% 0.037 318.852)' },
  { name: 'fuchsia-200', family: 'fuchsia', step: 200, oklch: 'oklch(90.3% 0.076 319.62)' },
  { name: 'fuchsia-300', family: 'fuchsia', step: 300, oklch: 'oklch(83.3% 0.145 321.434)' },
  { name: 'fuchsia-400', family: 'fuchsia', step: 400, oklch: 'oklch(74% 0.238 322.16)' },
  { name: 'fuchsia-500', family: 'fuchsia', step: 500, oklch: 'oklch(66.7% 0.295 322.15)' },
  { name: 'fuchsia-600', family: 'fuchsia', step: 600, oklch: 'oklch(59.1% 0.293 322.896)' },
  { name: 'fuchsia-700', family: 'fuchsia', step: 700, oklch: 'oklch(51.8% 0.253 323.949)' },
  { name: 'fuchsia-800', family: 'fuchsia', step: 800, oklch: 'oklch(45.2% 0.211 324.591)' },
  { name: 'fuchsia-900', family: 'fuchsia', step: 900, oklch: 'oklch(40.1% 0.17 325.612)' },
  { name: 'fuchsia-950', family: 'fuchsia', step: 950, oklch: 'oklch(29.3% 0.136 325.661)' },

  { name: 'pink-50', family: 'pink', step: 50, oklch: 'oklch(97.1% 0.014 343.198)' },
  { name: 'pink-100', family: 'pink', step: 100, oklch: 'oklch(94.8% 0.028 342.258)' },
  { name: 'pink-200', family: 'pink', step: 200, oklch: 'oklch(89.9% 0.061 343.231)' },
  { name: 'pink-300', family: 'pink', step: 300, oklch: 'oklch(82.3% 0.12 346.018)' },
  { name: 'pink-400', family: 'pink', step: 400, oklch: 'oklch(71.8% 0.202 349.761)' },
  { name: 'pink-500', family: 'pink', step: 500, oklch: 'oklch(65.6% 0.241 354.308)' },
  { name: 'pink-600', family: 'pink', step: 600, oklch: 'oklch(59.2% 0.249 0.584)' },
  { name: 'pink-700', family: 'pink', step: 700, oklch: 'oklch(52.5% 0.223 3.958)' },
  { name: 'pink-800', family: 'pink', step: 800, oklch: 'oklch(45.9% 0.187 3.815)' },
  { name: 'pink-900', family: 'pink', step: 900, oklch: 'oklch(40.8% 0.153 2.432)' },
  { name: 'pink-950', family: 'pink', step: 950, oklch: 'oklch(28.4% 0.109 3.907)' },

  { name: 'rose-50', family: 'rose', step: 50, oklch: 'oklch(96.9% 0.015 12.422)' },
  { name: 'rose-100', family: 'rose', step: 100, oklch: 'oklch(94.1% 0.03 12.58)' },
  { name: 'rose-200', family: 'rose', step: 200, oklch: 'oklch(89.2% 0.058 10.001)' },
  { name: 'rose-300', family: 'rose', step: 300, oklch: 'oklch(81% 0.117 11.638)' },
  { name: 'rose-400', family: 'rose', step: 400, oklch: 'oklch(71.2% 0.194 13.428)' },
  { name: 'rose-500', family: 'rose', step: 500, oklch: 'oklch(64.5% 0.246 16.439)' },
  { name: 'rose-600', family: 'rose', step: 600, oklch: 'oklch(58.6% 0.253 17.585)' },
  { name: 'rose-700', family: 'rose', step: 700, oklch: 'oklch(51.4% 0.222 16.935)' },
  { name: 'rose-800', family: 'rose', step: 800, oklch: 'oklch(45.5% 0.188 13.697)' },
  { name: 'rose-900', family: 'rose', step: 900, oklch: 'oklch(41% 0.159 10.272)' },
  { name: 'rose-950', family: 'rose', step: 950, oklch: 'oklch(27.1% 0.105 12.094)' },

  { name: 'slate-50', family: 'slate', step: 50, oklch: 'oklch(98.4% 0.003 247.858)' },
  { name: 'slate-100', family: 'slate', step: 100, oklch: 'oklch(96.8% 0.007 247.896)' },
  { name: 'slate-200', family: 'slate', step: 200, oklch: 'oklch(92.9% 0.013 255.508)' },
  { name: 'slate-300', family: 'slate', step: 300, oklch: 'oklch(86.9% 0.022 252.894)' },
  { name: 'slate-400', family: 'slate', step: 400, oklch: 'oklch(70.4% 0.04 256.788)' },
  { name: 'slate-500', family: 'slate', step: 500, oklch: 'oklch(55.4% 0.046 257.417)' },
  { name: 'slate-600', family: 'slate', step: 600, oklch: 'oklch(44.6% 0.043 257.281)' },
  { name: 'slate-700', family: 'slate', step: 700, oklch: 'oklch(37.2% 0.044 257.287)' },
  { name: 'slate-800', family: 'slate', step: 800, oklch: 'oklch(27.9% 0.041 260.031)' },
  { name: 'slate-900', family: 'slate', step: 900, oklch: 'oklch(20.8% 0.042 265.755)' },
  { name: 'slate-950', family: 'slate', step: 950, oklch: 'oklch(12.9% 0.042 264.695)' },

  { name: 'gray-50', family: 'gray', step: 50, oklch: 'oklch(98.5% 0.002 247.839)' },
  { name: 'gray-100', family: 'gray', step: 100, oklch: 'oklch(96.7% 0.003 264.542)' },
  { name: 'gray-200', family: 'gray', step: 200, oklch: 'oklch(92.8% 0.006 264.531)' },
  { name: 'gray-300', family: 'gray', step: 300, oklch: 'oklch(87.2% 0.01 258.338)' },
  { name: 'gray-400', family: 'gray', step: 400, oklch: 'oklch(70.7% 0.022 261.325)' },
  { name: 'gray-500', family: 'gray', step: 500, oklch: 'oklch(55.1% 0.027 264.364)' },
  { name: 'gray-600', family: 'gray', step: 600, oklch: 'oklch(44.6% 0.03 256.802)' },
  { name: 'gray-700', family: 'gray', step: 700, oklch: 'oklch(37.3% 0.034 259.733)' },
  { name: 'gray-800', family: 'gray', step: 800, oklch: 'oklch(27.8% 0.033 256.848)' },
  { name: 'gray-900', family: 'gray', step: 900, oklch: 'oklch(21% 0.034 264.665)' },
  { name: 'gray-950', family: 'gray', step: 950, oklch: 'oklch(13% 0.028 261.692)' },

  { name: 'zinc-50', family: 'zinc', step: 50, oklch: 'oklch(98.5% 0 none)' },
  { name: 'zinc-100', family: 'zinc', step: 100, oklch: 'oklch(96.7% 0.001 286.375)' },
  { name: 'zinc-200', family: 'zinc', step: 200, oklch: 'oklch(92% 0.004 286.32)' },
  { name: 'zinc-300', family: 'zinc', step: 300, oklch: 'oklch(87.1% 0.006 286.286)' },
  { name: 'zinc-400', family: 'zinc', step: 400, oklch: 'oklch(70.5% 0.015 286.067)' },
  { name: 'zinc-500', family: 'zinc', step: 500, oklch: 'oklch(55.2% 0.016 285.938)' },
  { name: 'zinc-600', family: 'zinc', step: 600, oklch: 'oklch(44.2% 0.017 285.786)' },
  { name: 'zinc-700', family: 'zinc', step: 700, oklch: 'oklch(37% 0.013 285.805)' },
  { name: 'zinc-800', family: 'zinc', step: 800, oklch: 'oklch(27.4% 0.006 286.033)' },
  { name: 'zinc-900', family: 'zinc', step: 900, oklch: 'oklch(21% 0.006 285.885)' },
  { name: 'zinc-950', family: 'zinc', step: 950, oklch: 'oklch(14.1% 0.005 285.823)' },

  { name: 'neutral-50', family: 'neutral', step: 50, oklch: 'oklch(98.5% 0 none)' },
  { name: 'neutral-100', family: 'neutral', step: 100, oklch: 'oklch(97% 0 none)' },
  { name: 'neutral-200', family: 'neutral', step: 200, oklch: 'oklch(92.2% 0 none)' },
  { name: 'neutral-300', family: 'neutral', step: 300, oklch: 'oklch(87% 0 none)' },
  { name: 'neutral-400', family: 'neutral', step: 400, oklch: 'oklch(70.8% 0 none)' },
  { name: 'neutral-500', family: 'neutral', step: 500, oklch: 'oklch(55.6% 0 none)' },
  { name: 'neutral-600', family: 'neutral', step: 600, oklch: 'oklch(43.9% 0 none)' },
  { name: 'neutral-700', family: 'neutral', step: 700, oklch: 'oklch(37.1% 0 none)' },
  { name: 'neutral-800', family: 'neutral', step: 800, oklch: 'oklch(26.9% 0 none)' },
  { name: 'neutral-900', family: 'neutral', step: 900, oklch: 'oklch(20.5% 0 none)' },
  { name: 'neutral-950', family: 'neutral', step: 950, oklch: 'oklch(14.5% 0 none)' },

  { name: 'stone-50', family: 'stone', step: 50, oklch: 'oklch(98.5% 0.001 106.423)' },
  { name: 'stone-100', family: 'stone', step: 100, oklch: 'oklch(97% 0.001 106.424)' },
  { name: 'stone-200', family: 'stone', step: 200, oklch: 'oklch(92.3% 0.003 48.717)' },
  { name: 'stone-300', family: 'stone', step: 300, oklch: 'oklch(86.9% 0.005 56.366)' },
  { name: 'stone-400', family: 'stone', step: 400, oklch: 'oklch(70.9% 0.01 56.259)' },
  { name: 'stone-500', family: 'stone', step: 500, oklch: 'oklch(55.3% 0.013 58.071)' },
  { name: 'stone-600', family: 'stone', step: 600, oklch: 'oklch(44.4% 0.011 73.639)' },
  { name: 'stone-700', family: 'stone', step: 700, oklch: 'oklch(37.4% 0.01 67.558)' },
  { name: 'stone-800', family: 'stone', step: 800, oklch: 'oklch(26.8% 0.007 34.298)' },
  { name: 'stone-900', family: 'stone', step: 900, oklch: 'oklch(21.6% 0.006 56.043)' },
  { name: 'stone-950', family: 'stone', step: 950, oklch: 'oklch(14.7% 0.004 49.25)' },
]

/**
 * محايدات 4.2 الأربع — **خارج** `TAILWIND_PALETTE` عمدًا.
 *
 * تُضمّ فقط حين يُعلم أن المشروع على 4.2 فأعلى؛ وإلّا فاسمٌ منها وعدٌ بصنف
 * لا يُصرَّف. انظر شرح الترويسة.
 */
export const TAILWIND_PALETTE_4_2_NEUTRALS: readonly TailwindSwatch[] = [
  { name: 'mauve-50', family: 'mauve', step: 50, oklch: 'oklch(98.5% 0 none)' },
  { name: 'mauve-100', family: 'mauve', step: 100, oklch: 'oklch(96% 0.003 325.6)' },
  { name: 'mauve-200', family: 'mauve', step: 200, oklch: 'oklch(92.2% 0.005 325.62)' },
  { name: 'mauve-300', family: 'mauve', step: 300, oklch: 'oklch(86.5% 0.012 325.68)' },
  { name: 'mauve-400', family: 'mauve', step: 400, oklch: 'oklch(71.1% 0.019 323.02)' },
  { name: 'mauve-500', family: 'mauve', step: 500, oklch: 'oklch(54.2% 0.034 322.5)' },
  { name: 'mauve-600', family: 'mauve', step: 600, oklch: 'oklch(43.5% 0.029 321.78)' },
  { name: 'mauve-700', family: 'mauve', step: 700, oklch: 'oklch(36.4% 0.029 323.89)' },
  { name: 'mauve-800', family: 'mauve', step: 800, oklch: 'oklch(26.3% 0.024 320.12)' },
  { name: 'mauve-900', family: 'mauve', step: 900, oklch: 'oklch(21.2% 0.019 322.12)' },
  { name: 'mauve-950', family: 'mauve', step: 950, oklch: 'oklch(14.5% 0.008 326)' },

  { name: 'mist-50', family: 'mist', step: 50, oklch: 'oklch(98.7% 0.002 197.1)' },
  { name: 'mist-100', family: 'mist', step: 100, oklch: 'oklch(96.3% 0.002 197.1)' },
  { name: 'mist-200', family: 'mist', step: 200, oklch: 'oklch(92.5% 0.005 214.3)' },
  { name: 'mist-300', family: 'mist', step: 300, oklch: 'oklch(87.2% 0.007 219.6)' },
  { name: 'mist-400', family: 'mist', step: 400, oklch: 'oklch(72.3% 0.014 214.4)' },
  { name: 'mist-500', family: 'mist', step: 500, oklch: 'oklch(56% 0.021 213.5)' },
  { name: 'mist-600', family: 'mist', step: 600, oklch: 'oklch(45% 0.017 213.2)' },
  { name: 'mist-700', family: 'mist', step: 700, oklch: 'oklch(37.8% 0.015 216)' },
  { name: 'mist-800', family: 'mist', step: 800, oklch: 'oklch(27.5% 0.011 216.9)' },
  { name: 'mist-900', family: 'mist', step: 900, oklch: 'oklch(21.8% 0.008 223.9)' },
  { name: 'mist-950', family: 'mist', step: 950, oklch: 'oklch(14.8% 0.004 228.8)' },

  { name: 'olive-50', family: 'olive', step: 50, oklch: 'oklch(98.8% 0.003 106.5)' },
  { name: 'olive-100', family: 'olive', step: 100, oklch: 'oklch(96.6% 0.005 106.5)' },
  { name: 'olive-200', family: 'olive', step: 200, oklch: 'oklch(93% 0.007 106.5)' },
  { name: 'olive-300', family: 'olive', step: 300, oklch: 'oklch(88% 0.011 106.6)' },
  { name: 'olive-400', family: 'olive', step: 400, oklch: 'oklch(73.7% 0.021 106.9)' },
  { name: 'olive-500', family: 'olive', step: 500, oklch: 'oklch(58% 0.031 107.3)' },
  { name: 'olive-600', family: 'olive', step: 600, oklch: 'oklch(46.6% 0.025 107.3)' },
  { name: 'olive-700', family: 'olive', step: 700, oklch: 'oklch(39.4% 0.023 107.4)' },
  { name: 'olive-800', family: 'olive', step: 800, oklch: 'oklch(28.6% 0.016 107.4)' },
  { name: 'olive-900', family: 'olive', step: 900, oklch: 'oklch(22.8% 0.013 107.4)' },
  { name: 'olive-950', family: 'olive', step: 950, oklch: 'oklch(15.3% 0.006 107.1)' },

  { name: 'taupe-50', family: 'taupe', step: 50, oklch: 'oklch(98.6% 0.002 67.8)' },
  { name: 'taupe-100', family: 'taupe', step: 100, oklch: 'oklch(96% 0.002 17.2)' },
  { name: 'taupe-200', family: 'taupe', step: 200, oklch: 'oklch(92.2% 0.005 34.3)' },
  { name: 'taupe-300', family: 'taupe', step: 300, oklch: 'oklch(86.8% 0.007 39.5)' },
  { name: 'taupe-400', family: 'taupe', step: 400, oklch: 'oklch(71.4% 0.014 41.2)' },
  { name: 'taupe-500', family: 'taupe', step: 500, oklch: 'oklch(54.7% 0.021 43.1)' },
  { name: 'taupe-600', family: 'taupe', step: 600, oklch: 'oklch(43.8% 0.017 39.3)' },
  { name: 'taupe-700', family: 'taupe', step: 700, oklch: 'oklch(36.7% 0.016 35.7)' },
  { name: 'taupe-800', family: 'taupe', step: 800, oklch: 'oklch(26.8% 0.011 36.5)' },
  { name: 'taupe-900', family: 'taupe', step: 900, oklch: 'oklch(21.4% 0.009 43.1)' },
  { name: 'taupe-950', family: 'taupe', step: 950, oklch: 'oklch(14.7% 0.004 49.3)' },
]
