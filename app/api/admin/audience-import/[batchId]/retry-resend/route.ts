import { NextRequest, NextResponse } from 'next/server'
import { requireAudienceImporter, requireSession } from '@/lib/server/adminAuth'
import { resyncBatchToResend } from '@/lib/server/audienceImport'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ batchId: string }> }

/** Re-push a batch to Resend. Safe to run more than once. */
export async function POST(request: NextRequest, { params }: Params) {
  const session = await requireSession(request)
  if (!session.ok) return session.response
  const { batchId } = await params

  const { data: batch } = await session.supabase
    .from('audience_signup_imports')
    .select('id, event_id')
    .eq('id', batchId)
    .maybeSingle()
  if (!batch) return NextResponse.json({ error: 'Batch not found' }, { status: 404 })

  const auth = await requireAudienceImporter(request, (batch.event_id as string | null) ?? null)
  if (!auth.ok) return auth.response

  try {
    const result = await resyncBatchToResend(auth.supabase, batchId)
    return NextResponse.json({ success: true, result })
  } catch (error: unknown) {
    console.error('[audience-import] retry-resend failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    )
  }
}
