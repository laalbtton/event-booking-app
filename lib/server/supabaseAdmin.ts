import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export function getAdminClient() {
  if (!supabaseUrl || !supabaseServiceKey) {
    return null
  }
  return createClient(supabaseUrl, supabaseServiceKey)
}

export async function getUserFromAuthHeader(authHeader: string | null) {
  const supabase = getAdminClient()
  if (!supabase) {
    throw new Error('Missing Supabase server environment variables')
  }

  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return { supabase, user: null, token: null }

  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) return { supabase, user: null, token }
  return { supabase, user: data.user, token }
}
