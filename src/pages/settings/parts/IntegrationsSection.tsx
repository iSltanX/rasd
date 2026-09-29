/**
 * قسم التكاملات — GitHub وحده (`Docs/Design.md` §7 القرار 3). محرّكه في `STAGES/11` و
 * `STAGES/12`، فالقسم يقول ما سيأتي وما يحكمه، ولا يعرض زرّ اتّصال لا يتّصل.
 */
import { Chip } from '@/ui/components/Chip/Chip'
import { SettingRow } from '@/ui/components/SettingRow/SettingRow'

import { Group } from './Group'

export function IntegrationsSection() {
  return (
    <Group title="GitHub" id="integrations-github">
      <SettingRow
        label="افتح Issue من اللقطة مباشرةً"
        hint="يصل مع تكامل GitHub. لا يتّصل رصد بأي خدمة حتى توقف «الوضع المحلّي فقط» وتفعّله أنت"
        control={<Chip tone="neutral">قريبًا</Chip>}
      />
    </Group>
  )
}
