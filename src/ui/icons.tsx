import {
  Activity, AlarmClock, Archive, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BarChart3, Bell, BellOff, Bookmark, BookOpen, Boxes, Brain, Briefcase,
  Calculator, Calendar, CalendarDays, Check, CheckCircle2, CheckSquare, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Circle, Clapperboard, Clock,
  Cloud, CloudOff, Columns3, Command, Copy, CreditCard, Download, Droplets, Dumbbell, Eye, EyeOff, FileText, Filter, Flag, Flame, FolderKanban, FolderOpen,
  Gauge, GitBranch, Globe, GraduationCap, GripVertical, HardDrive, Heart, HeartPulse, History, Home, Inbox, Info, KeyRound, Landmark, Layers, LayoutDashboard,
  LayoutGrid, Lightbulb, Link2, List, ListChecks, Lock, LogOut, Mail, Map, MapPin, Maximize2, Menu, Minus, Monitor, Moon, MoreHorizontal, Music, Network,
  NotebookPen, Orbit, Package, Palette, PanelRight, Pause, PenLine, Pencil, PiggyBank, Pin, Plane, Play, Plus, Puzzle, RefreshCw, Repeat, RotateCcw, Save,
  Search, Settings, Share2, Shield, ShoppingCart, SlidersHorizontal, Smartphone, Smile, Sparkles, Square, Star, StickyNote, Store, Sun, Table2, Tag, Target,
  Timer, Trash2, TrendingUp, TriangleAlert, Trophy, Upload, User, Users, Wallet, Wand2, Wifi, WifiOff, Workflow, Wrench, X, Zap, type LucideIcon,
} from 'lucide-react';

/**
 * Curated icon set (Lucide, ISC licence). Icons are referenced by name from the registry and
 * collection definitions, so only the icons listed here are bundled.
 */
export const ICONS = {
  activity: Activity, alarm: AlarmClock, archive: Archive, arrowDown: ArrowDown, arrowLeft: ArrowLeft, arrowRight: ArrowRight, arrowUp: ArrowUp,
  chart: BarChart3, bell: Bell, bellOff: BellOff, bookmark: Bookmark, book: BookOpen, boxes: Boxes, brain: Brain, briefcase: Briefcase, calculator: Calculator,
  calendar: Calendar, calendarDays: CalendarDays, check: Check, checkCircle: CheckCircle2, tasks: CheckSquare, chevronDown: ChevronDown, chevronLeft: ChevronLeft,
  chevronRight: ChevronRight, chevronUp: ChevronUp, circle: Circle, film: Clapperboard, clock: Clock, cloud: Cloud, cloudOff: CloudOff, columns: Columns3,
  command: Command, copy: Copy, card: CreditCard, download: Download, droplets: Droplets, dumbbell: Dumbbell, eye: Eye, eyeOff: EyeOff, file: FileText,
  filter: Filter, flag: Flag, flame: Flame, projects: FolderKanban, folder: FolderOpen, gauge: Gauge, branch: GitBranch, globe: Globe, learning: GraduationCap,
  grip: GripVertical, drive: HardDrive, heart: Heart, health: HeartPulse, history: History, home: Home, inbox: Inbox, info: Info, key: KeyRound, bank: Landmark,
  layers: Layers, dashboard: LayoutDashboard, grid: LayoutGrid, idea: Lightbulb, link: Link2, list: List, checklist: ListChecks, lock: Lock, logout: LogOut,
  mail: Mail, map: Map, pin: MapPin, maximize: Maximize2, menu: Menu, minus: Minus, monitor: Monitor, moon: Moon, more: MoreHorizontal, music: Music,
  network: Network, notes: NotebookPen, orbit: Orbit, package: Package, palette: Palette, panelRight: PanelRight, pause: Pause, journal: PenLine, pencil: Pencil,
  piggy: PiggyBank, pinned: Pin, plane: Plane, play: Play, plus: Plus, puzzle: Puzzle, refresh: RefreshCw, repeat: Repeat, undo: RotateCcw, save: Save,
  search: Search, settings: Settings, share: Share2, shield: Shield, cart: ShoppingCart, sliders: SlidersHorizontal, phone: Smartphone, smile: Smile,
  sparkles: Sparkles, square: Square, star: Star, sticky: StickyNote, store: Store, sun: Sun, table: Table2, tag: Tag, target: Target, timer: Timer,
  trash: Trash2, trending: TrendingUp, warning: TriangleAlert, trophy: Trophy, upload: Upload, user: User, users: Users, wallet: Wallet, wand: Wand2,
  wifi: Wifi, wifiOff: WifiOff, workflow: Workflow, wrench: Wrench, x: X, zap: Zap,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 18, className, strokeWidth = 1.9 }: { name: IconName | string; size?: number; className?: string; strokeWidth?: number }) {
  const Cmp = (ICONS as Record<string, LucideIcon>)[name] ?? Circle;
  return <Cmp size={size} strokeWidth={strokeWidth} className={className} aria-hidden="true" />;
}
