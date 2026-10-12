'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { AudienceSignupImport } from '@/app/admin/audience-import/page'
import { supabase } from '@/lib/supabase'
import { userCanManageEventChatSettings } from '@/lib/eventChatPermissions'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Sign-up sheet import for one event. Same people who can open Manage
 * Attendees (host, creator, community admin/co-admin, platform admin).
 */
export default function EventAudienceSignupPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const eventParam = params?.id || ''
  const [resolvedId, setResolvedId] = useState<string | null>(null)
  const [denied, setDenied] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function check() {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData.user?.id
      if (!userId) {
        router.replace('/login')
        return
      }

      let eventId = eventParam
      if (!UUID_RE.test(eventParam)) {
        const { data: slugRow } = await supabase.from('events').select('id').eq('slug', eventParam).maybeSingle()
        if (slugRow?.id) eventId = slugRow.id
      }

      const { data: event } = await supabase
        .from('events')
        .select('host_user_id, created_by')
        .eq('id', eventId)
        .maybeSingle()

      const allowed =
        !!event &&
        (await userCanManageEventChatSettings(supabase, eventId, userId, {
          host_user_id: event.host_user_id,
          created_by: event.created_by,
        }))

      if (cancelled) return
      if (!allowed) {
        setDenied(true)
        return
      }
      setResolvedId(eventId)
    }
    void check()
    return () => {
      cancelled = true
    }
  }, [eventParam, router])

  if (denied) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <p className="text-gray-700">You don&apos;t have access to this event&apos;s sign-up sheet.</p>
      </div>
    )
  }

  if (!resolvedId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-2xl">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-white shadow">
        <div className="max-w-5xl mx-auto px-4 py-4 sm:px-6">
          <Link
            href={`/events/${resolvedId}/attendance`}
            className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-800"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to attendance
          </Link>
        </div>
      </div>
      <div className="max-w-5xl mx-auto px-4 py-6 sm:px-6">
        <AudienceSignupImport lockedEventId={resolvedId} />
      </div>
    </div>
  )
}
