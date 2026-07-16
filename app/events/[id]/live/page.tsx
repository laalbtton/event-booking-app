'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

type LivePerformer = {
  userId: string
  fullName: string
  avatarUrl: string | null
  green: number
  red: number
  isLive: boolean
}

type RedButtonState = {
  id: string
  active: boolean
  code?: number | null
  responseCount: number
  correctCount: number
  winnerId?: string | null
  winnerName?: string | null
  winnerApproved?: boolean
} | null

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('')
}

export default function HostLiveModePage() {
  const params = useParams()
  const router = useRouter()
  const eventId = typeof params.id === 'string' ? params.id : ''

  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [performers, setPerformers] = useState<LivePerformer[]>([])
  const [livePerformerUserId, setLivePerformerUserId] = useState<string | null>(null)
  const [liveModeEnabled, setLiveModeEnabled] = useState(false)
  const [redButton, setRedButton] = useState<RedButtonState>(null)
  const [rbCode, setRbCode] = useState<number | null>(null)
  const [rbLoading, setRbLoading] = useState(false)
  const [rbApproving, setRbApproving] = useState(false)
  const [settingLive, setSettingLive] = useState<string | null>(null)

  const getToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token || null
  }, [])

  const refresh = useCallback(async () => {
    const token = await getToken()
    if (!token || !eventId) return
    const res = await fetch(`/api/events/${eventId}/live`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      if (res.status === 403 || res.status === 401) {
        toast.error(data.error || 'Not allowed')
        router.replace(`/events/${eventId}`)
      }
      return
    }
    if (!data.isHost) {
      router.replace(`/events/${eventId}/live/audience`)
      return
    }
    setTitle(data.title || '')
    setPerformers(data.performers || [])
    setLivePerformerUserId(data.livePerformerUserId ?? null)
    setLiveModeEnabled(data.liveModeEnabled === true)
    setRedButton(data.redButton ?? null)
    if (data.redButton?.active && typeof data.redButton.code === 'number') {
      setRbCode(data.redButton.code)
    } else if (!data.redButton?.active) {
      setRbCode(null)
    }
  }, [eventId, getToken, router])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      setLoading(true)
      await refresh()
      if (!cancelled) setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [refresh, router])

  useEffect(() => {
    if (!eventId) return
    const interval = setInterval(() => {
      void refresh()
    }, 4000)
    return () => clearInterval(interval)
  }, [eventId, refresh])

  async function handleRbActivate() {
    setRbLoading(true)
    try {
      const token = await getToken()
      if (!token) return
      const res = await fetch(`/api/events/${eventId}/red-button/activate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to activate')
        return
      }
      setRbCode(data.code)
      toast.success('Red Button activated')
      await refresh()
    } catch (e: any) {
      toast.error(e.message || 'Error')
    } finally {
      setRbLoading(false)
    }
  }

  async function handleRbDeactivate() {
    setRbLoading(true)
    try {
      const token = await getToken()
      if (!token) return
      const res = await fetch(`/api/events/${eventId}/red-button/deactivate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to stop')
        return
      }
      setRbCode(null)
      toast.success('Promo stopped')
      await refresh()
    } catch (e: any) {
      toast.error(e.message || 'Error')
    } finally {
      setRbLoading(false)
    }
  }

  async function handleRbApproveWinner() {
    if (!redButton?.id) return
    setRbApproving(true)
    try {
      const token = await getToken()
      if (!token) return
      const res = await fetch(`/api/events/${eventId}/red-button/approve-winner`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sessionId: redButton.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to approve')
        return
      }
      toast.success(`Free Chai coupon sent to ${redButton.winnerName}!`)
      await refresh()
    } catch (e: any) {
      toast.error(e.message || 'Error')
    } finally {
      setRbApproving(false)
    }
  }

  async function setLivePerformer(performerUserId: string | null) {
    setSettingLive(performerUserId ?? 'clear')
    try {
      const token = await getToken()
      if (!token) return
      const res = await fetch(`/api/events/${eventId}/live/performer`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ performerUserId }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to update')
        return
      }
      setLivePerformerUserId(performerUserId)
      await refresh()
    } catch (e: any) {
      toast.error(e.message || 'Error')
    } finally {
      setSettingLive(null)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <p className="text-muted-foreground text-sm">Loading live mode…</p>
      </div>
    )
  }

  const rbActive = !!redButton?.active
  const sortedPerformers = [...performers].sort((a, b) => {
    if (a.userId === livePerformerUserId) return -1
    if (b.userId === livePerformerUserId) return 1
    return a.fullName.localeCompare(b.fullName)
  })

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center gap-2">
          <Link
            href={`/events/${eventId}/attendance`}
            className="p-1 -ml-1 rounded hover:bg-muted shrink-0"
            aria-label="Back to manage attendees"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold truncate">Live Mode</h1>
            <p className="text-sm text-muted-foreground truncate">{title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Attendee access: {liveModeEnabled ? 'Enabled' : 'Off — turn on from Manage Attendees'}
            </p>
          </div>
        </div>

        <Card className="border-2 border-red-200 bg-red-50/50 dark:bg-red-950/20 dark:border-red-900">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-red-700 dark:text-red-400 text-base">
              <span className="inline-block h-3 w-3 rounded-full bg-red-600" />
              Red Button Promo
            </CardTitle>
            <CardDescription>
              Activate to challenge attendees. Correct answers earn 2 Ryan&apos;s Chai credits.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!rbActive && !redButton?.winnerId && (
              <div className="text-center space-y-3">
                <Button
                  onClick={handleRbActivate}
                  disabled={rbLoading}
                  className="bg-red-600 hover:bg-red-700 text-white font-bold px-6"
                >
                  {rbLoading ? 'Activating…' : 'Activate Red Button Promo'}
                </Button>
              </div>
            )}

            {rbActive && (
              <div className="space-y-4">
                <div className="text-center">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-1">
                    Secret number — show this on stage
                  </p>
                  <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-red-600 text-white text-5xl font-black shadow-lg">
                    {rbCode ?? redButton?.code ?? '—'}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-center">
                  <div className="rounded-lg bg-background border p-3">
                    <p className="text-2xl font-bold text-red-700">{redButton?.responseCount ?? 0}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Participants</p>
                  </div>
                  <div className="rounded-lg bg-background border p-3">
                    <p className="text-2xl font-bold text-green-600">{redButton?.correctCount ?? 0}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Correct answers</p>
                  </div>
                </div>
                <Button
                  onClick={handleRbDeactivate}
                  disabled={rbLoading}
                  variant="outline"
                  className="w-full border-red-400 text-red-700 hover:bg-red-50"
                >
                  {rbLoading ? 'Stopping…' : 'Stop Promo & Pick Lucky Draw Winner'}
                </Button>
              </div>
            )}

            {!rbActive && redButton?.winnerId && (
              <div className="space-y-3">
                <div className="rounded-lg bg-background border border-yellow-300 p-4 text-center">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-1">
                    Lucky Draw Winner
                  </p>
                  <p className="text-xl font-bold">{redButton.winnerName ?? redButton.winnerId}</p>
                </div>
                {redButton.winnerApproved ? (
                  <div className="rounded-lg bg-green-50 border border-green-300 px-4 py-3 text-center text-sm text-green-800 font-semibold">
                    Free Chai coupon sent to {redButton.winnerName}!
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      onClick={handleRbApproveWinner}
                      disabled={rbApproving}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold"
                    >
                      {rbApproving ? 'Sending coupon…' : 'Approve Free Chai Coupon'}
                    </Button>
                    <Button variant="outline" onClick={() => refresh()} className="text-muted-foreground">
                      Refresh
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Performers</CardTitle>
            <CardDescription>
              Vote counts from the audience. Mark one performer as live to pin them at the top for attendees.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {sortedPerformers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No confirmed performers yet.</p>
            ) : (
              sortedPerformers.map((p) => {
                const isLive = livePerformerUserId === p.userId
                return (
                  <div
                    key={p.userId}
                    className={`flex items-center gap-3 rounded-xl border p-3 ${
                      isLive ? 'border-yellow-400 bg-yellow-50/60 dark:bg-yellow-950/20' : 'border-border'
                    }`}
                  >
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={p.avatarUrl || undefined} alt={p.fullName} />
                      <AvatarFallback>{initials(p.fullName)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold truncate">{p.fullName}</p>
                        {isLive && <Badge className="bg-yellow-400 text-zinc-900 hover:bg-yellow-400">LIVE</Badge>}
                      </div>
                      <div className="flex gap-3 text-xs mt-1">
                        <span className="text-green-600 font-semibold">Green {p.green}</span>
                        <span className="text-red-600 font-semibold">Red {p.red}</span>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={isLive ? 'default' : 'outline'}
                      disabled={settingLive !== null}
                      onClick={() => setLivePerformer(isLive ? null : p.userId)}
                    >
                      {settingLive === p.userId || (isLive && settingLive === 'clear')
                        ? '…'
                        : isLive
                          ? 'Clear live'
                          : 'Mark live'}
                    </Button>
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
