import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getPublicPerformerProfile } from '@/lib/server/publicContent'
import { buildPerformerMetadata } from '@/lib/seo/metadata'
import { PublicProfileChrome } from '@/components/public/PublicProfileChrome'
import { getPublicServerClient } from '@/lib/server/supabasePublic'
import PerformanceTabs from '@/components/PerformanceTabs'
import FollowButton from '@/components/FollowButton'

type Props = {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const profile = await getPublicPerformerProfile(id)
  if (!profile) {
    return {
      title: 'Performer Not Found - One Mic Stand',
      robots: { index: false, follow: false },
    }
  }
  return buildPerformerMetadata(profile)
}

function SocialLink({ href, label, icon }: { href: string; label: string; icon: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800 text-stone-300 text-sm hover:border-yellow-400/60 hover:text-yellow-400 transition-colors"
    >
      {icon}
      {label}
    </a>
  )
}

type PublicJoke = {
  id: string
  content: string
  created_at: string
  likeCount: number
  bombCount: number
  killCount: number
  laughterCount: number
}

async function getPublicJokes(userId: string): Promise<PublicJoke[]> {
  const supabase = getPublicServerClient()
  const { data } = await supabase
    .from('jokes')
    .select('id, content, created_at, joke_reactions(reaction_type)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20)

  return ((data as any[]) || []).map((row) => {
    const reactions = (row.joke_reactions as { reaction_type: string }[]) || []
    return {
      id: row.id as string,
      content: row.content as string,
      created_at: row.created_at as string,
      likeCount: reactions.filter((r) => r.reaction_type === 'like').length,
      bombCount: reactions.filter((r) => r.reaction_type === 'bomb').length,
      killCount: reactions.filter((r) => r.reaction_type === 'kill').length,
      laughterCount: reactions.filter((r) => r.reaction_type === 'laughter').length,
    }
  })
}

export default async function PublicProfilePage({ params }: Props) {
  const { id } = await params
  const [profile, jokes] = await Promise.all([
    getPublicPerformerProfile(id),
    getPublicJokes(id).catch(() => [] as PublicJoke[]),
  ])
  if (!profile) notFound()

  // Canonical redirect: if the user has a username and the URL still uses their UUID,
  // send them to /profile/<username> for cleaner, shareable links.
  if (profile.username && id !== profile.username) {
    redirect(`/profile/${profile.username}`)
  }

  const initials = profile.fullName
    .split(/\s+/)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const hasLinks = profile.websiteLink || profile.instagramLink || profile.youtubeLink || profile.twitterLink

  const ra = profile.ratingAggregates
  const hasPublicRatings =
    (ra &&
      (ra.performance.count > 0 || ra.hosting.count > 0 || ra.event_creator.count > 0)) ||
    profile.recentReviewSnippets.length > 0

  const prSummary = profile.profileReviewSummary
  const hasProfileReviews = prSummary.count > 0 || profile.recentProfileReviews.length > 0

  return (
    <PublicProfileChrome performerId={profile.id} performerName={profile.fullName}>
      <div className="mx-auto max-w-3xl px-4 py-10 space-y-8">

        {/* ── Hero: avatar + name + bio ─────────────────────────────── */}
        <div className="flex flex-col sm:flex-row gap-6 items-center sm:items-start">
          {/* Avatar */}
          <div className="shrink-0">
            {profile.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatarUrl}
                alt={profile.fullName}
                className="h-32 w-32 rounded-full object-cover ring-4 ring-zinc-700"
              />
            ) : (
              <div className="h-32 w-32 rounded-full bg-zinc-800 ring-4 ring-zinc-700 flex items-center justify-center text-3xl font-bold text-stone-400">
                {initials}
              </div>
            )}
          </div>

          {/* Name, bio, links */}
          <div className="flex-1 text-center sm:text-left space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
              <h1 className="text-3xl font-bold tracking-tight text-yellow-400">{profile.fullName}</h1>
              <div className="flex justify-center sm:justify-end">
                <FollowButton targetUserId={profile.id} targetName={profile.fullName} theme="dark" />
              </div>
            </div>

            {profile.bio && (
              <p className="text-stone-300 leading-relaxed whitespace-pre-wrap">{profile.bio}</p>
            )}

            {/* Social links */}
            {hasLinks && (
              <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
                {profile.websiteLink && (
                  <SocialLink
                    href={profile.websiteLink}
                    label="Website"
                    icon={
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                    }
                  />
                )}
                {profile.instagramLink && (
                  <SocialLink
                    href={profile.instagramLink}
                    label="Instagram"
                    icon={
                      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                      </svg>
                    }
                  />
                )}
                {profile.youtubeLink && (
                  <SocialLink
                    href={profile.youtubeLink}
                    label="YouTube"
                    icon={
                      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M23.495 6.205a3.007 3.007 0 00-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 00.527 6.205a31.247 31.247 0 00-.522 5.805 31.247 31.247 0 00.522 5.783 3.007 3.007 0 002.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 002.088-2.088 31.247 31.247 0 00.5-5.783 31.247 31.247 0 00-.5-5.805zM9.609 15.601V8.408l6.264 3.602z"/>
                      </svg>
                    }
                  />
                )}
                {profile.twitterLink && (
                  <SocialLink
                    href={profile.twitterLink}
                    label="X / Twitter"
                    icon={
                      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                      </svg>
                    }
                  />
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Stats ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-4 text-center">
            <p className="text-2xl font-bold text-yellow-400">{profile.upcomingCount}</p>
            <p className="text-xs text-stone-400 mt-1">Upcoming performances</p>
          </div>
          <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-4 text-center">
            <p className="text-2xl font-bold text-yellow-400">{profile.attendedCount}</p>
            <p className="text-xs text-stone-400 mt-1">Events attended</p>
          </div>
        </div>

        {/* ── Community ratings (from post-event reviews) ─────────────── */}
        {hasPublicRatings && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-stone-200">Ratings</h2>
            {ra && (
              <>
                <p className="text-sm text-stone-500">
                  Averages from people who attended events with this profile as performer, host, or creator.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {(
                    [
                      { label: 'Performance', s: ra.performance },
                      { label: 'Hosting', s: ra.hosting },
                      { label: 'Event creator', s: ra.event_creator },
                    ] as const
                  ).map(({ label, s }) => (
                    <div
                      key={label}
                      className="rounded-xl border border-zinc-700 bg-zinc-900 p-4 text-center"
                    >
                      <p className="text-2xl font-bold text-yellow-400">
                        {s.count > 0 && s.avg != null ? Number(s.avg).toFixed(1) : '—'}
                        {s.count > 0 && <span className="text-sm font-normal text-stone-500"> /5</span>}
                      </p>
                      <p className="text-xs text-stone-400 mt-1">
                        {label}
                        {s.count > 0 && (
                          <span className="text-stone-600"> · {s.count} review{s.count === 1 ? '' : 's'}</span>
                        )}
                      </p>
                    </div>
                  ))}
                </div>
              </>
            )}
            {profile.recentReviewSnippets.length > 0 && (
              <div className="space-y-2 pt-2">
                <h3 className="text-sm font-medium text-stone-300">Recent comments</h3>
                <ul className="space-y-2">
                  {profile.recentReviewSnippets.map((snip, i) => (
                    <li
                      key={`${snip.createdAt}-${i}`}
                      className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-left"
                    >
                      <p className="text-sm text-stone-200 leading-relaxed whitespace-pre-wrap">{snip.comment}</p>
                      <p className="text-xs text-stone-500 mt-1">
                        {snip.eventTitle} · {new Date(snip.createdAt).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {/* ── Profile reviews ────────────────────────────────────────── */}
        <section className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-lg font-semibold text-stone-200">Reviews</h2>
            <Link
              href={`/profile/${id}/review`}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-yellow-400 border border-yellow-500/30 bg-yellow-500/10 hover:bg-yellow-500/20 px-3 py-1.5 rounded-lg transition-colors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Write a review
            </Link>
          </div>

          {/* Aggregate score */}
          {prSummary.count > 0 && prSummary.avg != null && (
            <div className="flex items-center gap-3 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3">
              <span className="text-3xl font-bold text-yellow-400">{Number(prSummary.avg).toFixed(1)}</span>
              <div>
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <span
                      key={n}
                      className={n <= Math.round(prSummary.avg ?? 0) ? 'text-yellow-400' : 'text-zinc-700'}
                    >
                      ★
                    </span>
                  ))}
                </div>
                <p className="text-xs text-stone-500 mt-0.5">
                  {prSummary.count} review{prSummary.count === 1 ? '' : 's'}
                </p>
              </div>
            </div>
          )}

          {/* Recent written reviews */}
          {profile.recentProfileReviews.length > 0 ? (
            <ul className="space-y-3">
              {profile.recentProfileReviews.map((rev) => (
                <li
                  key={rev.id}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-4"
                >
                  {/* Reviewer info row */}
                  <div className="flex items-center gap-2 mb-2">
                    {rev.reviewerAvatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={rev.reviewerAvatar}
                        alt={rev.reviewerName ?? ''}
                        className="h-7 w-7 rounded-full object-cover"
                      />
                    ) : (
                      <div className="h-7 w-7 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-bold text-stone-400">
                        {(rev.reviewerName ?? '?')[0]?.toUpperCase()}
                      </div>
                    )}
                    <span className="text-sm font-medium text-stone-300">{rev.reviewerName ?? 'Anonymous'}</span>
                    <span className="ml-auto flex items-center gap-0.5 text-xs text-yellow-400">
                      {'★'.repeat(rev.rating)}
                      <span className="text-zinc-700">{'★'.repeat(5 - rev.rating)}</span>
                    </span>
                  </div>

                  {/* Comment */}
                  <p className="text-sm text-stone-200 leading-relaxed whitespace-pre-wrap">{rev.comment}</p>

                  {/* Footer */}
                  <p className="text-xs text-stone-600 mt-2">
                    {rev.eventTitle && <span>{rev.eventTitle} · </span>}
                    {new Date(rev.createdAt).toLocaleDateString('en-CA', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </p>
                </li>
              ))}
            </ul>
          ) : !hasProfileReviews ? (
            <p className="text-sm text-stone-500">No reviews yet. Be the first!</p>
          ) : null}
        </section>

        {/* ── Performances (Upcoming / Recent tabs) ─────────────────── */}
        <PerformanceTabs
          upcomingEvents={profile.upcomingEvents}
          recentEvents={profile.recentEvents}
        />

        {/* ── Jokes ─────────────────────────────────────────────────── */}
        {jokes.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-stone-200 mb-3">
              Jokes{' '}
              <span className="text-sm font-normal text-stone-500">({jokes.length})</span>
            </h2>
            <ul className="space-y-3">
              {jokes.map((joke) => (
                <li
                  key={joke.id}
                  className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-4"
                >
                  <p className="text-stone-100 leading-relaxed whitespace-pre-wrap">{joke.content}</p>
                  <div className="mt-3 flex items-center gap-4 text-xs text-stone-500">
                    <time dateTime={joke.created_at}>
                      {new Date(joke.created_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </time>
                    {(joke.likeCount + joke.bombCount + joke.killCount + joke.laughterCount) > 0 && (
                      <span className="flex items-center gap-3">
                        {joke.likeCount > 0 && (
                          <span className="flex items-center gap-1">
                            <span>❤️</span>
                            <span>{joke.likeCount}</span>
                          </span>
                        )}
                        {joke.bombCount > 0 && (
                          <span className="flex items-center gap-1">
                            <span>💣</span>
                            <span>{joke.bombCount}</span>
                          </span>
                        )}
                        {joke.killCount > 0 && (
                          <span className="flex items-center gap-1">
                            <span>🔪</span>
                            <span>{joke.killCount}</span>
                          </span>
                        )}
                        {joke.laughterCount > 0 && (
                          <span className="flex items-center gap-1">
                            <span>😂</span>
                            <span>{joke.laughterCount}</span>
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

      </div>
    </PublicProfileChrome>
  )
}
