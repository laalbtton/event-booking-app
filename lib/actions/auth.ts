'use server'

import { supabase } from '@/lib/supabase'

export async function signUp(email: string, password: string, fullName: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
      },
    },
  })

  if (error) {
    return { error: error.message }
  }

  return { data, error: null }
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    return { error: error.message }
  }

  return { data, error: null }
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  
  if (error) {
    return { error: error.message }
  }

  return { error: null }
}

export async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser()
  
  if (error) {
    return { user: null, error: error.message }
  }

  return { user, error: null }
}