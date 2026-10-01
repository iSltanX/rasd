/**
 * قسم التكاملات — GitHub وحده (`Docs/Design.md` §7 القرار 3). الشاشة وحالاتها الأربع في `pages/integrations/`؛
 * وهذا القسم يضعها في صفحة الإعدادات ويصلها بقسم الخصوصية حيث يُوقَف «الوضع المحلّي فقط».
 */
import { ConnectionsPanel } from '../../integrations/ConnectionsPanel'

export interface IntegrationsSectionProps {
  readonly onOpenPrivacy: () => void
}

export function IntegrationsSection({ onOpenPrivacy }: IntegrationsSectionProps) {
  return <ConnectionsPanel onOpenPrivacy={onOpenPrivacy} />
}
