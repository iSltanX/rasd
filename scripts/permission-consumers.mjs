/**
 * «لا صلاحية في البيان بلا مستهلك» — حكمٌ خالص يستورده `verify-dist.mjs`، ويُختبر بلا بناء في
 * `tests/unit/build/permission-consumers.test.ts` (موجبةٌ تمرّ وسالبةٌ لكل صنفٍ مرفوض). القرار في
 * [ADR 0055](../Docs/ADR/0055-permission-consumers.md).
 *
 * **حارس ناتج لا حارس مصدر**، كـ`BUNDLE_BANS`: يُقرأ ما وصل `dist/` فعلًا، فمستهلكٌ هزّته الشجرة خارج الحزمة،
 * أو مسارٌ حُذف وبقيت صلاحيته، يُسقط البناء كما تُسقطه صلاحيةٌ أُضيفت بلا سطر كود.
 *
 * كل صلاحية واجهة في `permissions` و`optional_permissions` لها هنا **بصمة نداء** يجب أن تظهر في ملفّ JavaScript
 * واحدٍ على الأقلّ من الحزمة. والبصمة اسم واجهة المتصفّح نفسها — أسماء الخصائص لا يمسّها التصغير — لا نصٌّ يشرحها:
 * نصوص المبرّرات تصل الحزمة كذلك، فبصمةٌ تطابقها حارسٌ يرضيه وجوده.
 *
 * وصلاحيات المضيف خارج هذا الجدول عمدًا: أنماط الخدمات المسمّاة قائمةٌ مغلقة يطابقها `verify:dist` حرفًا ولكلٍّ
 * منها ADR (‏ADR 0046)، ومستهلكها مخرج الشبكة الواحد بمعرّف الخدمة — لا نداءٌ تتميّز به بصمة.
 */

/**
 * بصمة كل صلاحية مسموح بإعلانها. **إضافة صلاحية إلى البيان تشترط سطرًا هنا** — وإلا سقط البناء بـ«بلا بصمة».
 * وسطرٌ هنا لصلاحيةٍ غير معلَنة يسقط كذلك: جدولٌ يتقادم يعطي الحارس ثقةً لا يستحقّها.
 */
export const PERMISSION_CONSUMERS = {
  activeTab: {
    pattern: /\bchrome\.tabs\.captureVisibleTab\(/,
    consumer: 'التقاط التبويب النشط بعد الإيماءة (`background/capture-service.ts`)',
  },
  scripting: {
    pattern: /\bchrome\.scripting\.executeScript\(/,
    consumer: 'حقن الطبقة بعد البوّابة الواحدة (`background/commands.ts`)',
  },
  storage: {
    pattern: /\bchrome\.storage\.(?:local|session)\.(?:get|set)\(/,
    consumer: 'الإعدادات وحالة القفل (`shared/settings/` · `shared/storage/lock-state.ts`)',
  },
  unlimitedStorage: {
    pattern: /\bindexedDB\.open\(/,
    consumer: 'مكتبة اللقطات في IndexedDB (`shared/storage/db.ts` عبر `idb`)',
  },
  contextMenus: {
    pattern: /\bchrome\.contextMenus\.create\(/,
    consumer: 'قائمة الزرّ الأيمن (`background/context-menus.ts`)',
  },
  alarms: {
    pattern: /\bchrome\.alarms\.create\(/,
    consumer: 'حارس المهامّ والحذف الدوري (`background/lifecycle.ts`)',
  },
  downloads: {
    pattern: /\bchrome\.downloads\.download\(/,
    consumer:
      'الحفظ في مجلّد التنزيلات (`background/capture-mirror.ts` · `pages/export/deliver.ts`)',
  },
}

/**
 * يحكم على صلاحيات البيان مقابل نصوص الحزمة. `sources` مصفوفة `{ file, text }` لملفّات JavaScript في `dist/`.
 * يرجع `{ problems, matched }`: كل مشكلةٍ جملةٌ تسمّي الصلاحية وسببها، و`matched` لكل صلاحية مستهلكةٍ أوّلَ ملفٍّ
 * ظهرت فيه بصمتها (للطباعة).
 */
export function judgePermissionConsumers(manifest, sources, table = PERMISSION_CONSUMERS) {
  const problems = []
  const matched = []
  const declared = [...(manifest?.permissions ?? []), ...(manifest?.optional_permissions ?? [])]

  if (sources.length === 0) {
    return { problems: ['لا ملفّ JavaScript في الحزمة — تعذّر البحث عن المستهلكين'], matched }
  }

  for (const permission of declared) {
    const entry = Object.hasOwn(table, permission) ? table[permission] : undefined
    if (!entry) {
      problems.push(
        `${permission} بلا بصمة مستهلك في scripts/permission-consumers.mjs — صلاحية بلا مستهلك أو بلا قرار`,
      )
      continue
    }
    const hit = sources.find(({ text }) => entry.pattern.test(text))
    if (hit) matched.push({ permission, file: hit.file, consumer: entry.consumer })
    else {
      problems.push(
        `${permission} معلَنة ولا مستهلك لها في الحزمة — لا ملفّ يطابق ${entry.pattern} (${entry.consumer})`,
      )
    }
  }

  for (const permission of Object.keys(table)) {
    if (!declared.includes(permission)) {
      problems.push(`بصمة ${permission} في الجدول والصلاحية غير معلَنة — جدولٌ متقادم`)
    }
  }

  return { problems, matched }
}
