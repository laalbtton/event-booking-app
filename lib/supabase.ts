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
export type UserRole = 'performer' | 'audience' | 'event_creator' | 'admin'

// Full profile (for own profile)
export type Profile = {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  credits: number
  credits_purchased?: number
  credits_complimentary?: number
  audience_free_passes_remaining?: number
  role: UserRole
  stripe_customer_id?: string | null
  stripe_customer_mode?: 'test' | 'live' | null
  instagram_link: string | null
  instagram_prompt_snoozed_until?: string | null
  instagram_no_account?: boolean
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
  avatar_url: string | null
  bio: string | null
  instagram_link: string | null
  youtube_link: string | null
  twitter_link: string | null
  website_link: string | null
  created_at: string
}

export type Event = {
  id: string
  slug?: string | null
  title: string
  description: string | null
  theme: string | null
  rating: string | null
  status?: string | null
  event_type: 'open_mic' | 'booked_show'
  open_mic_type?: 'comedy_open_mic' | 'variety_arts_open_mic' | null
  variety_use_max_attendees?: boolean
  is_multilingual?: boolean
  languages?: string[]
  tickets_enabled: boolean
  external_event: boolean
  external_ticket_url: string | null
  poster_url?: string | null
  poster_caption?: string | null
  poster_updated_at?: string | null
  date: string
  end_time: string | null
  venue_id?: string | null
  location: string | null
  credits_required: number
  food_coupon_enabled?: boolean
  spot_fee_credits?: number
  food_coupon_value_cents?: number
  food_coupon_expires_hours?: number
  no_show_penalty_enabled?: boolean | null
  no_show_penalty_credits?: number | null
  max_attendees: number | null
  cancellation_hours: number
  registration_opens_at: string | null
  audience_capacity?: number
  audience_deposit_credits?: number
  host_user_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  chat_enabled?: boolean
  chat_mode?: 'open' | 'host_only'
}

export type Booking = {
  id: string
  user_id: string
  event_id: string
  event_art_type_id?: string | null
  credits_used: number
  booked_at: string
  status: string
  booking_scope?: 'performer' | 'audience'
  waitlist_position: number | null
  attendance_status: string | null // 'attended', 'no_show', or null (confirmed)
  attendance_marked_at?: string | null
  audience_checkin_code?: string | null
  audience_deposit_returned_at?: string | null
  no_show_penalty_charged_at?: string | null
  no_show_penalty_credits?: number
  cancellation_date?: string | null
}

export type EventArtType = {
  id: string
  event_id: string
  art_type_name: string
  slot_capacity: number
  created_at: string
  updated_at: string
}

export type EventInvite = {
  id: string
  event_id: string
  invited_user_id: string
  invited_by: string
  status: 'pending' | 'accepted' | 'declined'
  created_at: string
}

export type EventInviteLink = {
  id: string
  event_id: string
  token: string
  max_uses: number
  uses: number
  expires_at: string
  created_by: string
  created_at: string
}

export type EventTicket = {
  id: string
  event_id: string
  name: string
  price_cents: number
  quantity: number
  sold: number
  created_at: string
}

export type CreditTransaction = {
  id: string
  user_id: string
  amount: number
  transaction_type: string
  credit_source?: 'purchase' | 'cash' | 'in_kind' | 'install_bonus' | null
  source_reason?: string | null
  reference_id: string | null
  notes: string | null
  created_by: string | null
  stripe_payment_id?: string | null
  created_at: string
}

export type AppInviteLink = {
  id: string
  token: string
  welcome_credits: number
  expires_at: string
  max_uses: number | null
  uses: number
  is_active: boolean
  created_by: string
  created_at: string
}

export type AppInviteCreditGrant = {
  id: string
  invite_link_id: string
  user_id: string
  credits_granted: number
  created_at: string
}

export type BookingVoucherStatus = 'issued' | 'redeemed' | 'cancelled' | 'expired'

export type BookingVoucher = {
  id: string
  booking_id: string
  event_id: string
  user_id: string
  venue_id: string | null
  code: string
  value_cents: number
  status: BookingVoucherStatus
  expires_at: string | null
  redeemed_at: string | null
  redeemed_by: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type VoucherRedemption = {
  id: string
  voucher_id: string
  event_id: string
  user_id: string
  redeemed_by: string | null
  discount_cents: number
  order_total_cents: number | null
  notes: string | null
  created_at: string
}

export type SocialProvider = 'instagram'

export type SocialAccount = {
  id: string
  user_id: string
  provider: SocialProvider
  external_account_id: string
  account_username: string | null
  access_token: string
  refresh_token: string | null
  expires_at: string | null
  metadata: Record<string, unknown>
  is_active: boolean
  created_at: string
  updated_at: string
}

export type PosterAutoPostPreference = {
  id: string
  user_id: string
  event_id: string | null
  auto_post_enabled: boolean
  created_at: string
  updated_at: string
}

export type SocialPostJobStatus = 'pending' | 'processing' | 'posted' | 'failed' | 'skipped'

export type SocialPostJob = {
  id: string
  user_id: string
  event_id: string
  provider: SocialProvider
  poster_url: string
  poster_caption: string | null
  status: SocialPostJobStatus
  idempotency_key: string
  attempt_count: number
  last_error: string | null
  scheduled_for: string
  processed_at: string | null
  created_at: string
  updated_at: string
}

export type SocialPostAttempt = {
  id: string
  job_id: string
  attempt_number: number
  status: 'posted' | 'failed' | 'skipped'
  provider_response: Record<string, unknown> | null
  error_message: string | null
  created_at: string
}

// ─── Community types ─────────────────────────────────────────────────────────

export type CommunityStatus = 'active' | 'archived'
export type CommunityMemberRole = 'member' | 'event_creator' | 'co_admin' | 'admin'
export type CommunityRequestStatus = 'pending' | 'approved' | 'rejected'
export type EventCommunityStatus = 'approved' | 'pending' | 'rejected' | 'expired'

export type Community = {
  id: string
  name: string
  slug: string | null
  description: string | null
  location: string | null
  language: string | null
  avatar_url: string | null
  banner_url: string | null
  is_public: boolean
  status: CommunityStatus
  cant_wait_count: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export type CommunityMember = {
  id: string
  community_id: string
  user_id: string
  role: CommunityMemberRole
  joined_at: string
}

export type CommunityCreationRequest = {
  id: string
  user_id: string
  name: string
  description: string | null
  location: string | null
  language: string | null
  message: string | null
  status: CommunityRequestStatus
  reviewed_by: string | null
  reviewed_at: string | null
  admin_notes: string | null
  created_at: string
}

export type CommunityEventCreatorRequest = {
  id: string
  community_id: string
  user_id: string
  message: string | null
  status: CommunityRequestStatus
  reviewed_by: string | null
  reviewed_at: string | null
  admin_notes: string | null
  created_at: string
}

export type EventCommunity = {
  id: string
  event_id: string
  community_id: string
  is_primary: boolean
  status: EventCommunityStatus
  submitted_by: string | null
  submitted_at: string
  reviewed_by: string | null
  reviewed_at: string | null
  expires_at: string | null
}