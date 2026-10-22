import { NextResponse } from 'next/server'
import { bulkActionSchema, contactFiltersSchema } from '@/lib/crm'
import {
  bulkAddTag,
  bulkRemoveTag,
  bulkSetStatus,
  deleteContacts,
  listMatchingIds,
} from '@/lib/server/crm'
import { crmErrorResponse, requireCrmUser } from '@/lib/server/crmRoute'

export const dynamic = 'force-dynamic'

/**
 * POST /api/crm/contacts/bulk
 * Body: ({ ids: [...] } | { filters: {...} }) & ({ action: 'add_tag', tag } |
 *       { action: 'remove_tag', tagId } | { action: 'set_status', status } |
 *       { action: 'delete' })
 */
export async function POST(request: Request) {
  const auth = await requireCrmUser(request)
  if (!auth.ok) return auth.response
  try {
    const body = bulkActionSchema.parse(await request.json())
    const ownerId = auth.user.id

    const ids =
      'ids' in body
        ? body.ids
        : await listMatchingIds(
            auth.db,
            ownerId,
            contactFiltersSchema.parse({ ...body.filters, page: 1, pageSize: 1 }),
          )

    let affected = 0
    switch (body.action) {
      case 'add_tag':
        affected = await bulkAddTag(auth.db, ownerId, ids, body.tag)
        break
      case 'remove_tag':
        affected = await bulkRemoveTag(auth.db, ownerId, ids, body.tagId)
        break
      case 'set_status':
        affected = await bulkSetStatus(auth.db, ownerId, ids, body.status)
        break
      case 'delete':
        affected = await deleteContacts(auth.db, ownerId, ids)
        break
    }
    return NextResponse.json({ success: true, affected, targeted: ids.length })
  } catch (error) {
    return crmErrorResponse(error)
  }
}
