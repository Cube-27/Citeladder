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
/**
 * One glyph per navigation destination, the system's mega-menu set. Keyed by
 * href so the content module stays plain data and the menus and capability
 * cards agree on the same mark. Resources rows are text only and have none.
 */
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

/** The destination's glyph, or nothing when the destination has none. */
export function NavIcon({ href, className }: Readonly<{ href: string; className?: string }>) {
  const Icon = NAV_ICONS[href];
  return Icon ? <Icon aria-hidden className={className} /> : null;
}
