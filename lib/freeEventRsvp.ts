export type FreeRsvpIntent = 'going' | 'interested'

export function isBookedShow(event: { event_type?: string | null }): boolean {
  return event.event_type === 'booked_show'
}

/** Booked comedy show with no paid/external tickets — audience can RSVP free. */
export function isFreeBookedShowRsvp(
  event: {
    event_type?: string | null
    tickets_enabled?: boolean | null
    external_event?: boolean | null
  },
  ticket?: { price_cents?: number | null } | null,
): boolean {
  if (!isBookedShow(event) || event.external_event) return false
  if (!event.tickets_enabled) return true
  // Tickets toggle is on but no inventory exists yet — still allow free RSVP.
  return !ticket
}

/** Tickets exist but the listed price is $0. */
export function isFreeTicketTier(ticket: { price_cents?: number | null } | null | undefined): boolean {
  if (!ticket) return false
  return Number(ticket.price_cents || 0) <= 0
}

export function isFreeAudienceEvent(
  event: {
    event_type?: string | null
    tickets_enabled?: boolean | null
    external_event?: boolean | null
  },
  ticket?: { price_cents?: number | null } | null,
): boolean {
  if (isFreeBookedShowRsvp(event, ticket)) return true
  return isBookedShow(event) && !!event.tickets_enabled && !event.external_event && isFreeTicketTier(ticket)
}
