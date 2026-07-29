export type BookingScopeLike = 'performer' | 'audience' | string | null | undefined

export type ActiveEventBooking = {
  id: string
  event_id: string
  status: string
  booking_scope?: BookingScopeLike
}

export function isAudienceBookingScope(scope: BookingScopeLike): boolean {
  return scope === 'audience'
}

export function userIntendsAudienceBooking(userRole: string | null | undefined): boolean {
  return userRole === 'audience'
}

/** Whether an existing booking matches what the user's current app role would create. */
export function bookingMatchesUserIntent(
  bookingScope: BookingScopeLike,
  userRole: string | null | undefined
): boolean {
  const intendsAudience = userIntendsAudienceBooking(userRole)
  return intendsAudience
    ? isAudienceBookingScope(bookingScope)
    : !isAudienceBookingScope(bookingScope)
}

export function findActiveBookingForEvent<T extends ActiveEventBooking>(
  bookings: T[],
  eventId: string
): T | undefined {
  return bookings.find(
    (booking) =>
      booking.event_id === eventId &&
      (booking.status === 'confirmed' || booking.status === 'waitlist')
  )
}

export function buildCrossScopeSwitchMessage(
  existingScope: BookingScopeLike,
  targetIsAudience: boolean
): string {
  const existingLabel = isAudienceBookingScope(existingScope) ? 'audience' : 'performer'
  const targetLabel = targetIsAudience ? 'audience' : 'performer'
  return (
    `You already have a ${existingLabel} registration for this event.\n\n` +
    `Switching to a ${targetLabel} registration will cancel your ${existingLabel} booking first. ` +
    `Credits will be refunded if the cancellation policy allows.\n\n` +
    `Do you want to continue?`
  )
}

export async function cancelBookingById(
  accessToken: string,
  bookingId: string
): Promise<{
  refundedCredits: number
  restoredFreePass: boolean
  voucherRefunded?: boolean
}> {
  const response = await fetch('/api/bookings/cancel', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ bookingId }),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(result.error || 'Failed to cancel booking')
  }
  return {
    refundedCredits: Number(result.refundedCredits || 0),
    restoredFreePass: !!result.restoredFreePass,
    voucherRefunded: result.voucherRefunded,
  }
}

export type ConfirmFn = (options: {
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  variant?: 'default' | 'destructive'
}) => Promise<boolean>

/** Returns false if the user declined; throws on cancel API failure. */
export async function confirmAndCancelCrossScopeBooking(params: {
  existingBooking: { id: string; booking_scope?: BookingScopeLike }
  userRole: string | null | undefined
  confirm: ConfirmFn
  accessToken: string
}): Promise<boolean> {
  const { existingBooking, userRole, confirm, accessToken } = params
  if (bookingMatchesUserIntent(existingBooking.booking_scope, userRole)) {
    return true
  }

  const targetIsAudience = userIntendsAudienceBooking(userRole)
  const shouldProceed = await confirm({
    title: 'Switch registration type?',
    message: buildCrossScopeSwitchMessage(existingBooking.booking_scope, targetIsAudience),
    confirmText: targetIsAudience ? 'Switch to audience' : 'Switch to performer',
    cancelText: 'Keep current booking',
    variant: 'destructive',
  })
  if (!shouldProceed) return false

  await cancelBookingById(accessToken, existingBooking.id)
  return true
}
