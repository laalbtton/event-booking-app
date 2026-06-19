'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

// ── Star picker ────────────────────────────────────────────────────────────
function StarPicker({
  value,
  onChange,
  disabled,
}: {
  value: number | null
  onChange: (n: number) => void
  disabled?: boolean
}) {
  const [hovered, setHovered] = useState<number | null>(null)
  const display = hovered ?? value ?? 0

  return (
    <div className="flex items-center gap-1" role="group" aria-label="Star rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          onMouseEnter={() => !disabled && setHovered(n)}
          onMouseLeave={() => setHovered(null)}
          onClick={() => !disabled && onChange(n)}
          className={[
            'h-10 w-10 rounded-lg text-lg transition-all border',
            n <= display
              ? 'bg-yellow-500/20 border-yellow-500 text-yellow-300'
              : 'bg-zinc-800/80 border-zinc-700 text-stone-600',
            disabled ? 'opacity-50 cursor-not-allowed' : 'hover:scale-110 cursor-pointer',
          ].join(' ')}
          aria-pressed={value != null && n <= value}
        >
          {n <= display ? '★' : '☆'}
        </button>
      ))}
      {value != null && (
        <span className="ml-2 text-sm text-stone-400">
          {['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'][value]}
        </span>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────
type RateeInfo = {
  id: string
  full_name: string | null
  avatar_url: string | null
}

type ExistingReview = {
  id: string
  rating: number
  comment: string | null
}

export default function WriteProfileReviewPage() {
  const router = useRouter()
  const params = useParams()
  const rateeId = typeof params?.id === 'string' ? params.id : ''

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [ratee, setRatee] = useState<RateeInfo | null>(null)
  const [existing, setExisting] = useState<ExistingReview | null>(null)

  const [rating, setRating] = useState<number | null>(null)
  const [comment, setComment] = useState('')
  const [isAnonymous, setIsAnonymous] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // ── Bootstrap: load auth + ratee profile + any existing review ──────────
  useEffect(() => {
    if (!rateeId) return

    async function load() {
      setLoading(true)
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        // Redirect to login, come back after
        router.replace(`/login?next=/profile/${rateeId}/review`)
        return
      }

      if (user.id === rateeId) {
        setError("You can't review yourself.")
        setLoading(false)
        return
      }

      setCurrentUserId(user.id)

      const [rateeRes, existingRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, full_name, avatar_url')
          .eq('id', rateeId)
          .maybeSingle(),
        supabase
          .from('profile_reviews')
          .select('id, rating, comment')
          .eq('reviewer_id', user.id)
          .eq('ratee_id', rateeId)
          .maybeSingle(),
      ])

      if (!rateeRes.data) {
        setError('Person not found.')
        setLoading(false)
        return
      }

      setRatee(rateeRes.data)

      if (existingRes.data) {
        setExisting(existingRes.data)
        setRating(existingRes.data.rating)
        setComment(existingRes.data.comment ?? '')
      }

      setLoading(false)
    }

    load()
  }, [rateeId, router])

  // ── Get auth token for API call ─────────────────────────────────────────
  async function getToken(): Promise<string | null> {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    return session?.access_token ?? null
  }

  // ── Submit (create or update) ───────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!rating) {
      setError('Please choose a star rating.')
      return
    }

    if (!currentUserId) {
      setError('You must be logged in.')
      return
    }

    setSubmitting(true)
    const token = await getToken()

    try {
      if (existing) {
        // PATCH existing review (anonymous flag cannot be changed after submit)
        const res = await fetch(`/api/profile-reviews/${existing.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ rating, comment: comment.trim() || null }),
        })
        const json = await res.json()
        if (!res.ok) {
          setError(json.error || 'Could not update review.')
          return
        }
        setSuccess(true)
        setTimeout(() => router.push(`/profile/${rateeId}`), 1500)
      } else {
        // POST new review
        const res = await fetch('/api/profile-reviews', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            rateeId,
            rating,
            comment: comment.trim() || null,
            isAnonymous,
          }),
        })
        const json = await res.json()
        if (!res.ok) {
          setError(json.error || 'Could not submit review.')
          return
        }
        setSuccess(true)
        setTimeout(() => router.push(`/profile/${rateeId}`), 1500)
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Delete ───────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!existing) return
    if (
      !confirm(
        'Delete your review? If you earned 2 credits for this review, they will be deducted.',
      )
    )
      return

    setDeleting(true)
    setError(null)
    const token = await getToken()

    try {
      const res = await fetch(`/api/profile-reviews/${existing.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || 'Could not delete review.')
        return
      }
      router.push(`/profile/${rateeId}`)
    } catch {
      setError('Something went wrong.')
    } finally {
      setDeleting(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-yellow-400 border-t-transparent animate-spin" />
      </div>
    )
  }

  if (error && !rating && !ratee) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-4 px-4">
        <p className="text-red-400 text-center">{error}</p>
        <Link href="/dashboard" className="text-yellow-400 underline text-sm">
          Back to dashboard
        </Link>
      </div>
    )
  }

  const rateeInitials = (ratee?.full_name ?? '?')
    .split(/\s+/)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <div className="min-h-screen bg-zinc-950">
      <div className="mx-auto max-w-lg px-4 py-10 space-y-6">

        {/* ── Header ─────────────────────────────────────────── */}
        <Link
          href={`/profile/${rateeId}`}
          className="inline-flex items-center gap-2 text-sm text-stone-400 hover:text-stone-200 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to profile
        </Link>

        {/* ── Ratee card ──────────────────────────────────────── */}
        {ratee && (
          <div className="flex items-center gap-4">
            {ratee.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={ratee.avatar_url}
                alt={ratee.full_name ?? ''}
                className="h-14 w-14 rounded-full object-cover ring-2 ring-zinc-700"
              />
            ) : (
              <div className="h-14 w-14 rounded-full bg-zinc-800 ring-2 ring-zinc-700 flex items-center justify-center text-lg font-bold text-stone-400">
                {rateeInitials}
              </div>
            )}
            <div>
              <p className="text-stone-400 text-xs uppercase tracking-wider">
                {existing ? 'Edit your review for' : 'Write a review for'}
              </p>
              <p className="text-xl font-bold text-yellow-400">{ratee.full_name ?? 'this person'}</p>
            </div>
          </div>
        )}

        {/* ── Credit note (only for new reviews, not edits) ───── */}
        {!existing && (
          <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 px-4 py-3">
            <p className="text-sm text-yellow-300">
              As an audience member, you&apos;ll earn{' '}
              <span className="font-semibold">2 credits</span> when you submit your first review
              for this person.
            </p>
          </div>
        )}

        {/* ── Form ────────────────────────────────────────────── */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Star rating */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-stone-200">
              Your rating <span className="text-red-400">*</span>
            </label>
            <StarPicker
              value={rating}
              onChange={setRating}
              disabled={submitting || deleting}
            />
          </div>

          {/* Written review */}
          <div className="space-y-2">
            <label htmlFor="comment" className="block text-sm font-semibold text-stone-200">
              Written review{' '}
              <span className="text-stone-500 font-normal">(optional, max 2 000 characters)</span>
            </label>
            <textarea
              id="comment"
              value={comment}
              onChange={(e) => setComment(e.target.value.slice(0, 2000))}
              disabled={submitting || deleting}
              rows={5}
              placeholder="Share your experience…"
              className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-stone-100 placeholder-stone-600 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-yellow-500/50 focus:border-yellow-500/50 disabled:opacity-50"
            />
            <p className="text-xs text-stone-600 text-right">{comment.length} / 2 000</p>
          </div>

          {/* Anonymous feedback toggle (only on new reviews; cannot change after submit) */}
          {!existing && (
            <div className="space-y-2">
              <label className="flex items-start gap-3 cursor-pointer group">
                <div className="relative mt-0.5 shrink-0">
                  <input
                    type="checkbox"
                    checked={isAnonymous}
                    onChange={(e) => setIsAnonymous(e.target.checked)}
                    disabled={submitting}
                    className="sr-only"
                  />
                  <div
                    className={[
                      'h-5 w-5 rounded border-2 transition-colors flex items-center justify-center',
                      isAnonymous
                        ? 'bg-yellow-500 border-yellow-500'
                        : 'border-zinc-600 bg-zinc-800 group-hover:border-zinc-500',
                    ].join(' ')}
                  >
                    {isAnonymous && (
                      <svg className="h-3 w-3 text-zinc-900" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                </div>
                <span className="text-sm text-stone-300 leading-snug">
                  Submit as anonymous feedback
                </span>
              </label>

              {isAnonymous && (
                <div className="rounded-xl border border-zinc-700 bg-zinc-900/60 px-4 py-3 ml-8">
                  <p className="text-xs text-stone-400 leading-relaxed">
                    <span className="font-semibold text-stone-300">Anonymous feedback is private.</span>{' '}
                    Your name and avatar will not appear on their public profile. Only{' '}
                    <span className="font-semibold text-stone-300">{ratee?.full_name ?? 'this person'}</span>{' '}
                    can see this review — it will not be visible to other users or shown publicly.
                    They will still receive a notification that someone left feedback, but your identity
                    will not be disclosed.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Error banner */}
          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Success banner */}
          {success && (
            <div className="rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3">
              <p className="text-sm text-green-400">
                {existing ? 'Review updated!' : 'Review submitted!'} Redirecting…
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="submit"
              disabled={submitting || deleting || success || !rating}
              className="flex-1 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-900 font-bold py-3 px-6 rounded-xl transition-colors"
            >
              {submitting
                ? 'Saving…'
                : existing
                ? 'Update review'
                : 'Submit review'}
            </button>

            {existing && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={submitting || deleting || success}
                className="sm:w-auto w-full border border-red-500/40 bg-red-500/10 hover:bg-red-500/20 text-red-400 font-semibold py-3 px-5 rounded-xl transition-colors disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Delete review'}
              </button>
            )}
          </div>

          {/* Deletion caveat */}
          {existing && (
            <p className="text-xs text-stone-600 text-center">
              Deleting your review will also deduct the 2 credits you earned for it.
            </p>
          )}
        </form>

      </div>
    </div>
  )
}
