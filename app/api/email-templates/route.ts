/**
 * GET  /api/email-templates  → returns all templates (admin only)
 * PATCH /api/email-templates  → updates a template (admin only)
 *   Body: { key: string; subject?: string; intro?: string; footer?: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAllEmailTemplates, updateEmailTemplate } from '@/lib/server/emailTemplates'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

async function requireAdmin(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return null

  const supabase = getAdminClient()
  const { data } = await supabase.auth.getUser(token)
  if (!data.user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', data.user.id)
    .single()

  return (profile as { role?: string } | null)?.role === 'admin' ? data.user.id : null
}

export async function GET(request: NextRequest) {
  const userId = await requireAdmin(request)
  if (!userId) return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

  const templates = await getAllEmailTemplates()
  return NextResponse.json({ templates })
}

export async function PATCH(request: NextRequest) {
  const userId = await requireAdmin(request)
  if (!userId) return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

  const body = await request.json().catch(() => ({})) as {
    key?: string
    subject?: string
    intro?: string
    footer?: string
  }

  if (!body.key) return NextResponse.json({ error: 'key is required' }, { status: 400 })

  const { key, ...updates } = body
  await updateEmailTemplate(key, updates, userId)

  return NextResponse.json({ success: true })
}
