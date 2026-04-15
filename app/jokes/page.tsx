'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthBootstrap } from '@/components/providers/auth-bootstrap-provider'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { Heart, Bomb, Sword, Trash2, Send } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'

const MAX_CHARS = 280
const LOAD_LIMIT = 50

type ReactionType = 'like' | 'bomb' | 'kill'

const REACTIONS = [
  {
    type: 'like' as ReactionType,
    Icon: Heart,
    label: 'Like',
    tooltip: 'Like',
    activeClass:
      'border-rose-300 bg-rose-50 text-rose-600 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-400',
    iconClass: 'fill-rose-500 text-rose-500 dark:fill-rose-400 dark:text-rose-400',
  },
  {
    type: 'bomb' as ReactionType,
    Icon: Bomb,
    label: 'Alright',
    tooltip: 'Alright',
    activeClass:
      'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400',
    iconClass: 'text-amber-600 dark:text-amber-400',
  },
  {
    type: 'kill' as ReactionType,
    Icon: Sword,
    label: 'Killed',
    tooltip: 'Killed it',
    activeClass:
      'border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-400',
    iconClass: 'text-violet-600 dark:text-violet-400',
  },
] as const

type RawJoke = {
  id: string
  user_id: string
  content: string
  created_at: string
  joke_reactions: Array<{ id: string; user_id: string; reaction_type: string }>
}

type Joke = {
  id: string
  user_id: string
  content: string
  created_at: string
  author_name: string | null
  reactions: { like: number; bomb: number; kill: number }
  my_reaction: ReactionType | null
}

// ─── helpers ────────────────────────────────────────────────────────────────

function processRow(
  row: RawJoke,
  profileMap: Record<string, string | null>,
  currentUserId: string | undefined,
): Joke {
  const reactions = { like: 0, bomb: 0, kill: 0 }
  let my_reaction: ReactionType | null = null
  for (const r of row.joke_reactions ?? []) {
    if (r.reaction_type === 'like') reactions.like++
    else if (r.reaction_type === 'bomb') reactions.bomb++
    else if (r.reaction_type === 'kill') reactions.kill++
    if (currentUserId && r.user_id === currentUserId) {
      my_reaction = r.reaction_type as ReactionType
    }
  }
  return {
    id: row.id,
    user_id: row.user_id,
    content: row.content,
    created_at: row.created_at,
    author_name: profileMap[row.user_id] ?? null,
    reactions,
    my_reaction,
  }
}

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr)
  const diff = Math.max(0, Date.now() - date.getTime())
  const s = Math.floor(diff / 1000)
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  const d = Math.floor(h / 24)
  if (s < 60) return 'just now'
  if (m < 60) return `${m}m ago`
  if (h < 24) return `${h}h ago`
  if (d === 1) return 'yesterday'
  if (d < 30) return `${d}d ago`
  return date.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
}

const AVATAR_PALETTE = [
  'bg-red-500',
  'bg-orange-500',
  'bg-amber-500',
  'bg-emerald-500',
  'bg-teal-500',
  'bg-blue-500',
  'bg-violet-500',
  'bg-pink-500',
]
function avatarColor(userId: string): string {
  let h = 0
  for (let i = 0; i < userId.length; i++) h = ((h << 5) - h + userId.charCodeAt(i)) | 0
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length]
}

function initials(name: string | null | undefined): string {
  if (!name?.trim()) return '?'
  const parts = name.trim().split(/\s+/)
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase()
}

