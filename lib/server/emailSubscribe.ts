import { isValidEmail, normalizeEmail } from '@/lib/foundingMembers'
import { upsertContact } from '@/lib/server/resendAudience'
import { getAdminClient } from '@/lib/server/supabaseAdmin'

export async function subscribeEmailUpdates(input: {
  firstName?: string
  email?: string
}): Promise<{ ok: true; alreadySubscribed: boolean } | { ok: false; error: string; status: number }> {
  const supabase = getAdminClient()
  if (!supabase) {
    return { ok: false, error: 'Server configuration error', status: 500 }
  }

  const firstName = typeof input.firstName === 'string' ? input.firstName.trim().slice(0, 80) : ''
  const emailRaw = typeof input.email === 'string' ? input.email : ''

  if (!isValidEmail(emailRaw)) {
    return { ok: false, error: 'A valid email is required', status: 400 }
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
      return { ok: false, error: error.message, status: 500 }
    }
  } else {
    const { error } = await supabase.from('founding_members').insert({
      email,
      first_name: firstName || null,
      email_updates_opt_in: true,
    })

    if (error) {
      return { ok: false, error: error.message, status: 500 }
    }
  }

  await upsertContact(email, firstName || existing?.first_name || null)

  return {
    ok: true,
    alreadySubscribed: Boolean(existing?.email_updates_opt_in),
  }
}
