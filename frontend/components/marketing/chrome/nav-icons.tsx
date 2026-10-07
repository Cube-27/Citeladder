import {
  BarChart3,
  BookOpen,
  Compass,
  HelpCircle,
  History,
  Quote,
  Scale,
  Wrench,
  Bot,
  Building2,
  Cable,
  FileText,
  Gauge,
  Link2,
  type LucideIcon,
  Megaphone,
  MousePointerClick,
  PenLine,
  Plug,
  Rocket,
  Search,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react';

import { docsHref } from '@/lib/config/docs';

/**
 * One glyph per navigation destination. Keyed by href so the content module
 * stays plain data and the footer, menus and cards agree on the same mark.
 */
const NAV_ICONS: Readonly<Record<string, LucideIcon>> = {
  '/platform': Sparkles,
  '/platform/ai-visibility': BarChart3,
  '/platform/citation-intelligence': Link2,
  '/platform/ai-referral-analytics': MousePointerClick,
  '/platform/commerce-intelligence': ShoppingBag,
  '/platform/site-health': Gauge,
  '/platform/demand-intelligence': TrendingUp,
  '/platform/search-intelligence': Search,
  '/platform/content-intelligence': PenLine,
  '/platform/agents': Bot,
  '/platform/mcp': Cable,
  '/platform/integrations': Plug,
  '/solutions#agencies': Building2,
  '/solutions#in-house': Users,
  '/solutions#founders': Rocket,
  '/solutions#commerce': ShoppingBag,
  '/solutions#pr': Megaphone,
  '/blog': FileText,
  [docsHref()]: BookOpen,
  '/generative-engine-optimization': Compass,
  '/tools': Wrench,
  '/ai-citation-tracking': Quote,
  [docsHref('/changelog/')]: History,
  '/faq': HelpCircle,
  '/compare': Scale,
};

export function hasNavIcon(href: string): boolean {
  return href in NAV_ICONS;
}

/** The destination's glyph, or nothing when the destination has none. */
export function NavIcon({ href, className }: Readonly<{ href: string; className?: string }>) {
  const Icon = NAV_ICONS[href];
  return Icon ? <Icon aria-hidden className={className} /> : null;
}
