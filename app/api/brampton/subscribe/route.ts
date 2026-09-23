import { NextRequest, NextResponse } from 'next/server'
import { isValidEmail, normalizeEmail } from '@/lib/foundingMembers'
import { upsertContact } from '@/lib/server/resendAudience'
import { getAdminClient } from '@/lib/server/supabaseAdmin'

/**
 * Light email signup for This Week in Brampton.
 * Does not award Insider credits — that stays on the membership form.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = getAdminClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const body = await request.json().catch(() => ({}))
    const firstName = typeof body?.firstName === 'string' ? body.firstName.trim().slice(0, 80) : ''
    const emailRaw = typeof body?.email === 'string' ? body.email : ''

    if (!isValidEmail(emailRaw)) {
      return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
    }

    const email = normalizeEmail(emailRaw)

    const { data: existing } = await supabase
      .from('founding_members')
      .select('id, first_name, email_updates_opt_in')
      .eq('email', email)
      .maybeSingle()

    if (existing) {
      const { error } = await supabase
        .from('founding_members')
        .update({
          email_updates_opt_in: true,
          first_name: existing.first_name || firstName || existing.first_name,
        })
        .eq('id', existing.id)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    } else {
      const { error } = await supabase.from('founding_members').insert({
        email,
        first_name: firstName || null,
        email_updates_opt_in: true,
      })

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    }

    await upsertContact(email, firstName || existing?.first_name || null)

    return NextResponse.json({
      ok: true,
      alreadySubscribed: Boolean(existing?.email_updates_opt_in),
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Could not subscribe'
    console.error('[brampton/subscribe]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
