/**
 * Feature flags — set to true to re-enable a feature.
 *
 * INSTALL_PROMPT_ENABLED: controls the "Add to Home Screen" banner,
 * the install onboarding step, and the 5-credit install bonus.
 * Disabled while the native Android app is the primary distribution channel.
 *
 * GUEST_TICKET_CREDIT_PROMO_ENABLED: on public event details, shows the
 * "earn credits to cover this ticket" signup/promotions nudge for guests.
 * Disabled for now; set to true to bring the promo block back.
 */
export const INSTALL_PROMPT_ENABLED = false

export const GUEST_TICKET_CREDIT_PROMO_ENABLED = false
