import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')

  if (code) {
    await supabase.auth.exchangeCodeForSession(code)
  }

  // Check if admin and redirect accordingly
  const { data: { user } } = await supabase.auth.getUser()
  
  if (user) {
    const { data: adminData } = await supabase
      .from('admin_users')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (adminData) {
      return NextResponse.redirect(new URL('/admin', requestUrl.origin))
    }
  }

  return NextResponse.redirect(new URL('/dashboard', requestUrl.origin))
}