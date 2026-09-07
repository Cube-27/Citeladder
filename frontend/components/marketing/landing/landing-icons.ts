import {
  BarChart3,
  Briefcase,
  Building2,
  ChartLine,
  CircleCheck,
  FileCheck2,
  FileText,
  Fingerprint,
  GraduationCap,
  Landmark,
  Link2,
  Megaphone,
  Newspaper,
  Pencil,
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
  prove: Fingerprint,
  compliance: FileCheck2,
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
  indigo: 'bg-tile-indigo text-tile-indigo-ink',
  purple: 'bg-tile-purple text-tile-purple-ink',
  green: 'bg-tile-green text-tile-green-ink',
};

/** The deep ink rung alone, for glyphs sitting on a white chip inside a
    tinted panel (the workflow steps' icon carriers). */
export const LANDING_TILE_INKS: Record<TileKey, string> = {
  blue: 'text-tile-blue-ink',
  indigo: 'text-tile-indigo-ink',
  purple: 'text-tile-purple-ink',
  green: 'text-tile-green-ink',
};
