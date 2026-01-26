import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Use implicit flow to avoid PKCE verifier storage issues in client-only OAuth.
    flowType: 'implicit',
    persistSession: true,
    autoRefreshToken: true,
  },
})

// Type definitions
// User roles
export type UserRole = 'performer' | 'event_creator' | 'admin'

// Full profile (for own profile)
export type Profile = {
  id: string
  email: string
  full_name: string | null
  credits: number
  role: UserRole
  instagram_link: string | null
  youtube_link: string | null
  twitter_link: string | null
  website_link: string | null
  bio: string | null
  created_at: string
  updated_at: string
}

// Public profile (for viewing others)
export type PublicProfile = {
  id: string
  full_name: string | null
  bio: string | null
  instagram_link: string | null
  youtube_link: string | null
  twitter_link: string | null
  website_link: string | null
  created_at: string
}

export type Event = {
  id: string
  title: string
  description: string | null
  theme: string | null
  date: string
  location: string | null
  credits_required: number
  max_attendees: number | null
  cancellation_hours: number
  registration_opens_at: string | null
  host_user_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type Booking = {
  id: string
  user_id: string
  event_id: string
  credits_used: number
  booked_at: string
  status: string
  waitlist_position: number | null
  attendance_status: string | null // 'attended', 'no_show', or null (confirmed)
}

export type CreditTransaction = {
  id: string
  user_id: string
  amount: number
  transaction_type: string
  reference_id: string | null
  notes: string | null
  created_by: string | null
  created_at: string
}