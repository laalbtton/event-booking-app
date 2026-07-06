/**
 * Eventbrite Sync
 *
 * Fetches upcoming events from the Laal Button Eventbrite organization and
 * upserts them into the Supabase `events` table as external_event=true.
 *
 * Required env vars (add to Vercel + .env.local):
 *   EVENTBRITE_API_KEY  – Private token from Eventbrite → Account → Developer Keys
 *   EVENTBRITE_ORG_ID   – Your organization ID (see below to find it)
 *
 * To find your org ID, run:
 *   curl "https://www.eventbriteapi.com/v3/users/me/organizations/" \
 *     -H "Authorization: Bearer YOUR_TOKEN"
 */

import { createClient } from '@supabase/supabase-js'

const EVENTBRITE_API_BASE = 'https://www.eventbriteapi.com/v3'

type EBVenue = {
  name: string | null
  address: {
    localized_address_display?: string
    city?: string
    region?: string
    postal_code?: string
    country?: string
  } | null
}

type EBEvent = {
  id: string
  name: { text: string }
  description: { text: string | null }
  start: { utc: string }
  end: { utc: string }
  url: string
  logo?: { url: string } | null
  venue?: EBVenue | null
  is_free: boolean
  status: string
  // Ticket classes come from a separate endpoint; we skip deep pricing for now
}

type EBEventsResponse = {
  events: EBEvent[]
  pagination: {
    has_more_items: boolean
    continuation?: string
  }
}

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

async function fetchEventbriteOrgEvents(orgId: string, apiKey: string): Promise<EBEvent[]> {
  const all: EBEvent[] = []
  let continuation: string | undefined

  do {
    const params = new URLSearchParams({
      expand: 'venue',
      status: 'live',
      order_by: 'start_asc',
      time_filter: 'current_future',
      ...(continuation ? { continuation } : {}),
    })

    const res = await fetch(
      `${EVENTBRITE_API_BASE}/organizations/${orgId}/events/?${params}`,
      { headers: { Authorization: `Bearer ${apiKey}` } },
    )

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Eventbrite API error ${res.status}: ${body}`)
    }

    const data: EBEventsResponse = await res.json()
    all.push(...(data.events || []))
    continuation = data.pagination?.has_more_items ? data.pagination.continuation : undefined
  } while (continuation)

  return all
}

export type EventbriteSyncResult = {
  inserted: number
  updated: number
  skipped: number
  errors: string[]
}

export async function syncEventbriteEvents(): Promise<EventbriteSyncResult> {
  const apiKey = process.env.EVENTBRITE_API_KEY
  const orgId = process.env.EVENTBRITE_ORG_ID

  if (!apiKey || !orgId) {
    return {
      inserted: 0,
      updated: 0,
      skipped: 0,
      errors: ['EVENTBRITE_API_KEY or EVENTBRITE_ORG_ID env vars are not set'],
    }
  }

  const supabase = getAdminClient()
  const result: EventbriteSyncResult = { inserted: 0, updated: 0, skipped: 0, errors: [] }

  let ebEvents: EBEvent[]
  try {
    ebEvents = await fetchEventbriteOrgEvents(orgId, apiKey)
  } catch (err: unknown) {
    return { ...result, errors: [err instanceof Error ? err.message : String(err)] }
  }

  for (const eb of ebEvents) {
    try {
      const ebId = String(eb.id)
      const venue = eb.venue

      const locationParts = [
        venue?.name,
        venue?.address?.city,
        venue?.address?.region,
      ].filter(Boolean)
      const locationText = locationParts.join(', ') || null

      // Check if already exists by eventbrite_id
      const { data: existing } = await supabase
        .from('events')
        .select('id, title, date, external_ticket_url')
        .eq('eventbrite_id', ebId)
        .maybeSingle()

      const payload = {
        title: eb.name.text,
        description: eb.description?.text || null,
        date: eb.start.utc,
        end_time: eb.end.utc,
        external_event: true,
        external_ticket_url: eb.url,
        eventbrite_id: ebId,
        eventbrite_url: eb.url,
        poster_url: eb.logo?.url || null,
        location: locationText,
        status: 'active',
        tickets_enabled: !eb.is_free,
        credits_required: 0,
        // Required non-null columns — use placeholder values for Eventbrite events
        location_type: 'custom' as const,
        rating: 'All ages',
      }

      if (existing) {
        // Only update if key details changed
        const changed =
          existing.title !== eb.name.text ||
          existing.date !== eb.start.utc ||
          existing.external_ticket_url !== eb.url

        if (!changed) {
          result.skipped++
          continue
        }

        await supabase.from('events').update(payload).eq('id', existing.id)
        result.updated++
      } else {
        await supabase.from('events').insert(payload)
        result.inserted++
      }
    } catch (err: unknown) {
      result.errors.push(
        `Event ${eb.id} (${eb.name.text}): ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  return result
}
