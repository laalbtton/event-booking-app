import { NextRequest, NextResponse } from 'next/server'
import { requireAudienceImporter, requireSession } from '@/lib/server/adminAuth'
import { buildPostShowWelcomeHtml, buildWelcomeContext, sendPostShowWelcome } from '@/lib/server/postShowWelcome'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ batchId: string }> }

/** Admin: preview the welcome email HTML for a batch (no send). */
async function loadAuthorizedBatch(request: NextRequest, batchId: string) {
  const session = await requireSession(request)
  if (!session.ok) return session
  const { data: batch } = await session.supabase
    .from('audience_signup_imports')
    .select('id, event_id')
    .eq('id', batchId)
    .maybeSingle()
  if (!batch) {
    return { ok: false as const, response: NextResponse.json({ error: 'Batch not found' }, { status: 404 }) }
  }
  const auth = await requireAudienceImporter(request, (batch.event_id as string | null) ?? null)
  if (!auth.ok) return auth
  return { ok: true as const, supabase: auth.supabase, batch }
}

export async function GET(request: NextRequest, { params }: Params) {
  const { batchId } = await params
  const auth = await loadAuthorizedBatch(request, batchId)
  if (!auth.ok) return auth.response

  try {
    const batch = auth.batch

    const ctx = await buildWelcomeContext(auth.supabase, batch.event_id as string | null)
    // Preview with the merge tag swapped for a sample name so it reads naturally.
    const html = buildPostShowWelcomeHtml(ctx, { personalized: true })
      .replace('{{{FIRST_NAME|there}}}', 'Priya')
      .replace('{{{RESEND_UNSUBSCRIBE_URL}}}', '#')
    const subject = ctx.eventTitle ? `Thanks for coming to ${ctx.eventTitle} 🙌` : 'Thanks for coming out 🙌'
    return NextResponse.json({ subject, html, upcomingCount: ctx.upcoming.length, hasRecapPhoto: !!ctx.recapPhotoUrl })
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    )
  }
}

/** Admin: send the post-show welcome email to everyone in a batch. */
export async function POST(request: NextRequest, { params }: Params) {
  const { batchId } = await params
  const auth = await loadAuthorizedBatch(request, batchId)
  if (!auth.ok) return auth.response

  try {
    const result = await sendPostShowWelcome(auth.supabase, batchId)
    return NextResponse.json({ success: true, result })
  } catch (error: unknown) {
    console.error('[audience-import] send-welcome failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    )
  }
}
