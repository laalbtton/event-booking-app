import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { eventId, quantity = 1 } = body as { eventId: string; quantity: number }

    if (!eventId) {
      return NextResponse.json({ error: 'eventId is required' }, { status: 400 })
    }

    const qty = Math.max(1, Math.min(10, Math.floor(Number(quantity))))
    if (!Number.isFinite(qty)) {
      return NextResponse.json({ error: 'Invalid quantity' }, { status: 400 })
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey)

    // Load event
    const { data: event, error: eventError } = await serviceClient
      .from('events')
      .select('id, title, date, status, event_type, tickets_enabled, venue_id, venues(name)')
      .eq('id', eventId)
      .maybeSingle()

    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }
    if (event.status === 'cancelled') {
      return NextResponse.json({ error: 'This event has been cancelled' }, { status: 400 })
    }
    if (event.event_type !== 'booked_show') {
      return NextResponse.json({ error: 'Ticket checkout is only for booked shows' }, { status: 400 })
    }
    if (!event.tickets_enabled) {
      return NextResponse.json({ error: 'Tickets are not enabled for this event' }, { status: 400 })
    }

    // Load ticket tier
    const { data: ticket, error: ticketError } = await serviceClient
      .from('event_tickets')
      .select('id, name, price_cents, quantity, sold')
      .eq('event_id', eventId)
      .maybeSingle()

    if (ticketError || !ticket) {
      return NextResponse.json({ error: 'Ticket information not found for this event' }, { status: 404 })
    }

    const available = (ticket.quantity as number) - (ticket.sold as number)
    if (available <= 0) {
      return NextResponse.json({ error: 'Tickets are sold out' }, { status: 400 })
    }
    if (qty > available) {
      return NextResponse.json({ error: `Only ${available} ticket${available !== 1 ? 's' : ''} remaining` }, { status: 400 })
    }

    const origin = request.headers.get('origin') || 'https://localhost:3000'
    const venueName = (event.venues as any)?.name as string | null

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'cad',
            product_data: {
              name: `${ticket.name} — ${event.title}`,
              description: [
                venueName ? `Venue: ${venueName}` : null,
                event.date ? `Date: ${new Date(event.date).toLocaleDateString('en-CA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}` : null,
              ].filter(Boolean).join(' · ') || undefined,
            },
            unit_amount: ticket.price_cents as number,
          },
          quantity: qty,
        },
      ],
      // Stripe collects email during guest checkout automatically
      customer_creation: 'always',
      success_url: `${origin}/events/${eventId}?ticket_checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/events/${eventId}?ticket_checkout=cancelled`,
      metadata: {
        ticketType: 'event_ticket',
        eventId,
        ticketId: ticket.id as string,
        quantity: qty.toString(),
        unitPriceCents: (ticket.price_cents as number).toString(),
      },
    })

    if (!session.url) {
      return NextResponse.json({ error: 'Unable to create checkout session' }, { status: 500 })
    }

    return NextResponse.json({ url: session.url })
  } catch (error: any) {
    console.error('Ticket checkout error:', error)
    return NextResponse.json({ error: error.message || 'Checkout error' }, { status: 500 })
  }
}
