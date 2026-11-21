import {
  Activity,
  ChartColumn,
  CircleCheck,
  CodeXml,
  CreditCard,
  FileText,
  House,
  KeyRound,
  Layers,
  Link2,
  MessageSquare,
  Search,
  Sparkles,
  Target,
  Users,
  Zap,
  type IconGlyph,
} from '@/lib/icons';
const NAV_ICONS: Readonly<Record<string, IconGlyph>> = {
  '/platform/ai-visibility': ChartColumn,
  '/platform/cited-sources': Link2,
  '/platform/ai-referral-analytics': Activity,
  '/platform/product-visibility': Target,
  '/platform/site-health': CircleCheck,
  '/platform/search-demand': Search,
  '/platform/keyword-research': KeyRound,
  '/platform/content-optimization': FileText,
  '/platform/agents': Sparkles,
  '/platform/mcp': CodeXml,
  '/platform/integrations': Layers,
  '/solutions#agencies': Users,
  '/solutions#in-house': House,
  '/solutions#founders': Zap,
  '/solutions#commerce': CreditCard,
  '/solutions#pr': MessageSquare,
};

export function hasNavIcon(href: string): boolean {
  return href in NAV_ICONS;
}

export function NavIcon({ href, className }: Readonly<{ href: string; className?: string }>) {
  const Icon = NAV_ICONS[href];
  return Icon ? <Icon aria-hidden className={className} /> : null;
}
