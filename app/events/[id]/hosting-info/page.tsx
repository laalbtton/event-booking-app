'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { formatDateTime } from '@/lib/dateUtils'
import { userCanManageEventChatSettings } from '@/lib/eventChatPermissions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChevronLeft, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

type EventRow = {
  id: string
  title: string
  date: string
  host_user_id: string | null
  created_by: string | null
}

const CHECKLIST_KEYS = ['share_poster_5d', 'share_poster_24h', 'review_attendance'] as const
type ChecklistKey = (typeof CHECKLIST_KEYS)[number]

const CHECKLIST_META: Record<
  ChecklistKey,
  { label: string; description: string }
> = {
  share_poster_5d: {
    label: 'Share your event poster (about 5 days before)',
    description:
      'Post the poster on your social channels and relevant groups so people have time to plan. The app can nudge you around this time.',
  },
  share_poster_24h: {
    label: 'Share your event poster again (about 24 hours before)',
    description:
      'A same-day or day-before post catches people who decide last minute. You will get a reminder from the app in this window when possible.',
  },
  review_attendance: {
    label: 'Review performers, audience, and waitlist',
    description:
      'Open Manage Attendance to confirm the lineup order, waitlist, and any last-minute changes before doors open.',
  },
}

function storageKey(eventId: string) {
  return `hosting-info-checklist:v1:${eventId}`
}

function loadChecked(eventId: string): Set<ChecklistKey> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(storageKey(eventId))
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return new Set()
    const next = new Set<ChecklistKey>()
    for (const k of CHECKLIST_KEYS) {
      if ((parsed as Record<string, boolean>)[k]) next.add(k)
    }
    return next
  } catch {
    return new Set()
  }
}

function saveChecked(eventId: string, set: Set<ChecklistKey>) {
  const obj: Record<string, boolean> = {}
  for (const k of CHECKLIST_KEYS) {
    obj[k] = set.has(k)
  }
  localStorage.setItem(storageKey(eventId), JSON.stringify(obj))
}

export default function HostingInfoPage() {
  const params = useParams()
  const router = useRouter()
  const routeId = params.id as string

  const [resolvedId, setResolvedId] = useState(routeId)
  const [event, setEvent] = useState<EventRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [checked, setChecked] = useState<Set<ChecklistKey>>(new Set())

  const persist = useCallback(
    (next: Set<ChecklistKey>) => {
      setChecked(next)
      if (resolvedId) saveChecked(resolvedId, next)
    },
    [resolvedId]
  )

  useEffect(() => {
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      const role = profile?.role || null

      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(routeId)
      let id = routeId
      if (!isUuid) {
        const { data: slugRow } = await supabase.from('events').select('id').eq('slug', routeId).maybeSingle()
        if (slugRow?.id) id = slugRow.id
      }
      setResolvedId(id)

      const { data: eventData, error } = await supabase
        .from('events')
        .select('id, title, date, host_user_id, created_by')
        .eq('id', id)
        .single()

      if (error || !eventData) {
        setLoading(false)
        return
      }

      const isEventCreator = role === 'event_creator' && eventData.created_by === user.id
      const isAdmin = role === 'admin'
      const isHost = eventData.host_user_id === user.id
      const canAccessViaCommunity = await userCanManageEventChatSettings(supabase, id, user.id, {
        host_user_id: eventData.host_user_id,
        created_by: eventData.created_by,
      })

      if (!isEventCreator && !isAdmin && !isHost && !canAccessViaCommunity) {
        router.push('/dashboard')
        return
      }

      setEvent(eventData as EventRow)
      setChecked(loadChecked(id))
      setLoading(false)
    })()
  }, [routeId, router])

  function toggle(key: ChecklistKey) {
    const next = new Set(checked)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    persist(next)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    )
  }

  if (!event) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-lg">Event not found</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-white shadow">
        <div className="max-w-3xl mx-auto px-4 py-4 sm:px-6">
          <div className="flex items-center gap-2 min-w-0">
            <Link
              href={`/events/${resolvedId}/attendance`}
              className="text-blue-600 hover:text-blue-800 p-1 -ml-1 rounded hover:bg-gray-100 shrink-0"
              aria-label="Back to attendance"
            >
              <ChevronLeft className="w-5 h-5" />
            </Link>
            <div className="flex items-center gap-2 min-w-0">
              <Clock className="w-5 h-5 text-indigo-600 shrink-0" />
              <h1 className="text-2xl font-bold text-gray-900 truncate">Hosting info</h1>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 sm:px-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{event.title}</CardTitle>
            <CardDescription>{formatDateTime(event.date)}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-gray-700">
            <p>
              Use this page as a quick reference before your event. Following these steps helps performers and attendees
              have a smooth night and keeps your event visible online.
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Start on time (or communicate clearly if you are running late).</li>
              <li>Respect the venue, neighborhood, and your community&apos;s code of conduct.</li>
              <li>Keep messaging accurate—don&apos;t promise details you have not confirmed (times, prices, lineup).</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Before the event checklist</CardTitle>
            <CardDescription>Check items off as you complete them. Your progress is saved on this device.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {CHECKLIST_KEYS.map((key) => (
              <label
                key={key}
                className={cn(
                  'flex gap-3 rounded-lg border p-4 cursor-pointer transition-colors',
                  checked.has(key) ? 'border-green-200 bg-green-50/60' : 'border-gray-200 bg-white hover:bg-gray-50'
                )}
              >
                <input
                  type="checkbox"
                  checked={checked.has(key)}
                  onChange={() => toggle(key)}
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span>
                  <span className="font-medium text-gray-900 block">{CHECKLIST_META[key].label}</span>
                  <span className="text-sm text-muted-foreground mt-1 block">{CHECKLIST_META[key].description}</span>
                </span>
              </label>
            ))}
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-3">
          <Button asChild variant="default">
            <Link href={`/events/${resolvedId}/attendance`}>Manage attendance</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/events/${resolvedId}`}>Event page</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
