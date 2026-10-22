import { NextResponse } from 'next/server'
import { listTagsWithCounts } from '@/lib/server/crm'
import { crmErrorResponse, requireCrmUser } from '@/lib/server/crmRoute'

export const dynamic = 'force-dynamic'

/** GET /api/crm/tags — all tags for the user with usage counts. */
export async function GET(request: Request) {
  const auth = await requireCrmUser(request)
  if (!auth.ok) return auth.response
  try {
    const tags = await listTagsWithCounts(auth.db, auth.user.id)
    return NextResponse.json({ tags })
  } catch (error) {
    return crmErrorResponse(error)
  }
}
