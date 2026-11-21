import { createElement, type ComponentType } from 'react';
import * as Lucide from 'lucide-react';

/**
 * The only module that imports the icon library (lint enforces it). Each glyph
 * is wrapped once to carry `data-glyph="<name>"`, the hook the stylesheets key
 * on instead of library class names, so swapping libraries remaps this file.
 */
export type IconGlyph = ComponentType<Lucide.LucideProps>;

const glyphs = new WeakSet<object>();

/** Whether an element type is one of this module's glyphs (a button's icon check). */
export function isIconGlyph(type: unknown): boolean {
  return typeof type === 'function' && glyphs.has(type);
}

function glyph(name: string, Base: Lucide.LucideIcon): IconGlyph {
  const Glyph: IconGlyph = (props) => {
    const tagged = { ...props, 'data-glyph': name };
    return createElement(Base, tagged);
  };
  Glyph.displayName = Base.displayName;
  glyphs.add(Glyph);
  return Glyph;
}

export const Activity = /* @__PURE__ */ glyph('activity', Lucide.Activity);
export const AlertCircle = /* @__PURE__ */ glyph('alert-circle', Lucide.AlertCircle);
export const AlertTriangle = /* @__PURE__ */ glyph('alert-triangle', Lucide.AlertTriangle);
export const Archive = /* @__PURE__ */ glyph('archive', Lucide.Archive);
export const ArchiveRestore = /* @__PURE__ */ glyph('archive-restore', Lucide.ArchiveRestore);
export const ArrowDown = /* @__PURE__ */ glyph('arrow-down', Lucide.ArrowDown);
export const ArrowLeft = /* @__PURE__ */ glyph('arrow-left', Lucide.ArrowLeft);
export const ArrowRight = /* @__PURE__ */ glyph('arrow-right', Lucide.ArrowRight);
export const ArrowUp = /* @__PURE__ */ glyph('arrow-up', Lucide.ArrowUp);
export const ArrowUpRight = /* @__PURE__ */ glyph('arrow-up-right', Lucide.ArrowUpRight);
const BadgeCheck = /* @__PURE__ */ glyph('badge-check', Lucide.BadgeCheck);
export const BarChart3 = /* @__PURE__ */ glyph('bar-chart-3', Lucide.BarChart3);
export const BookOpen = /* @__PURE__ */ glyph('book-open', Lucide.BookOpen);
export const Bot = /* @__PURE__ */ glyph('bot', Lucide.Bot);
export const Braces = /* @__PURE__ */ glyph('braces', Lucide.Braces);
export const Building2 = /* @__PURE__ */ glyph('building-2', Lucide.Building2);
export const Calendar = /* @__PURE__ */ glyph('calendar', Lucide.Calendar);
export const CalendarDays = /* @__PURE__ */ glyph('calendar-days', Lucide.CalendarDays);
export const CalendarPlus = /* @__PURE__ */ glyph('calendar-plus', Lucide.CalendarPlus);
export const CalendarX = /* @__PURE__ */ glyph('calendar-x', Lucide.CalendarX);
export const ChartColumn = /* @__PURE__ */ glyph('chart-column', Lucide.ChartColumn);
const ChartLine = /* @__PURE__ */ glyph('chart-line', Lucide.ChartLine);
export const ChartNoAxesColumn = /* @__PURE__ */ glyph(
  'chart-no-axes-column',
  Lucide.ChartNoAxesColumn,
);
export const Check = /* @__PURE__ */ glyph('check', Lucide.Check);
export const CheckCircle2 = /* @__PURE__ */ glyph('check-circle-2', Lucide.CheckCircle2);
export const ChevronDown = /* @__PURE__ */ glyph('chevron-down', Lucide.ChevronDown);
export const ChevronLeft = /* @__PURE__ */ glyph('chevron-left', Lucide.ChevronLeft);
export const ChevronRight = /* @__PURE__ */ glyph('chevron-right', Lucide.ChevronRight);
export const ChevronUp = /* @__PURE__ */ glyph('chevron-up', Lucide.ChevronUp);
export const ChevronsUpDown = /* @__PURE__ */ glyph('chevrons-up-down', Lucide.ChevronsUpDown);
export const CircleAlert = /* @__PURE__ */ glyph('circle-alert', Lucide.CircleAlert);
export const CircleCheck = /* @__PURE__ */ glyph('circle-check', Lucide.CircleCheck);
export const CircleDashed = /* @__PURE__ */ glyph('circle-dashed', Lucide.CircleDashed);
export const CircleHelp = /* @__PURE__ */ glyph('circle-help', Lucide.CircleHelp);
export const CircleStop = /* @__PURE__ */ glyph('circle-stop', Lucide.CircleStop);
export const ClipboardList = /* @__PURE__ */ glyph('clipboard-list', Lucide.ClipboardList);
export const Cloud = /* @__PURE__ */ glyph('cloud', Lucide.Cloud);
export const CodeXml = /* @__PURE__ */ glyph('code-xml', Lucide.CodeXml);
export const Columns3 = /* @__PURE__ */ glyph('columns-3', Lucide.Columns3);
export const Copy = /* @__PURE__ */ glyph('copy', Lucide.Copy);
export const CreditCard = /* @__PURE__ */ glyph('credit-card', Lucide.CreditCard);
export const Database = /* @__PURE__ */ glyph('database', Lucide.Database);
export const Download = /* @__PURE__ */ glyph('download', Lucide.Download);
export const Ellipsis = /* @__PURE__ */ glyph('ellipsis', Lucide.Ellipsis);
export const ExternalLink = /* @__PURE__ */ glyph('external-link', Lucide.ExternalLink);
export const Eye = /* @__PURE__ */ glyph('eye', Lucide.Eye);
export const EyeOff = /* @__PURE__ */ glyph('eye-off', Lucide.EyeOff);
const FileBarChart = /* @__PURE__ */ glyph('file-bar-chart', Lucide.FileBarChart);
export const FileSearch = /* @__PURE__ */ glyph('file-search', Lucide.FileSearch);
export const FileText = /* @__PURE__ */ glyph('file-text', Lucide.FileText);
export const Folder = /* @__PURE__ */ glyph('folder', Lucide.Folder);
export const FolderOpen = /* @__PURE__ */ glyph('folder-open', Lucide.FolderOpen);
const Gauge = /* @__PURE__ */ glyph('gauge', Lucide.Gauge);
export const GitCompare = /* @__PURE__ */ glyph('git-compare', Lucide.GitCompare);
export const Globe = /* @__PURE__ */ glyph('globe', Lucide.Globe);
export const GripVertical = /* @__PURE__ */ glyph('grip-vertical', Lucide.GripVertical);
export const History = /* @__PURE__ */ glyph('history', Lucide.History);
export const House = /* @__PURE__ */ glyph('house', Lucide.House);
export const Inbox = /* @__PURE__ */ glyph('inbox', Lucide.Inbox);
export const Info = /* @__PURE__ */ glyph('info', Lucide.Info);
export const KeyRound = /* @__PURE__ */ glyph('key-round', Lucide.KeyRound);
export const Layers = /* @__PURE__ */ glyph('layers', Lucide.Layers);
const LayoutDashboard = /* @__PURE__ */ glyph('layout-dashboard', Lucide.LayoutDashboard);
export const LayoutGrid = /* @__PURE__ */ glyph('layout-grid', Lucide.LayoutGrid);
const Lightbulb = /* @__PURE__ */ glyph('lightbulb', Lucide.Lightbulb);
export const Link2 = /* @__PURE__ */ glyph('link-2', Lucide.Link2);
export const Link2Off = /* @__PURE__ */ glyph('link-2-off', Lucide.Link2Off);
export const List = /* @__PURE__ */ glyph('list', Lucide.List);
export const ListChecks = /* @__PURE__ */ glyph('list-checks', Lucide.ListChecks);
export const ListFilter = /* @__PURE__ */ glyph('list-filter', Lucide.ListFilter);
export const ListTodo = /* @__PURE__ */ glyph('list-todo', Lucide.ListTodo);
export const ListTree = /* @__PURE__ */ glyph('list-tree', Lucide.ListTree);
export const Lock = /* @__PURE__ */ glyph('lock', Lucide.Lock);
export const LockKeyhole = /* @__PURE__ */ glyph('lock-keyhole', Lucide.LockKeyhole);
export const LogOut = /* @__PURE__ */ glyph('log-out', Lucide.LogOut);
const MapPin = /* @__PURE__ */ glyph('map-pin', Lucide.MapPin);
export const Maximize2 = /* @__PURE__ */ glyph('maximize-2', Lucide.Maximize2);
export const Megaphone = /* @__PURE__ */ glyph('megaphone', Lucide.Megaphone);
export const Menu = /* @__PURE__ */ glyph('menu', Lucide.Menu);
export const MessageSquare = /* @__PURE__ */ glyph('message-square', Lucide.MessageSquare);
export const MessageSquareOff = /* @__PURE__ */ glyph(
  'message-square-off',
  Lucide.MessageSquareOff,
);
export const MessageSquarePlus = /* @__PURE__ */ glyph(
  'message-square-plus',
  Lucide.MessageSquarePlus,
);
export const MessageSquareQuote = /* @__PURE__ */ glyph(
  'message-square-quote',
  Lucide.MessageSquareQuote,
);
export const MessageSquareText = /* @__PURE__ */ glyph(
  'message-square-text',
  Lucide.MessageSquareText,
);
export const MessagesSquare = /* @__PURE__ */ glyph('messages-square', Lucide.MessagesSquare);
export const Minimize2 = /* @__PURE__ */ glyph('minimize-2', Lucide.Minimize2);
export const Minus = /* @__PURE__ */ glyph('minus', Lucide.Minus);
export const Moon = /* @__PURE__ */ glyph('moon', Lucide.Moon);
export const MoreHorizontal = /* @__PURE__ */ glyph('more-horizontal', Lucide.MoreHorizontal);
const OctagonAlert = /* @__PURE__ */ glyph('octagon-alert', Lucide.OctagonAlert);
const Package = /* @__PURE__ */ glyph('package', Lucide.Package);
export const PackageOpen = /* @__PURE__ */ glyph('package-open', Lucide.PackageOpen);
export const PanelLeftClose = /* @__PURE__ */ glyph('panel-left-close', Lucide.PanelLeftClose);
export const PanelLeftOpen = /* @__PURE__ */ glyph('panel-left-open', Lucide.PanelLeftOpen);
export const PanelRightOpen = /* @__PURE__ */ glyph('panel-right-open', Lucide.PanelRightOpen);
export const PanelsTopLeft = /* @__PURE__ */ glyph('panels-top-left', Lucide.PanelsTopLeft);
export const Pause = /* @__PURE__ */ glyph('pause', Lucide.Pause);
export const PenLine = /* @__PURE__ */ glyph('pen-line', Lucide.PenLine);
export const Pencil = /* @__PURE__ */ glyph('pencil', Lucide.Pencil);
export const Play = /* @__PURE__ */ glyph('play', Lucide.Play);
export const Plug = /* @__PURE__ */ glyph('plug', Lucide.Plug);
export const PlugZap = /* @__PURE__ */ glyph('plug-zap', Lucide.PlugZap);
export const Plus = /* @__PURE__ */ glyph('plus', Lucide.Plus);
export const Power = /* @__PURE__ */ glyph('power', Lucide.Power);
export const Quote = /* @__PURE__ */ glyph('quote', Lucide.Quote);
const Radar = /* @__PURE__ */ glyph('radar', Lucide.Radar);
export const Receipt = /* @__PURE__ */ glyph('receipt', Lucide.Receipt);
export const RefreshCw = /* @__PURE__ */ glyph('refresh-cw', Lucide.RefreshCw);
export const Rocket = /* @__PURE__ */ glyph('rocket', Lucide.Rocket);
export const RotateCcw = /* @__PURE__ */ glyph('rotate-ccw', Lucide.RotateCcw);
export const Save = /* @__PURE__ */ glyph('save', Lucide.Save);
export const Search = /* @__PURE__ */ glyph('search', Lucide.Search);
export const SearchX = /* @__PURE__ */ glyph('search-x', Lucide.SearchX);
export const Settings = /* @__PURE__ */ glyph('settings', Lucide.Settings);
export const Settings2 = /* @__PURE__ */ glyph('settings-2', Lucide.Settings2);
export const ShieldCheck = /* @__PURE__ */ glyph('shield-check', Lucide.ShieldCheck);
export const ShoppingBag = /* @__PURE__ */ glyph('shopping-bag', Lucide.ShoppingBag);
export const Sparkles = /* @__PURE__ */ glyph('sparkles', Lucide.Sparkles);
export const Split = /* @__PURE__ */ glyph('split', Lucide.Split);
export const Square = /* @__PURE__ */ glyph('square', Lucide.Square);
const SquarePen = /* @__PURE__ */ glyph('square-pen', Lucide.SquarePen);
export const Stethoscope = /* @__PURE__ */ glyph('stethoscope', Lucide.Stethoscope);
export const Sun = /* @__PURE__ */ glyph('sun', Lucide.Sun);
const Swords = /* @__PURE__ */ glyph('swords', Lucide.Swords);
export const Tag = /* @__PURE__ */ glyph('tag', Lucide.Tag);
export const Tags = /* @__PURE__ */ glyph('tags', Lucide.Tags);
export const Target = /* @__PURE__ */ glyph('target', Lucide.Target);
const Telescope = /* @__PURE__ */ glyph('telescope', Lucide.Telescope);
export const Trash2 = /* @__PURE__ */ glyph('trash-2', Lucide.Trash2);
export const TrendingUp = /* @__PURE__ */ glyph('trending-up', Lucide.TrendingUp);
export const TriangleAlert = /* @__PURE__ */ glyph('triangle-alert', Lucide.TriangleAlert);
export const Undo2 = /* @__PURE__ */ glyph('undo-2', Lucide.Undo2);
export const Unplug = /* @__PURE__ */ glyph('unplug', Lucide.Unplug);
export const Upload = /* @__PURE__ */ glyph('upload', Lucide.Upload);
export const UserPlus = /* @__PURE__ */ glyph('user-plus', Lucide.UserPlus);
export const UserRound = /* @__PURE__ */ glyph('user-round', Lucide.UserRound);
export const Users = /* @__PURE__ */ glyph('users', Lucide.Users);
export const Wrench = /* @__PURE__ */ glyph('wrench', Lucide.Wrench);
export const X = /* @__PURE__ */ glyph('x', Lucide.X);
export const XCircle = /* @__PURE__ */ glyph('x-circle', Lucide.XCircle);
export const Zap = /* @__PURE__ */ glyph('zap', Lucide.Zap);

