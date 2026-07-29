import type { LucideIcon } from 'lucide-react'
import { Coffee, QrCode, Star } from 'lucide-react'
import { CREDIT_SURVEY_TOTAL, CREDIT_TOTAL_AVAILABLE } from '@/lib/foundingMembers'
import { CHAI_PROMO_DESCRIPTION, CHAI_PROMO_TITLE } from '@/lib/chaiPromo'

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

/** Audience install-app bonus (matches app/api/credits/install-bonus). */
export const INSTALL_BONUS_CREDITS = 5

/**
 * Max credits a new guest can realistically earn from active audience promotions
 * before buying a ticket (1 credit ≈ $1 CAD toward comedy events).
 */
export function getGuestAudiencePromoCreditPotential(): {
  totalCredits: number
  items: Array<{ id: string; label: string; credits: number; href: string }>
} {
  const items: Array<{ id: string; label: string; credits: number; href: string }> = [
    {
      id: 'install',
      label: 'Install the app',
      credits: INSTALL_BONUS_CREDITS,
      href: '/settings/install',
    },
  ]

  const insider = ACTIVE_PROMOTIONS.find((p) => p.id === 'brampton-comedy-insider' && p.active)
  if (insider) {
    items.push({
      id: insider.id,
      label: insider.title,
      credits: CREDIT_TOTAL_AVAILABLE,
      href: insider.href,
    })
  }

  return {
    totalCredits: items.reduce((sum, item) => sum + item.credits, 0),
    items,
  }
}

/** Copy for public ticket pages: earn credits via signup/promos vs ticket price. */
export function getGuestTicketPromoMessage(ticketPriceCents: number | null | undefined): {
  totalCredits: number
  ticketDollars: number | null
  headline: string
  detail: string
} {
  const { totalCredits } = getGuestAudiencePromoCreditPotential()
  const ticketDollars =
    ticketPriceCents != null && Number.isFinite(ticketPriceCents)
      ? Math.max(0, ticketPriceCents) / 100
      : null

  if (ticketDollars != null && ticketDollars > 0 && totalCredits >= ticketDollars) {
    return {
      totalCredits,
      ticketDollars,
      headline: `Register for the app to earn up to $${totalCredits} in credits — enough to cover this ticket`,
      detail: `New audience members can earn credits from promotions (including up to $${CREDIT_TOTAL_AVAILABLE} via Brampton Comedy Insider and $${INSTALL_BONUS_CREDITS} for installing the app). Use them toward comedy events when redeemable credits are offered.`,
    }
  }

  if (ticketDollars != null && ticketDollars > 0) {
    return {
      totalCredits,
      ticketDollars,
      headline: `Register for the app to earn up to $${totalCredits} in credits toward a discount on tickets`,
      detail: `This ticket is $${ticketDollars.toFixed(2)}. Promotions like Brampton Comedy Insider (up to $${CREDIT_TOTAL_AVAILABLE}) and the install bonus ($${INSTALL_BONUS_CREDITS}) can reduce what you pay on eligible shows.`,
    }
  }

  return {
    totalCredits,
    ticketDollars,
    headline: `Register for the app to earn up to $${totalCredits} in credits for comedy events`,
    detail: `Complete promotions such as Brampton Comedy Insider (up to $${CREDIT_SURVEY_TOTAL}–$${CREDIT_TOTAL_AVAILABLE}) and install the app for $${INSTALL_BONUS_CREDITS} more.`,
  }
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
    href: '/brampton-comedy-insider',
    title: 'Brampton Comedy Insider',
    description: `Fill out the survey and earn up to $${CREDIT_SURVEY_TOTAL} in credits`,
    icon: Star,
    audience: 'audience',
    active: true,
  },
  {
    id: 'ryans-chai-1-dollar',
    href: '/promotions/ryans-chai',
    title: CHAI_PROMO_TITLE,
    description: CHAI_PROMO_DESCRIPTION,
    icon: Coffee,
    audience: 'audience',
    active: true,
  },
]

export function canSeePromotion(
  promo: PromotionDef,
  role: string | null | undefined,
  options?: { guest?: boolean },
): boolean {
  if (!promo.active) return false
  // Public / logged-out visitors browse audience-facing promos (plus "all").
  if (options?.guest) {
    return promo.audience === 'all' || promo.audience === 'audience'
  }
  if (promo.audience === 'all') return true
  if (promo.audience === 'audience') return role === 'audience' || role === 'admin'
  if (promo.audience === 'performer') {
    return role === 'performer' || role === 'event_creator'
  }
  return false
}

export function getVisiblePromotions(
  role: string | null | undefined,
  options?: { guest?: boolean },
): PromotionDef[] {
  return ACTIVE_PROMOTIONS.filter((p) => canSeePromotion(p, role, options))
}
