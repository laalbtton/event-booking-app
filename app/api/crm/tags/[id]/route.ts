import { NextResponse } from 'next/server'
import { tagMergeSchema, tagRenameSchema } from '@/lib/crm'
import { deleteTag, listTagsWithCounts, mergeTags, renameTag } from '@/lib/server/crm'
import { crmErrorResponse, requireCrmUser } from '@/lib/server/crmRoute'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/** PATCH /api/crm/tags/[id]  body: { name } → rename */
export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireCrmUser(request)
  if (!auth.ok) return auth.response
  try {
    const { id } = await ctx.params
    const { name } = tagRenameSchema.parse(await request.json())
    await renameTag(auth.db, auth.user.id, id, name)
    const tags = await listTagsWithCounts(auth.db, auth.user.id)
    return NextResponse.json({ success: true, tags })
  } catch (error) {
    return crmErrorResponse(error)
  }
}

/** POST /api/crm/tags/[id]  body: { targetTagId } → merge [id] into target */
export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireCrmUser(request)
  if (!auth.ok) return auth.response
  try {
    const { id } = await ctx.params
    const { targetTagId } = tagMergeSchema.parse(await request.json())
    const moved = await mergeTags(auth.db, auth.user.id, id, targetTagId)
    const tags = await listTagsWithCounts(auth.db, auth.user.id)
    return NextResponse.json({ success: true, moved, tags })
  } catch (error) {
    return crmErrorResponse(error)
  }
}

/** DELETE /api/crm/tags/[id] */
export async function DELETE(request: Request, ctx: Ctx) {
  const auth = await requireCrmUser(request)
  if (!auth.ok) return auth.response
  try {
    const { id } = await ctx.params
    await deleteTag(auth.db, auth.user.id, id)
    const tags = await listTagsWithCounts(auth.db, auth.user.id)
    return NextResponse.json({ success: true, tags })
  } catch (error) {
    return crmErrorResponse(error)
  }
}
