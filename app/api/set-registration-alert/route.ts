import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/server/supabaseAdmin'

export async function POST(request: NextRequest) {
  try {
    const supabase = getAdminClient()
    if (!supabase) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      )
    }

    const authHeader = request.headers.get('authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { eventId } = await request.json()

    if (!eventId) {
      return NextResponse.json(
        { error: 'Event ID is required' },
        { status: 400 }
      )
    }

    // Verify event exists and has registration_opens_at
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('id, registration_opens_at')
      .eq('id', eventId)
      .single()

    if (eventError || !event) {
      return NextResponse.json(
        { error: 'Event not found' },
        { status: 404 }
      )
    }

    if (!event.registration_opens_at) {
      return NextResponse.json(
        { error: 'This event does not have scheduled registration' },
        { status: 400 }
      )
    }

    // Check if registration is already open
    const now = new Date()
    const registrationOpensAt = new Date(event.registration_opens_at)
    if (now >= registrationOpensAt) {
      return NextResponse.json(
        { error: 'Registration is already open' },
        { status: 400 }
      )
    }

    // Insert or update alert (using ON CONFLICT to handle duplicates)
    const { error: insertError } = await supabase
      .from('registration_alerts')
      .upsert({
        user_id: user.id,
        event_id: eventId,
        notified: false,
      }, {
        onConflict: 'user_id,event_id'
      })

    if (insertError) {
      console.error('Error setting registration alert:', insertError)
      return NextResponse.json(
        { error: 'Failed to set alert' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error in set-registration-alert:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
