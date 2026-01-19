import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  
  // Create a Supabase client with cookies for server-side
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  
  // Create client with cookie handling for server-side
  const cookieStore = await cookies()
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
    },
  })

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      console.error('Error exchanging code for session:', error)
      return NextResponse.redirect(new URL('/login?error=auth_failed', requestUrl.origin))
    }
  }

  // Get the authenticated user from the session
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  
  if (userError || !user) {
    console.error('Error getting user:', userError)
    return NextResponse.redirect(new URL('/login?error=no_user', requestUrl.origin))
  }
  
  // Check user role from profiles table
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profileError && profile) {
    // Redirect based on role - use requestUrl.origin to preserve localhost
    if (profile.role === 'admin') {
      return NextResponse.redirect(new URL('/admin', requestUrl.origin))
    } else {
      return NextResponse.redirect(new URL('/dashboard', requestUrl.origin))
    }
  } else {
    // Fallback: check admin_users table for backward compatibility
    const { data: adminData } = await supabase
      .from('admin_users')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (adminData) {
      return NextResponse.redirect(new URL('/admin', requestUrl.origin))
    }
  }

  // Default redirect to dashboard - use requestUrl.origin to preserve localhost
  return NextResponse.redirect(new URL('/dashboard', requestUrl.origin))
}