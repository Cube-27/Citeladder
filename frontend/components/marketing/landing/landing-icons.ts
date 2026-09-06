import {
  BarChart3,
  Briefcase,
  Building2,
  ChartLine,
  CircleCheck,
  FileText,
  GraduationCap,
  Landmark,
  Link2,
  Megaphone,
  Newspaper,
  Pencil,
  ShieldCheck,
  ShoppingCart,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import type { IconKey, TileKey } from '@/lib/marketing-content/landing';

/**
 * Resolves the landing content's string icon keys to lucide components and its
 * tile keys to the token classes behind the pastel icon tiles
 * (globals.css `--color-tile-*`), so the content module stays pure data and
 * the sections share one icon/tile vocabulary.
 */
export const LANDING_ICONS: Record<IconKey, LucideIcon> = {
  collect: FileText,
  analyze: BarChart3,
  improve: Pencil,
  verify: CircleCheck,
  named: Megaphone,
  cited: Link2,
  prove: ShieldCheck,
  compliance: ShieldCheck,
  sso: Users,
  audit: FileText,
  support: ChartLine,
  education: GraduationCap,
  commerce: ShoppingCart,
  services: Briefcase,
  saas: Building2,
  media: Newspaper,
  finance: Landmark,
};

export const LANDING_TILES: Record<TileKey, string> = {
  blue: 'bg-tile-blue text-tile-blue-ink',
  violet: 'bg-tile-violet text-tile-violet-ink',
  amber: 'bg-tile-amber text-tile-amber-ink',
  green: 'bg-tile-green text-tile-green-ink',
};
