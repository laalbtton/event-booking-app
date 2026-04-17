import { Inngest } from 'inngest'

/**
 * Shared Inngest client.
 *
 * Environment variables required:
 *   INNGEST_EVENT_KEY  – found in Inngest dashboard → App → Event Keys
 *   INNGEST_SIGNING_KEY – found in Inngest dashboard → App → Signing Key
 *     (used automatically by the serve() handler; you don't need to pass it here)
 */
export const inngest = new Inngest({
  id: 'one-mic-stand',
  eventKey: process.env.INNGEST_EVENT_KEY,
})

// ── Typed event map ──────────────────────────────────────────────────────────
// Add all events your app sends here so every function gets full type safety.

export type InngestEvents = {
  /** Fired whenever an event row is created or updated */
  'event/scheduled': {
    data: {
      eventId: string
      /** ISO string of end_time (or estimated end = start + 2h if null) */
      endTimeIso: string
      status: string
    }
  }
  /** Fired when an event is cancelled – cancels any in-flight scheduled jobs */
  'event/cancelled': {
    data: {
      eventId: string
    }
  }
}
