'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

type LivePerformer = {
  userId: string
  fullName: string
  avatarUrl: string | null
  green: number
  red: number
  isLive: boolean
}

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('')
}

export default function AudienceLiveModePage() {
  const params = useParams()
  const router = useRouter()
  const eventId = typeof params.id === 'string' ? params.id : ''

  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [performers, setPerformers] = useState<LivePerformer[]>([])
  const [livePerformerUserId, setLivePerformerUserId] = useState<string | null>(null)
  const [myVotes, setMyVotes] = useState<Record<string, 'green' | 'red'>>({})
  const [rbActive, setRbActive] = useState(false)
  const [rbSessionId, setRbSessionId] = useState<string | null>(null)
  const [rbMySubmitted, setRbMySubmitted] = useState(false)
  const [rbMyCorrect, setRbMyCorrect] = useState<boolean | null>(null)
  const [canUseRedButton, setCanUseRedButton] = useState(false)
  const [guess, setGuess] = useState('')
  const [submittingGuess, setSubmittingGuess] = useState(false)
  const [votingFor, setVotingFor] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

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
      toast.error(data.error || 'Unable to load live mode')
      if (res.status === 403 || res.status === 401) {
        router.replace(`/events/${eventId}`)
      }
      return
    }
    if (data.isHost) {
      router.replace(`/events/${eventId}/live`)
      return
    }
    setTitle(data.title || '')
    setPerformers(data.performers || [])
    setLivePerformerUserId(data.livePerformerUserId ?? null)
    setMyVotes(data.myVotes || {})
    setCanUseRedButton(data.canUseRedButton === true)
    const rb = data.redButton
    setRbActive(!!rb?.active)
    setRbSessionId(rb?.id ?? null)
    setRbMySubmitted(!!rb?.mySubmitted)
    setRbMyCorrect(typeof rb?.myCorrect === 'boolean' ? rb.myCorrect : null)
  }, [eventId, getToken, router])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      setCurrentUserId(user.id)
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

  const sortedPerformers = useMemo(() => {
    return [...performers].sort((a, b) => {
      if (a.userId === livePerformerUserId) return -1
      if (b.userId === livePerformerUserId) return 1
      return a.fullName.localeCompare(b.fullName)
    })
  }, [performers, livePerformerUserId])

  async function submitGuess(e: React.FormEvent) {
    e.preventDefault()
    if (!rbSessionId) return
    const num = parseInt(guess, 10)
    if (isNaN(num) || num < 11 || num > 99) {
      toast.error('Enter a number between 11 and 99')
      return
    }
    setSubmittingGuess(true)
    try {
      const token = await getToken()
      if (!token) return
      const res = await fetch(`/api/events/${eventId}/red-button/submit`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sessionId: rbSessionId, guess: num }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to submit')
        return
      }
      if (data.alreadySubmitted) {
        toast.message(data.correct ? 'You already got it right' : 'You already submitted')
      } else if (data.correct) {
        toast.success('Correct! 2 Ryan\'s Chai credits added')
      } else {
        toast.error('Not quite — try again next round')
      }
      await refresh()
    } catch (err: any) {
      toast.error(err.message || 'Error')
    } finally {
      setSubmittingGuess(false)
    }
  }

  async function castVote(performerUserId: string, vote: 'green' | 'red') {
    setVotingFor(performerUserId)
    try {
      const token = await getToken()
      if (!token) return
      const res = await fetch(`/api/events/${eventId}/live/vote`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ performerUserId, vote }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to vote')
        return
      }
      setMyVotes((prev) => ({ ...prev, [performerUserId]: vote }))
      await refresh()
    } catch (err: any) {
      toast.error(err.message || 'Error')
    } finally {
      setVotingFor(null)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <p className="text-muted-foreground text-sm">Loading live mode…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center gap-2">
          <Link
            href={`/events/${eventId}`}
            className="p-1 -ml-1 rounded hover:bg-muted shrink-0"
            aria-label="Back to event"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold truncate">Live Mode</h1>
            <p className="text-sm text-muted-foreground truncate">{title}</p>
          </div>
        </div>

        <Card className="border-2 border-red-200 bg-red-50/40 dark:bg-red-950/20 dark:border-red-900">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-red-700 dark:text-red-400">Red Button</CardTitle>
            <CardDescription>
              {canUseRedButton
                ? 'When the host activates the promo, enter the number they announce on stage.'
                : 'Red Button credits are for audience attendees only.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!canUseRedButton ? (
              <p className="text-sm text-muted-foreground text-center py-2">
                You&apos;re registered as a performer for this event, so Red Button participation is unavailable.
              </p>
            ) : !rbActive ? (
              <p className="text-sm text-muted-foreground text-center py-2">
                Waiting for the host to activate the Red Button…
              </p>
            ) : rbMySubmitted ? (
              <div className="rounded-lg border bg-background px-4 py-3 text-center text-sm font-semibold">
                {rbMyCorrect
                  ? 'You got it — 2 Ryan\'s Chai credits earned!'
                  : 'You already submitted for this round.'}
              </div>
            ) : (
              <form onSubmit={submitGuess} className="space-y-3">
                <Input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={2}
                  placeholder="11–99"
                  value={guess}
                  onChange={(e) => setGuess(e.target.value.replace(/\D/g, '').slice(0, 2))}
                  className="text-center text-2xl font-bold tracking-widest h-14"
                />
                <Button
                  type="submit"
                  disabled={submittingGuess || guess.length < 2}
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-bold"
                >
                  {submittingGuess ? 'Checking…' : 'Submit number'}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Performers</CardTitle>
            <CardDescription>Tap green or red for each performer. The live act stays pinned at the top.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {sortedPerformers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No confirmed performers yet.</p>
            ) : (
              sortedPerformers.map((p) => {
                const myVote = myVotes[p.userId]
                const isSelf = currentUserId === p.userId
                const isLive = livePerformerUserId === p.userId
                return (
                  <div
                    key={p.userId}
                    className={`rounded-xl border p-3 space-y-3 ${
                      isLive ? 'border-yellow-400 bg-yellow-50/60 dark:bg-yellow-950/20' : 'border-border'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={p.avatarUrl || undefined} alt={p.fullName} />
                        <AvatarFallback>{initials(p.fullName)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold truncate">{p.fullName}</p>
                          {isLive && <Badge className="bg-yellow-400 text-zinc-900 hover:bg-yellow-400">LIVE</Badge>}
                        </div>
                      </div>
                    </div>
                    {isSelf ? (
                      <p className="text-xs text-muted-foreground">You can&apos;t vote for yourself.</p>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          type="button"
                          disabled={votingFor === p.userId}
                          variant={myVote === 'green' ? 'default' : 'outline'}
                          className={
                            myVote === 'green'
                              ? 'bg-green-600 hover:bg-green-700 text-white'
                              : 'border-green-500 text-green-700 hover:bg-green-50'
                          }
                          onClick={() => castVote(p.userId, 'green')}
                        >
                          Green
                        </Button>
                        <Button
                          type="button"
                          disabled={votingFor === p.userId}
                          variant={myVote === 'red' ? 'default' : 'outline'}
                          className={
                            myVote === 'red'
                              ? 'bg-red-600 hover:bg-red-700 text-white'
                              : 'border-red-500 text-red-700 hover:bg-red-50'
                          }
                          onClick={() => castVote(p.userId, 'red')}
                        >
                          Red
                        </Button>
                      </div>
                    )}
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
