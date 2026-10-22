import { NextResponse } from 'next/server'
import { contactInputSchema } from '@/lib/crm'
import { createContact, findDuplicate, listCities, listContacts, listTagsWithCounts } from '@/lib/server/crm'
import { crmErrorResponse, parseFiltersFromUrl, requireCrmUser } from '@/lib/server/crmRoute'

export const dynamic = 'force-dynamic'

/**
 * GET /api/crm/contacts?q=&tags=a,b&tagMode=any|all&city=&status=&sort=&page=
 * Returns one page of contacts plus the tag + city facets so the page can
 * render in a single round-trip.
 */
export async function GET(request: Request) {
  const auth = await requireCrmUser(request)
  if (!auth.ok) return auth.response
  try {
    const url = new URL(request.url)

    // Lightweight duplicate probe used by the quick-add form.
    if (url.searchParams.get('dupCheck') === '1') {
      const dup = await findDuplicate(auth.db, auth.user.id, {
        email: url.searchParams.get('email'),
        phone: url.searchParams.get('phone'),
        instagram: url.searchParams.get('instagram'),
      })
      return NextResponse.json({ existing: dup })
    }

    const filters = parseFiltersFromUrl(url)
    const [page, tags, cities] = await Promise.all([
      listContacts(auth.db, auth.user.id, filters),
      listTagsWithCounts(auth.db, auth.user.id),
      listCities(auth.db, auth.user.id),
    ])
    return NextResponse.json({ ...page, tags, cities })
  } catch (error) {
    return crmErrorResponse(error)
  }
}

/** POST /api/crm/contacts — create one contact. 409 + `existing` on duplicate. */
export async function POST(request: Request) {
  const auth = await requireCrmUser(request)
  if (!auth.ok) return auth.response
  try {
    const body = await request.json()
    const input = contactInputSchema.parse(body)
    const contact = await createContact(auth.db, auth.user.id, input)
    return NextResponse.json({ contact }, { status: 201 })
  } catch (error) {
    return crmErrorResponse(error)
  }
}
