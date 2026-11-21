import {
  Activity,
  AlertCircle,
  BadgeCheck,
  BookOpen,
  Bot,
  ChartLine,
  CreditCard,
  FileBarChart,
  FileText,
  Gauge,
  Globe,
  LayoutDashboard,
  Lightbulb,
  ListChecks,
  MapPin,
  MessageSquareQuote,
  MessageSquareText,
  OctagonAlert,
  Package,
  Plug,
  Radar,
  Search,
  SquarePen,
  Settings,
  ShieldCheck,
  Sparkles,
  Swords,
  Telescope,
  TrendingUp,
  TriangleAlert,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

/**
 * The only module that imports the icon library (lint enforces it). Glyphs are
 * re-exported by name, so swapping libraries means remapping this file.
 */
export {
  Activity,
  AlertCircle,
  AlertTriangle,
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Bot,
  Braces,
  Building2,
  Calendar,
  CalendarDays,
  CalendarPlus,
  CalendarX,
  ChartColumn,
  ChartNoAxesColumn,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronsUpDown,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleHelp,
  CircleStop,
  ClipboardList,
  Cloud,
  CodeXml,
  Columns3,
  Copy,
  CreditCard,
  Database,
  Download,
  Ellipsis,
  ExternalLink,
  Eye,
  EyeOff,
  FileSearch,
  FileText,
  Folder,
  FolderOpen,
  GitCompare,
  Globe,
  GripVertical,
  History,
  House,
  Inbox,
  Info,
  KeyRound,
  Layers,
  LayoutGrid,
  Link2,
  Link2Off,
  List,
  ListChecks,
  ListFilter,
  ListTodo,
  ListTree,
  Lock,
  LockKeyhole,
  LogOut,
  Maximize2,
  Megaphone,
  Menu,
  MessageSquare,
  MessageSquareOff,
  MessageSquarePlus,
  MessageSquareQuote,
  MessageSquareText,
  MessagesSquare,
  Minimize2,
  Minus,
  Moon,
  MoreHorizontal,
  PackageOpen,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightOpen,
  PanelsTopLeft,
  Pause,
  PenLine,
  Pencil,
  Play,
  Plug,
  PlugZap,
  Plus,
  Power,
  Quote,
  Receipt,
  RefreshCw,
  Rocket,
  RotateCcw,
  Save,
  Search,
  SearchX,
  Settings,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Split,
  Square,
  Stethoscope,
  Sun,
  Tag,
  Tags,
  Target,
  Trash2,
  TrendingUp,
  TriangleAlert,
  Undo2,
  Unplug,
  Upload,
  UserPlus,
  UserRound,
  Users,
  Wrench,
  X,
  XCircle,
  Zap,
} from 'lucide-react';

/** A glyph component: what `Icon`, buttons and nav items accept as `icon`. */
export type IconGlyph = LucideIcon;

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
