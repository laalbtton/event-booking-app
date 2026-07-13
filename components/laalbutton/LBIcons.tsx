import type { LucideIcon } from 'lucide-react'
import {
  Calendar,
  Coffee,
  Drama,
  Handshake,
  Languages,
  Laptop,
  MapPin,
  MessageCircle,
  Mic,
  MicVocal,
  Network,
  Sparkles,
  Ticket,
  Users,
  UtensilsCrossed,
} from 'lucide-react'

/**
 * Laal Button marketing icons — powered by Lucide (lucide-react).
 * Same library used across the rest of the app (dashboard, settings, admin, etc.).
 * @see https://lucide.dev/icons
 */

export type LBIconName =
  | 'mic'
  | 'tech'
  | 'roti'
  | 'satrang'
  | 'calendar'
  | 'location'
  | 'languages'
  | 'performer'
  | 'audience'
  | 'stage'
  | 'chat'
  | 'network'
  | 'chai'
  | 'ticket'
  | 'food'
  | 'community'

const ICON_MAP: Record<LBIconName, LucideIcon> = {
  mic: Mic,
  tech: Laptop,
  roti: UtensilsCrossed,
  satrang: Sparkles,
  calendar: Calendar,
  location: MapPin,
  languages: Languages,
  performer: MicVocal,
  audience: Users,
  stage: Drama,
  chat: MessageCircle,
  network: Network,
  chai: Coffee,
  ticket: Ticket,
  food: UtensilsCrossed,
  community: Handshake,
}

const SIZE_MAP = { sm: 18, md: 22, lg: 28, xl: 36 } as const

type LBIconProps = {
  name: LBIconName
  /** Icon colour — defaults to cream */
  accent?: string
  size?: keyof typeof SIZE_MAP
  className?: string
}

export function LBIcon({ name, accent = '#e8d9c4', size = 'md', className }: LBIconProps) {
  const Icon = ICON_MAP[name]
  const px = SIZE_MAP[size]
  return (
    <Icon
      width={px}
      height={px}
      className={className}
      color={accent}
      strokeWidth={1.75}
      aria-hidden
    />
  )
}

type LBIconBadgeProps = LBIconProps & {
  accentColor?: string
}

/** Icon inside a subtle framed badge — matches laalbutton dark theme */
export function LBIconBadge({ name, accentColor = '#c41e3a', size = 'md', className }: LBIconBadgeProps) {
  const box =
    size === 'sm' ? 'h-10 w-10' : size === 'lg' ? 'h-14 w-14' : size === 'xl' ? 'h-20 w-20' : 'h-12 w-12'
  const iconSize = size === 'sm' ? 'sm' : size === 'lg' ? 'lg' : size === 'xl' ? 'xl' : 'md'

  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-xl border border-[#2a1a0e] bg-[#120c06] ${box} ${className ?? ''}`}
    >
      <LBIcon name={name} accent={accentColor} size={iconSize} />
    </div>
  )
}

type LBFeatureRowProps = {
  name: LBIconName
  label: string
  sub?: string
  accentColor?: string
}

export function LBFeatureRow({ name, label, sub, accentColor = '#c41e3a' }: LBFeatureRowProps) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-[#2a1a0e] bg-[#120c06] px-5 py-4">
      <LBIconBadge name={name} accentColor={accentColor} size="sm" />
      <div>
        <span className="text-[#c8a882] font-medium text-sm">{label}</span>
        {sub && <p className="text-[#4a3520] text-xs mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

export function LBImagePlaceholder({
  name,
  accentColor = '#c41e3a',
  label = 'Event photo coming soon',
}: {
  name: LBIconName
  accentColor?: string
  label?: string
}) {
  return (
    <div className="text-center space-y-4">
      <LBIconBadge name={name} accentColor={accentColor} size="xl" className="mx-auto opacity-70" />
      <p className="text-[#4a3520] text-[11px] font-semibold uppercase tracking-wide">{label}</p>
    </div>
  )
}
