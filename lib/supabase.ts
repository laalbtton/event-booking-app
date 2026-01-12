import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Type definitions
export type Profile = {
  id: string
  email: string
  full_name: string | null
  credits: number
  created_at: string
  updated_at: string
}

export type Event = {
  id: string
  title: string
  description: string | null
  date: string
  location: string | null
  credits_required: number
  max_attendees: number | null
  cancellation_hours: number
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