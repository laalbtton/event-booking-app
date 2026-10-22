import { NextResponse } from 'next/server'
import { contactPatchSchema } from '@/lib/crm'
import { deleteContacts, getContact, updateContact } from '@/lib/server/crm'
import { crmErrorResponse, requireCrmUser } from '@/lib/server/crmRoute'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(request: Request, ctx: Ctx) {
  const auth = await requireCrmUser(request)
  if (!auth.ok) return auth.response
  try {
    const { id } = await ctx.params
    const contact = await getContact(auth.db, auth.user.id, id)
    if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    return NextResponse.json({ contact })
  } catch (error) {
    return crmErrorResponse(error)
  }
}

export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireCrmUser(request)
  if (!auth.ok) return auth.response
  try {
    const { id } = await ctx.params
    const patch = contactPatchSchema.parse(await request.json())
    const contact = await updateContact(auth.db, auth.user.id, id, patch)
    return NextResponse.json({ contact })
  } catch (error) {
    return crmErrorResponse(error)
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  const auth = await requireCrmUser(request)
  if (!auth.ok) return auth.response
  try {
    const { id } = await ctx.params
    const deleted = await deleteContacts(auth.db, auth.user.id, [id])
    if (!deleted) return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (error) {
    return crmErrorResponse(error)
  }
}
