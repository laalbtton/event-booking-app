import { NextResponse } from 'next/server'
import { z } from 'zod'
import { contactFiltersSchema, contactsToCsv, contactsToEmailList } from '@/lib/crm'
import { getContactsByIds, listMatchingIds } from '@/lib/server/crm'
import { crmErrorResponse, requireCrmUser } from '@/lib/server/crmRoute'

export const dynamic = 'force-dynamic'

const exportSchema = z.intersection(
  z.union([
    z.object({ ids: z.array(z.string().uuid()).min(1).max(5000) }),
    z.object({ filters: contactFiltersSchema.omit({ page: true, pageSize: true }) }),
  ]),
  z.object({ format: z.enum(['csv', 'emails']).default('csv') }),
)

/**
 * POST /api/crm/contacts/export
 * Returns { format, content, count, filename }. The client decides how to
 * deliver it (download / share sheet / clipboard) based on platform.
 */
export async function POST(request: Request) {
  const auth = await requireCrmUser(request)
  if (!auth.ok) return auth.response
  try {
    const body = exportSchema.parse(await request.json())
    const ownerId = auth.user.id
    const ids =
      'ids' in body
        ? body.ids
        : await listMatchingIds(
            auth.db,
            ownerId,
            contactFiltersSchema.parse({ ...body.filters, page: 1, pageSize: 1 }),
          )
    const contacts = await getContactsByIds(auth.db, ownerId, ids)
    const stamp = new Date().toISOString().slice(0, 10)

    if (body.format === 'emails') {
      const content = contactsToEmailList(contacts)
      return NextResponse.json({
        format: 'emails',
        content,
        count: content ? content.split(', ').length : 0,
        filename: `laal-button-emails-${stamp}.txt`,
      })
    }
    return NextResponse.json({
      format: 'csv',
      content: contactsToCsv(contacts),
      count: contacts.length,
      filename: `laal-button-contacts-${stamp}.csv`,
    })
  } catch (error) {
    return crmErrorResponse(error)
  }
}