function fmtCount(n: number): string {
  if (n >= 10000) return `${Math.floor(n / 1000)}k`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

// ─── page ───────────────────────────────────────────────────────────────────

export default function JokesPage() {
  const { authResolved, user } = useAuthBootstrap()
  const [activeTab, setActiveTab] = useState<'browse' | 'mine'>('browse')
  const [draft, setDraft] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [browseJokes, setBrowseJokes] = useState<Joke[]>([])
  const [myJokes, setMyJokes] = useState<Joke[]>([])
  const [browseLoading, setBrowseLoading] = useState(true)
  const [myLoading, setMyLoading] = useState(false)
  const [browseError, setBrowseError] = useState<string | null>(null)
  const [myLoaded, setMyLoaded] = useState(false)

  const [reactingId, setReactingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const trimmed = draft.trim()
  const charsUsed = draft.length
  const charsLeft = MAX_CHARS - charsUsed
  const overLimit = charsUsed > MAX_CHARS
  const pct = Math.min(charsUsed / MAX_CHARS, 1)

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [draft])

  useEffect(() => {
    void loadBrowse()
  }, [])

  useEffect(() => {
    if (activeTab === 'mine' && !myLoaded && user) void loadMine()
  }, [activeTab, user, myLoaded])

  // ── data fetching ─────────────────────────────────────────────────────────

  async function fetchProfiles(userIds: string[]): Promise<Record<string, string | null>> {
    if (!userIds.length) return {}
    const { data } = await supabase.from('profiles').select('id, full_name').in('id', userIds)
    return Object.fromEntries((data ?? []).map((p) => [p.id, p.full_name ?? null]))
  }

  async function loadBrowse() {
    setBrowseLoading(true)
    setBrowseError(null)
    try {
      const { data, error } = await supabase
        .from('jokes')
        .select('id, user_id, content, created_at, joke_reactions(id, user_id, reaction_type)')
        .order('created_at', { ascending: false })
        .limit(LOAD_LIMIT)

      if (error) throw error

      const rows = (data ?? []) as RawJoke[]
      const uniqueIds = [...new Set(rows.map((r) => r.user_id))]
      const profileMap = await fetchProfiles(uniqueIds)
      setBrowseJokes(rows.map((r) => processRow(r, profileMap, user?.id)))
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? 'Failed to load jokes'
      setBrowseError(
        msg.toLowerCase().includes('does not exist') || msg.toLowerCase().includes('relation')
          ? 'not_setup'
          : msg,
      )
    } finally {
      setBrowseLoading(false)
    }
  }

  async function loadMine() {
    if (!user) return
    setMyLoading(true)
    try {
      const { data, error } = await supabase
        .from('jokes')
        .select('id, user_id, content, created_at, joke_reactions(id, user_id, reaction_type)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (error) throw error

      const rows = (data ?? []) as RawJoke[]
      const profileMap = { [user.id]: null } as Record<string, string | null>
      setMyJokes(rows.map((r) => processRow(r, profileMap, user.id)))
      setMyLoaded(true)
    } catch {
      toast.error('Failed to load your jokes')
    } finally {
      setMyLoading(false)
    }
  }

  // ── actions ───────────────────────────────────────────────────────────────

  async function handlePost() {
    if (!user || !trimmed || overLimit) return
    setSubmitting(true)
    try {
      const { data, error } = await supabase
        .from('jokes')
        .insert({ user_id: user.id, content: trimmed })
        .select('id, user_id, content, created_at, joke_reactions(id, user_id, reaction_type)')
        .single()

      if (error) throw error

      const profileMap: Record<string, string | null> = {}
      const newJoke = processRow(data as unknown as RawJoke, profileMap, user.id)
      setDraft('')
      setBrowseJokes((prev) => [newJoke, ...prev])
      if (myLoaded) setMyJokes((prev) => [newJoke, ...prev])
      toast.success('Joke posted!')
    } catch (err: unknown) {
      toast.error((err as { message?: string })?.message ?? 'Failed to post')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleReact(joke: Joke, type: ReactionType) {
    if (!user) {
      toast.error('Sign in to react')
      return
    }
    if (joke.user_id === user.id) return
    if (reactingId === joke.id) return

    setReactingId(joke.id)

    // Optimistic update
    const snapshot = { browse: browseJokes, mine: myJokes }
    function patch(list: Joke[]): Joke[] {
      return list.map((j) => {
        if (j.id !== joke.id) return j
        const r = { ...j.reactions }
        const prev = j.my_reaction
        if (prev) r[prev] = Math.max(0, r[prev] - 1)
        const toggle = prev === type
        if (!toggle) r[type] = r[type] + 1
        return { ...j, reactions: r, my_reaction: toggle ? null : type }
      })
    }
    setBrowseJokes(patch)
    if (myLoaded) setMyJokes(patch)

    try {
      if (joke.my_reaction === type) {
        const { error } = await supabase
          .from('joke_reactions')
          .delete()
          .eq('joke_id', joke.id)
          .eq('user_id', user.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('joke_reactions')
          .upsert(
            { joke_id: joke.id, user_id: user.id, reaction_type: type },
            { onConflict: 'joke_id,user_id' },
          )
        if (error) throw error
      }
    } catch (err: unknown) {
      setBrowseJokes(snapshot.browse)
      setMyJokes(snapshot.mine)
      toast.error((err as { message?: string })?.message ?? 'Failed to react')
    } finally {
      setReactingId(null)
    }
  }

  async function handleDelete(joke: Joke) {
    if (!user || joke.user_id !== user.id) return
    setDeletingId(joke.id)
    try {
      const { error } = await supabase
        .from('jokes')
        .delete()
        .eq('id', joke.id)
        .eq('user_id', user.id)
      if (error) throw error
      setBrowseJokes((p) => p.filter((j) => j.id !== joke.id))
      setMyJokes((p) => p.filter((j) => j.id !== joke.id))
      toast.success('Joke deleted')
    } catch (err: unknown) {
      toast.error((err as { message?: string })?.message ?? 'Failed to delete')
    } finally {
      setDeletingId(null)
    }
  }

  // ── derived ───────────────────────────────────────────────────────────────

  const ringPct = pct
  const circumference = 2 * Math.PI * 9
  const dashOffset = circumference * (1 - ringPct)
  const counterColor =
    overLimit
      ? 'text-destructive font-semibold'
      : charsLeft <= 20
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-muted-foreground'
  const ringStroke =
    overLimit ? 'stroke-destructive' : charsLeft <= 20 ? 'stroke-amber-500' : 'stroke-primary'

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background pb-28">
      <div className="mx-auto max-w-xl px-4 py-6 sm:px-6 sm:py-8">
        {/* Page header */}
        <div className="mb-5 flex items-center gap-2.5">
          <span className="text-2xl leading-none" aria-hidden>
            🎤
          </span>
          <h1 className="text-2xl font-bold tracking-tight">Jokes</h1>
        </div>

        {/* ── Write area ─────────────────────────────────────────────────── */}
        {!authResolved ? (
          <div className="mb-5 h-[120px] animate-pulse rounded-2xl bg-muted" />
        ) : !user ? (
          <div className="mb-5 rounded-2xl border border-dashed border-muted-foreground/30 px-5 py-8 text-center">
            <p className="mb-3 text-sm text-muted-foreground">Sign in to post and react.</p>
            <Button asChild size="sm" variant="outline">
              <Link href="/login">Sign in</Link>
            </Button>
          </div>
        ) : (
          <div className="mb-5 rounded-2xl border border-border bg-card shadow-sm">
            <div className="p-4 pb-2 sm:p-5 sm:pb-3">
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Write a one-liner… make it land 🎯"
                rows={2}
                disabled={submitting}
                className={cn(
                  'w-full resize-none bg-transparent text-sm leading-relaxed placeholder:text-muted-foreground/50 focus:outline-none',
                  'disabled:opacity-60',
                  overLimit ? 'text-destructive' : 'text-foreground',
                )}
                style={{ minHeight: '3.5rem', overflow: 'hidden' }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && trimmed && !overLimit) {
                    void handlePost()
                  }
                }}
              />
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-border/60 px-4 py-2.5 sm:px-5">
              <div className="flex items-center gap-2">
                {/* Twitter-style ring counter */}
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 22 22"
                  className="-rotate-90 shrink-0"
                  aria-hidden
                >
                  <circle
                    cx="11"
                    cy="11"
                    r="9"
                    strokeWidth="2.5"
                    fill="none"
                    className="stroke-muted"
                  />
                  <circle
                    cx="11"
                    cy="11"
                    r="9"
                    strokeWidth="2.5"
                    fill="none"
                    strokeDasharray={circumference}
                    strokeDashoffset={dashOffset}
                    strokeLinecap="round"
                    className={cn('transition-all duration-150', ringStroke)}
                  />
                </svg>
                <span className={cn('text-xs tabular-nums', counterColor)}>
                  {overLimit ? `-${-charsLeft}` : charsLeft}
                </span>
              </div>
              <Button
                size="sm"
                className="gap-1.5 rounded-full px-4"
                disabled={!trimmed || overLimit || submitting}
                onClick={() => void handlePost()}
              >
                <Send className="h-3.5 w-3.5" />
                {submitting ? 'Posting…' : 'Post'}
              </Button>
            </div>
          </div>
        )}

        {/* ── Tabs ──────────────────────────────────────────────────────── */}
        <div className="mb-4 flex gap-1 rounded-xl border border-border bg-muted/40 p-1">
          {(['browse', 'mine'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setActiveTab(t)}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all',
                activeTab === t
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t === 'browse' ? 'Browse All' : 'My Jokes'}
              {t === 'mine' && myJokes.length > 0 && (
                <Badge
                  variant="secondary"
                  className="h-5 min-w-[1.25rem] px-1 text-[10px] tabular-nums"
                >
                  {myJokes.length}
                </Badge>
              )}
            </button>
          ))}
        </div>

        {/* ── Browse tab ────────────────────────────────────────────────── */}
        {activeTab === 'browse' && (
          <div className="space-y-3">
            {browseLoading &&
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-2xl border border-border p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-9 w-9 rounded-full" />
                    <div className="space-y-1.5">
                      <Skeleton className="h-3.5 w-28" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  </div>
                  <Skeleton className="h-5 w-full" />
                  <Skeleton className="h-5 w-2/3" />
                  <div className="flex gap-2 pt-1">
                    <Skeleton className="h-7 w-16 rounded-full" />
                    <Skeleton className="h-7 w-16 rounded-full" />
                    <Skeleton className="h-7 w-16 rounded-full" />
                  </div>
                </div>
              ))}

            {!browseLoading && browseError && (
              <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-5 py-8 text-center">
                {browseError === 'not_setup' ? (
                  <>
                    <p className="font-medium text-destructive">
                      Jokes feature isn&apos;t set up yet.
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      The database tables need to be created first.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-medium text-destructive">Failed to load jokes.</p>
                    <p className="mt-1 text-sm text-muted-foreground">{browseError}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-4"
                      onClick={() => void loadBrowse()}
                    >
                      Try again
                    </Button>
                  </>
                )}
              </div>
            )}

            {!browseLoading && !browseError && browseJokes.length === 0 && (
              <div className="rounded-2xl border border-dashed border-muted-foreground/30 py-16 text-center">
                <p className="mb-2 text-3xl">🎤</p>
                <p className="font-medium text-foreground">No jokes yet.</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Be the first to drop a one-liner!
                </p>
              </div>
            )}

            {!browseLoading &&
              !browseError &&
              browseJokes.map((joke) => (
                <JokeCard
                  key={joke.id}
                  joke={joke}
                  currentUserId={user?.id}
                  showAuthor
                  onReact={user ? (type) => void handleReact(joke, type) : undefined}
                  onDelete={() => void handleDelete(joke)}
                  isReacting={reactingId === joke.id}
                  isDeleting={deletingId === joke.id}
                />
              ))}
          </div>
        )}

        {/* ── My Jokes tab ──────────────────────────────────────────────── */}
        {activeTab === 'mine' && (
          <div className="space-y-3">
            {!user && (
              <div className="rounded-2xl border border-dashed border-muted-foreground/30 p-6 text-center text-muted-foreground">
                <p className="text-sm">Sign in to see your jokes.</p>
              </div>
            )}

            {user && myLoading &&
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-2xl border border-border p-4 space-y-3">
                  <Skeleton className="h-5 w-full" />
                  <Skeleton className="h-5 w-3/4" />
                  <div className="flex justify-between items-center pt-1">
                    <Skeleton className="h-3 w-20" />
                    <div className="flex gap-2">
                      <Skeleton className="h-7 w-14 rounded-full" />
                      <Skeleton className="h-7 w-14 rounded-full" />
                      <Skeleton className="h-7 w-14 rounded-full" />
                    </div>
                  </div>
                </div>
              ))}

            {user && !myLoading && myJokes.length === 0 && (
              <div className="rounded-2xl border border-dashed border-muted-foreground/30 py-16 text-center">
                <p className="mb-2 text-3xl">✍️</p>
                <p className="font-medium text-foreground">You haven&apos;t posted any jokes yet.</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Write your first one-liner above!
                </p>
              </div>
            )}

            {user &&
              !myLoading &&
              myJokes.map((joke) => (
                <JokeCard
                  key={joke.id}
                  joke={joke}
                  currentUserId={user.id}
                  showAuthor={false}
                  onReact={undefined}
                  onDelete={() => void handleDelete(joke)}
                  isReacting={false}
                  isDeleting={deletingId === joke.id}
                />
              ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── JokeCard ───────────────────────────────────────────────────────────────

function JokeCard({
  joke,
  currentUserId,
  showAuthor,
  onReact,
  onDelete,
  isReacting,
  isDeleting,
}: {
  joke: Joke
  currentUserId: string | undefined
  showAuthor: boolean
  onReact: ((type: ReactionType) => void) | undefined
  onDelete: () => void
  isReacting: boolean
  isDeleting: boolean
}) {
  const isOwn = currentUserId === joke.user_id
  const canReact = !!onReact && !!currentUserId && !isOwn

  return (
    <article className="group rounded-2xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md sm:p-5">
      {/* Header row */}
      <div className="mb-3 flex items-start justify-between gap-2">
        {showAuthor ? (
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white',
                avatarColor(joke.user_id),
              )}
              aria-hidden
            >
              {initials(joke.author_name)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight">
                {joke.author_name ?? 'Comedian'}
              </p>
              <p className="text-xs text-muted-foreground">{timeAgo(joke.created_at)}</p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{timeAgo(joke.created_at)}</p>
        )}

        {isOwn && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100"
            disabled={isDeleting}
            onClick={onDelete}
            aria-label="Delete joke"
          >
            {isDeleting ? (
              <span className="block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
          </Button>
        )}
      </div>

      {/* Joke text */}
      <p className="text-sm leading-relaxed text-foreground sm:text-[15px]">{joke.content}</p>

      {/* Reactions row */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border/50 pt-3">
        {REACTIONS.map(({ type, Icon, label, tooltip, activeClass, iconClass }) => {
          const count = joke.reactions[type]
          const isActive = joke.my_reaction === type
          const disabled = !canReact || isReacting

          return (
            <button
              key={type}
              type="button"
              title={tooltip}
              aria-label={`${label}${count ? ` · ${count}` : ''}`}
              aria-pressed={isActive}
              disabled={disabled && !isActive}
              onClick={() => canReact && onReact?.(type)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all select-none',
                isActive
                  ? activeClass
                  : 'border-border bg-background text-muted-foreground hover:border-muted-foreground/40 hover:bg-muted/60',
                canReact && !isReacting
                  ? 'cursor-pointer hover:scale-105 active:scale-95'
                  : 'cursor-default',
              )}
            >
              <Icon
                className={cn(
                  'h-3.5 w-3.5 transition-colors',
                  isActive ? iconClass : 'text-current',
                )}
              />
              {count > 0 && <span className="tabular-nums">{fmtCount(count)}</span>}
            </button>
          )
        })}

        {isOwn && (
          <span className="ml-auto text-xs italic text-muted-foreground/50">your joke</span>
        )}
      </div>
    </article>
  )
}
