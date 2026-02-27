'use client'

import { supabase } from '@/lib/supabase'

export async function signOutAndCleanup() {
  await supabase.auth.signOut()
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem('pending_role_onboarding')
  }
}

