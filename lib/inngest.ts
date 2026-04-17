import { Inngest } from 'inngest'

/**
 * Shared Inngest client (v4).
 *
 * Environment variables required (add to Vercel + .env.local):
 *   INNGEST_EVENT_KEY   – from Inngest dashboard → Event Keys
 *   INNGEST_SIGNING_KEY – from Inngest dashboard → Signing Keys (used by serve())
 */
export const inngest = new Inngest({
  id: 'one-mic-stand',
  eventKey: process.env.INNGEST_EVENT_KEY,
})