/**
 * Canonical icon map — the single source of truth for which glyph represents
 * each product concept. Nav and shared UI import icons by concept
 * (`ICONS.warning`) instead of picking glyph names ad hoc.
 *
 * Conventions:
 * - spinner = `LoaderCircle` (only)
 * - warning = `TriangleAlert` (only)
 * - danger = `AlertCircle` (only)
 * - success = `Check` (only)
 *
 * Nav notes: issues uses `OctagonAlert`, NOT `CircleAlert` (an alias of
 * `AlertCircle` — the same glyph as danger). `Settings` is for the user menu
 * only; the Setup nav concept uses `Wrench`.
 *
 * lucide-react ships alias pairs with identical glyphs (legacy names exist
 * for the spinner and warning glyphs); this module canonicalizes one name
 * per pair so call sites stay consistent and grep-able.
 *
 * Visual contract (applies to every lucide glyph, not just the ones mapped
 * here — see the icon stroke ladder in `apps/app/src/globals.css` and docs/design.md):
 * - Size is the only thing a call site picks. `size-3`/`size-3.5` for dense
 *   tables, toolbars, and inline chips; `size-4` for chrome; `size-5` for
 *   empty states and marketing wells; larger only for decorative marks.
 * - Weight follows from that size. Do not pass `strokeWidth` — lucide scales
 *   it by the icon's size, so a per-call-site number makes weight drift, and
 *   the stylesheet overrides the prop anyway. A deliberate outlier uses
 *   inline `style={{ strokeWidth: n }}`.
 * - Colour stays `currentColor`, so `text-ink-2` and `text-accent-text` paint
 *   the glyph. Never hard-code a stroke colour.
 */
export const ICONS = {
  // The four layers (§4) — these are the sidebar's primary destinations.
  site: Globe,
  demand: Radar,
  agent: Bot,
  reports: FileBarChart,
  overview: LayoutDashboard,
  // Nav concepts.
  visibility: Gauge,
  insights: ChartLine,
  perception: MessageSquareQuote,
  factChecking: BadgeCheck,
  queryFanouts: Search,
  promptBuilder: Sparkles,
  competitors: Swords,
  searchIntelligence: Telescope,
  aiTraffic: Activity,
  performance: TrendingUp,
  prompts: MessageSquareText,
  products: Package,
  runs: ListChecks,
  content: FileText,
  siteHealth: ShieldCheck,
  issues: OctagonAlert,
  opportunities: Lightbulb,
  // Agent workspace.
  newChat: SquarePen,
  skills: Sparkles,
  context: BookOpen,
  setup: Wrench,
  settings: Settings,
  billing: CreditCard,
  connect: Plug,
  // Shared UI concepts.
  market: MapPin,
  warning: TriangleAlert,
  danger: AlertCircle,
} as const;

/** A product concept with a canonical glyph. */
export type IconName = keyof typeof ICONS;
