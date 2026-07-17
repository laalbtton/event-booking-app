import type { LucideIcon } from 'lucide-react'
import { QrCode, Star } from 'lucide-react'
import { CREDIT_TOTAL_AVAILABLE } from '@/lib/foundingMembers'

export type PromotionAudience = 'all' | 'audience' | 'performer'

export type PromotionDef = {
  id: string
  href: string
  title: string
  description: string
  icon: LucideIcon
  /** Who can see this promotion in the list */
  audience: PromotionAudience
  active: boolean
}

export const ACTIVE_PROMOTIONS: PromotionDef[] = [
  {
    id: 'invite-audience',
    href: '/promotions/invite',
    title: 'Invite friends',
    description: "Earn 2 Ryan's Chai credits when someone joins via your QR",
    icon: QrCode,
    audience: 'all',
    active: true,
  },
  {
    id: 'brampton-comedy-insider',
    href: '/promotions/brampton-comedy-insider',
    title: 'Brampton Comedy Insider',
    description: `Fill out the survey and earn up to $${CREDIT_TOTAL_AVAILABLE} in credits`,
    icon: Star,
    audience: 'audience',
    active: true,
  },
]

export function canSeePromotion(
  promo: PromotionDef,
  role: string | null | undefined,
): boolean {
  if (!promo.active) return false
  if (promo.audience === 'all') return true
  if (promo.audience === 'audience') return role === 'audience'
  if (promo.audience === 'performer') {
    return role === 'performer' || role === 'event_creator'
  }
  return false
}

export function getVisiblePromotions(role: string | null | undefined): PromotionDef[] {
  return ACTIVE_PROMOTIONS.filter((p) => canSeePromotion(p, role))
}
