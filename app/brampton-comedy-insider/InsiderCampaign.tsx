'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  AGE_RANGES,
  CANADA_STATUSES,
  CITIES,
  COMEDY_PREFERENCES,
  CREDIT_ACCOUNT,
  CREDIT_EMAIL_UPDATES,
  CREDIT_PREFERENCES,
  CREDIT_TOTAL_AVAILABLE,
  DOWNTOWN_INTEREST,
  INSTAGRAM_HANDLE,
  INSTAGRAM_URL,
  TICKET_PRICE_RANGES,
  isValidEmail,
  trackInsiderEvent,
} from '@/lib/foundingMembers'
import { ChevronLeft } from 'lucide-react'

const WHATSAPP_URL = 'https://chat.whatsapp.com/JOIfm1ByZfn0HGrEFPpG71'

type MemberState = {
  totalCredits: number
  accountAwarded: boolean
  preferencesAwarded: boolean
  emailAwarded: boolean
  signupCompleted: boolean
  preferencesCompleted: boolean
  emailUpdatesOptIn: boolean
}

// Full record fetched after activation
type ActivatedMember = {
  first_name: string | null
  email: string
  total_credits_earned: number
  account_credit_awarded: boolean
  preferences_credit_awarded: boolean
  email_updates_credit_awarded: boolean
  signup_completed: boolean
  preferences_completed: boolean
  email_updates_opt_in: boolean
}

type Props = {
  initialClaimed: number
  initialRemaining: number
  limit: number
}

const BENEFITS = [
  'Earn a free comedy ticket',
  'Exclusive comedy invites',
  'Early access to future shows',
  'Members-only ticket offers',
  'Priority access to limited-seat events',
  'Founding Member status',
]

export function InsiderCampaign({ initialClaimed, initialRemaining, limit }: Props) {
  const [remaining, setRemaining] = useState(initialRemaining)
  const [claimed, setClaimed] = useState(initialClaimed)
  const [step, setStep] = useState<'account' | 'preferences' | 'done'>('account')
  const [member, setMember] = useState<MemberState | null>(null)
  const [magicSent, setMagicSent] = useState(false)
  const [capturedEmail, setCapturedEmail] = useState('')

  // Post-activation state
  const [isActivatedRoute, setIsActivatedRoute] = useState(false)
  const [activatedMember, setActivatedMember] = useState<ActivatedMember | null>(null)
  const [activatedLoading, setActivatedLoading] = useState(false)

  const formRef = useRef<HTMLDivElement>(null)
  const earned = member?.totalCredits ?? 0

  useEffect(() => {
    trackInsiderEvent('landing_page_view')
    if (new URLSearchParams(window.location.search).get('activated') === '1') {
      setIsActivatedRoute(true)
      setActivatedLoading(true)
      trackInsiderEvent('signup_completed')
      void loadActivatedMember()
    }
    fetch('/api/founding-members/stats')
      .then((r) => r.json())
      .then((d) => {
        if (typeof d?.remaining === 'number') setRemaining(d.remaining)
        if (typeof d?.claimed === 'number') setClaimed(d.claimed)
      })
      .catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadActivatedMember() {
    setActivatedLoading(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token
      if (!token) return

      const res = await fetch('/api/founding-members/me', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data?.found && data?.member) {
        setActivatedMember(data.member as ActivatedMember)
      }
    } catch { /* non-critical */ } finally {
      setActivatedLoading(false)
    }
  }

  function refreshCounter() {
    fetch('/api/founding-members/stats')
      .then((r) => r.json())
      .then((d) => {
        if (typeof d?.remaining === 'number') setRemaining(d.remaining)
        if (typeof d?.claimed === 'number') setClaimed(d.claimed)
      })
      .catch(() => {})
  }

  function scrollToForm() {
    trackInsiderEvent('cta_clicked')
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // ── Post-activation view ────────────────────────────────────
  if (isActivatedRoute) {
    if (activatedLoading) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-zinc-950">
          <p className="text-stone-400">Loading your membership…</p>
        </div>
      )
    }
    if (activatedMember) {
      return (
        <ActivatedDashboard
          member={activatedMember}
          onPreferencesComplete={(totalCredits) => {
            setActivatedMember((prev) =>
              prev
                ? { ...prev, preferences_completed: true, total_credits_earned: totalCredits }
                : prev,
            )
          }}
        />
      )
    }
    // Fallback: member record not found — fall through to landing page
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-stone-100">

      {/* ── HERO (full-width, centred) ────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-black via-neutral-950 to-stone-900 px-4 pt-10 pb-12 sm:pt-14 sm:pb-16">
        {/* Background crowd photo (desktop only) */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/brampton-comedy-crowd.jpg"
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover opacity-15 hidden sm:block"
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(250,204,21,0.10),transparent_55%)]" />
        <div className="relative mx-auto max-w-2xl text-center">

          <span className="inline-flex items-center gap-2 rounded-full border border-yellow-400/40 bg-yellow-400/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-yellow-300">
            🎙 Founding Members Club
          </span>

          <h1 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl">
            Join <span className="text-yellow-400">Brampton Comedy Insider</span>
          </h1>

          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-stone-300 sm:text-lg">
            Be one of the first 500 members and earn a free comedy ticket, exclusive event invites,
            discounted tickets, and priority access to future comedy shows in Brampton.
          </p>

          {step !== 'done' && (
            <div className="mt-8">
              <Button
                type="button"
                onClick={scrollToForm}
                className="h-12 px-8 bg-yellow-400 text-base font-bold text-zinc-950 hover:bg-yellow-300 shadow-lg shadow-yellow-400/20"
              >
                Add Your Info — Claim Your Spot
              </Button>
              <p className="mt-2.5 text-xs text-stone-500">
                Takes under a minute · ${CREDIT_TOTAL_AVAILABLE} in comedy credits available
              </p>
            </div>
          )}

          <ul className="mx-auto mt-7 grid max-w-md grid-cols-1 gap-2 text-left sm:grid-cols-2">
            {BENEFITS.map((b) => (
              <li key={b} className="flex items-center gap-2 text-sm text-stone-200">
                <span className="text-yellow-400">✓</span>
                {b}
              </li>
            ))}
          </ul>

          {/* Scarcity counter */}
          <div className="mx-auto mt-8 max-w-xs rounded-2xl border border-white/10 bg-white/5 px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-stone-400">
              Founding Members Remaining
            </p>
            <p className="mt-1.5 text-3xl font-extrabold text-yellow-400 tabular-nums">
              {remaining}{' '}
              <span className="text-lg font-normal text-stone-500">/ {limit} Spots Left</span>
            </p>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-yellow-400 transition-all duration-700"
                style={{ width: `${Math.min(100, (claimed / limit) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── CROWD PHOTO ──────────────────────────────────────── */}
      <section className="px-4 pt-6 pb-2">
        <div className="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-white/10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/brampton-comedy-crowd.jpg"
            alt="Audience at a Brampton comedy show at Ryan's Chai"
            className="w-full object-cover"
            style={{ maxHeight: 400 }}
          />
          <p className="bg-zinc-900/80 px-4 py-2.5 text-center text-xs text-stone-500">
            A recent show at Ryan&apos;s Chai, Brampton — the community is real 🎤
          </p>
        </div>
      </section>

      {/* ── FREE TICKET PROGRESS ─────────────────────────────── */}
      <section className="px-4 pt-12 pb-8">
        <div className="mx-auto max-w-md">
          <h2 className="text-center text-2xl font-bold text-white">
            Earn Your First Free Comedy Ticket
          </h2>
          <p className="mx-auto mt-3 max-w-md text-center text-sm leading-relaxed text-stone-400">
            Complete 3 simple steps and unlock ${CREDIT_TOTAL_AVAILABLE} in comedy credits that can be
            redeemed toward future comedy events, subject to ticket availability.
          </p>

          <div className="mt-7 rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-yellow-300">
              🎟 Free Ticket Progress
            </p>
            <div className="mt-4 space-y-3">
              <ProgressRow label="Create Account" amount={CREDIT_ACCOUNT} done={!!member?.accountAwarded} />
              <ProgressRow label="Complete Preferences" amount={CREDIT_PREFERENCES} done={!!member?.preferencesAwarded} />
              <ProgressRow label="Enable Email Updates" amount={CREDIT_EMAIL_UPDATES} done={!!member?.emailAwarded} />
            </div>
            <div className="mt-5 border-t border-white/10 pt-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-stone-300">Earned</span>
                <span className="text-xl font-extrabold text-yellow-400 tabular-nums">
                  ${earned}{' '}
                  <span className="text-stone-500">/ ${CREDIT_TOTAL_AVAILABLE}</span>
                </span>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-yellow-400 transition-all duration-700"
                  style={{ width: `${Math.min(100, (earned / CREDIT_TOTAL_AVAILABLE) * 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FORM ─────────────────────────────────────────────── */}
      <section id="signup-form" ref={formRef} className="scroll-mt-6 px-4 py-8">
        <div className="mx-auto max-w-md">
          {step === 'done' ? (
            <Confirmation credits={earned} />
          ) : (
            <div className="rounded-2xl border border-white/10 bg-zinc-900/80 p-6 shadow-xl shadow-black/40 backdrop-blur">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">
                  Personalize Your Comedy Experience
                </h2>
                <span className="shrink-0 text-xs font-medium text-stone-400">
                  Step {step === 'account' ? '1' : '2'} of 2
                </span>
              </div>

              {step === 'account' ? (
                <AccountStep
                  onComplete={(m, sent, email) => {
                    setMember(m)
                    setMagicSent(sent)
                    setCapturedEmail(email)
                    setStep('preferences')
                    trackInsiderEvent('preferences_started')
                    refreshCounter()
                  }}
                />
              ) : (
                <PreferencesStep
                  email={capturedEmail}
                  magicSent={magicSent}
                  onComplete={(m) => {
                    setMember((prev) => (prev ? { ...prev, ...m } : prev))
                    setStep('done')
                  }}
                />
              )}
            </div>
          )}
        </div>
      </section>

      {/* ── REWARDS BREAKDOWN ────────────────────────────────── */}
      <section className="px-4 pb-16">
        <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-transparent p-6">
          <h2 className="text-center text-lg font-bold text-white">How your credits add up</h2>
          <div className="mt-5 space-y-3 text-sm">
            <RewardRow label="Create Your Account" amount={CREDIT_ACCOUNT} />
            <RewardRow label="Complete Your Preferences" amount={CREDIT_PREFERENCES} />
            <RewardRow label="Enable Email Updates" amount={CREDIT_EMAIL_UPDATES} />
            <div className="flex items-center justify-between border-t border-white/10 pt-3 font-bold text-white">
              <span>Total Available Immediately</span>
              <span className="text-yellow-400">${CREDIT_TOTAL_AVAILABLE} Credit</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────── */}
      <footer className="border-t border-white/10 px-4 py-10 text-center">
        <p className="text-sm text-stone-400">Follow us on Instagram</p>
        <a
          href={INSTAGRAM_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackInsiderEvent('instagram_clicked')}
          className="mt-1 inline-block font-semibold text-yellow-400 hover:text-yellow-300"
        >
          @{INSTAGRAM_HANDLE}
        </a>
      </footer>
    </div>
  )
}

// ── Activated dashboard (returned via magic link) ────────────

function ActivatedDashboard({
  member,
  onPreferencesComplete,
}: {
  member: ActivatedMember
  onPreferencesComplete: (totalCredits: number) => void
}) {
  const firstName = member.first_name || 'there'
  const credits = member.total_credits_earned
  const prefsCompleted = member.preferences_completed

  // If preferences aren't done yet, let them complete from here to earn the remaining $15
  const [showPrefs, setShowPrefs] = useState(!prefsCompleted)

  return (
    <div className="min-h-screen bg-zinc-950 text-stone-100">
      {/* Header bar */}
      <div className="bg-green-500/15 border-b border-green-500/20 px-4 py-2.5 text-center text-sm font-medium text-green-300">
        ✓ Account activated — you&apos;re officially a Founding Member
      </div>

      <div className="mx-auto max-w-xl px-4 py-10 space-y-6">
        {/* Greeting */}
        <div className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-yellow-400/40 bg-yellow-400/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-yellow-300">
            🎙 Founding Member
          </span>
          <h1 className="mt-4 text-2xl font-extrabold text-white sm:text-3xl">
            Welcome, {firstName}!
          </h1>
          <p className="mt-2 text-sm text-stone-400">
            You&apos;re on the priority list for upcoming Brampton comedy shows.
          </p>
        </div>

        {/* Credits card */}
        <div className="rounded-2xl border border-yellow-400/30 bg-gradient-to-b from-yellow-400/10 to-transparent p-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-stone-400">
            Comedy Credits Earned
          </p>
          <p className="mt-2 text-5xl font-extrabold text-yellow-400 tabular-nums">${credits}</p>
          <p className="mt-2 text-sm text-stone-400">
            Redeemable toward future Brampton comedy event tickets
          </p>

          {/* Progress toward $25 */}
          {credits < CREDIT_TOTAL_AVAILABLE && (
            <div className="mt-4">
              <div className="flex justify-between text-xs text-stone-500 mb-1.5">
                <span>${credits} earned</span>
                <span>${CREDIT_TOTAL_AVAILABLE} max</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-yellow-400 transition-all duration-700"
                  style={{ width: `${Math.min(100, (credits / CREDIT_TOTAL_AVAILABLE) * 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Step checklist */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-stone-400">
            Your Progress
          </p>
          <ChecklistRow done={member.account_credit_awarded}  label="Account created"              credit={CREDIT_ACCOUNT} />
          <ChecklistRow done={member.preferences_credit_awarded} label="Comedy preferences saved"  credit={CREDIT_PREFERENCES} />
          <ChecklistRow done={member.email_updates_credit_awarded} label="Email updates enabled"   credit={CREDIT_EMAIL_UPDATES} />
        </div>

        {/* Preferences CTA — only if not yet completed */}
        {!prefsCompleted && (
          <div className="rounded-2xl border border-yellow-400/20 bg-yellow-400/5 p-5">
            <p className="font-semibold text-white">
              Unlock ${CREDIT_PREFERENCES} more — complete your preferences
            </p>
            <p className="mt-1 text-sm text-stone-400">
              Takes under a minute. Helps us send you the right event invites.
            </p>
            {showPrefs ? (
              <div className="mt-5">
                <PreferencesStep
                  email={member.email}
                  magicSent={false}
                  onComplete={(m) => {
                    onPreferencesComplete(m.totalCredits ?? credits + CREDIT_PREFERENCES)
                    setShowPrefs(false)
                  }}
                />
              </div>
            ) : (
              <Button
                className="mt-4 bg-yellow-400 font-bold text-zinc-950 hover:bg-yellow-300"
                onClick={() => setShowPrefs(true)}
              >
                Complete My Preferences
              </Button>
            )}
          </div>
        )}

        {/* Coming soon */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center space-y-2">
          <div className="text-2xl">🎭</div>
          <h2 className="font-bold text-white">Shows Coming Soon</h2>
          <p className="text-sm leading-relaxed text-stone-400">
            Upcoming comedy shows will be announced exclusively to Insider Members before tickets
            go public. Keep an eye on your inbox — you&apos;ll hear from us first.
          </p>
        </div>

        {/* WhatsApp CTA */}
        <div className="rounded-2xl border border-green-700/40 bg-green-900/15 p-6 text-center space-y-3">
          <div className="text-2xl">💬</div>
          <h2 className="font-bold text-white">Get Faster Updates on WhatsApp</h2>
          <p className="text-sm leading-relaxed text-stone-300">
            For the quickest updates on show announcements, ticket drops, and exclusive offers —
            join our WhatsApp community.
          </p>
          <Button
            asChild
            className="bg-green-500 font-bold text-white hover:bg-green-400"
          >
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Join WhatsApp Community
            </a>
          </Button>
        </div>

        {/* Instagram */}
        <div className="text-center space-y-1 pb-4">
          <p className="text-sm text-stone-400">Also follow us on Instagram</p>
          <a
            href={INSTAGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackInsiderEvent('instagram_clicked')}
            className="font-semibold text-yellow-400 hover:text-yellow-300"
          >
            @{INSTAGRAM_HANDLE}
          </a>
        </div>
      </div>
    </div>
  )
}

function ChecklistRow({ done, label, credit }: { done: boolean; label: string; credit: number }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs transition-colors ${
          done ? 'border-yellow-400 bg-yellow-400 text-zinc-950' : 'border-white/30 text-transparent'
        }`}
      >
        ✓
      </span>
      <span className={`flex-1 text-sm ${done ? 'text-stone-200' : 'text-stone-500 line-through'}`}>
        {label}
      </span>
      <span className={`text-sm font-semibold ${done ? 'text-yellow-400' : 'text-stone-600'}`}>
        ${credit}
      </span>
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────

function ProgressRow({ label, amount, done }: { label: string; amount: number; done: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs transition-colors ${
          done ? 'border-yellow-400 bg-yellow-400 text-zinc-950' : 'border-white/30 text-transparent'
        }`}
      >
        ✓
      </span>
      <span className={`flex-1 text-sm ${done ? 'text-stone-200' : 'text-stone-400'}`}>{label}</span>
      <span className={`text-sm font-semibold ${done ? 'text-yellow-400' : 'text-stone-500'}`}>
        ${amount}
      </span>
    </div>
  )
}

function RewardRow({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="flex items-center justify-between text-stone-300">
      <span>{label}</span>
      <span className="font-semibold text-yellow-400">→ ${amount} Credit</span>
    </div>
  )
}

// ── Step 1: Account creation ─────────────────────────────────

function AccountStep({
  onComplete,
}: {
  onComplete: (member: MemberState, magicSent: boolean, email: string) => void
}) {
  const [firstName, setFirstName] = useState('')
  const [email, setEmail] = useState('')
  const [optIn, setOptIn] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!firstName.trim()) { setError('Please enter your first name.'); return }
    if (!isValidEmail(email)) { setError('Please enter a valid email address.'); return }

    setLoading(true)
    try {
      const res = await fetch('/api/founding-members/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName: firstName.trim(), email: email.trim(), emailUpdatesOptIn: optIn }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Something went wrong. Please try again.')

      trackInsiderEvent('email_submitted')
      trackInsiderEvent('credit_awarded', { reason: 'account', amount: CREDIT_ACCOUNT })
      if (optIn) trackInsiderEvent('email_opt_in')

      // Send branded magic-link email via server route instead of Supabase's generic template
      let sent = false
      try {
        const mlRes = await fetch('/api/founding-members/send-magic-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email.trim(),
            firstName: firstName.trim(),
            totalCredits: (data.member as MemberState)?.totalCredits ?? 5,
          }),
        })
        if (mlRes.ok) { sent = true; trackInsiderEvent('magic_link_sent') }
      } catch { /* non-blocking */ }

      onComplete(data.member as MemberState, sent, email.trim().toLowerCase())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1.5 block text-sm font-medium text-stone-300">First Name</label>
        <Input
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          placeholder="Your first name"
          autoComplete="given-name"
          className="border-white/15 bg-zinc-800 text-stone-100 placeholder:text-stone-500 focus:border-yellow-400"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-stone-300">Email Address</label>
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          autoComplete="email"
          className="border-white/15 bg-zinc-800 text-stone-100 placeholder:text-stone-500 focus:border-yellow-400"
        />
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-white/10 bg-white/5 p-3">
        <input
          type="checkbox"
          checked={optIn}
          onChange={(e) => setOptIn(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-yellow-400"
        />
        <span className="text-sm text-stone-300">
          I want email updates about future comedy events, ticket offers, and exclusive invites.
        </span>
      </label>

      <p className="text-xs leading-relaxed text-stone-500">
        By signing up, you agree to receive updates about Brampton comedy events, ticket offers, and
        exclusive invites. You can unsubscribe anytime.
      </p>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <Button
        type="submit"
        disabled={loading}
        className="w-full bg-yellow-400 font-bold text-zinc-950 hover:bg-yellow-300"
      >
        {loading ? 'Saving…' : 'Continue'}
      </Button>
    </form>
  )
}

// ── Step 2: Preferences wizard ───────────────────────────────

type PrefAnswers = {
  ageRange: string | null
  canadaStatus: string | null
  city: string | null
  downtown: string | null
  comedyPrefs: string[]
  priceRange: string | null
  favorites: string
}

type QuestionDef =
  | { kind: 'single'; key: keyof Omit<PrefAnswers, 'comedyPrefs' | 'favorites'>; label: string; options: readonly string[] }
  | { kind: 'multi';  key: 'comedyPrefs'; label: string; options: readonly string[] }
  | { kind: 'text';   key: 'favorites';   label: string; hint: string }

const QUESTIONS: QuestionDef[] = [
  { kind: 'single', key: 'ageRange',      label: 'What is your age range?',                                        options: AGE_RANGES },
  { kind: 'single', key: 'canadaStatus',  label: 'Which best describes you?',                                      options: CANADA_STATUSES },
  { kind: 'single', key: 'city',          label: 'Where do you live?',                                             options: CITIES },
  { kind: 'single', key: 'downtown',      label: 'Would you attend a comedy show in Downtown Brampton?',           options: DOWNTOWN_INTEREST },
  { kind: 'multi',  key: 'comedyPrefs',   label: 'What kind of comedy interests you?',                             options: COMEDY_PREFERENCES },
  { kind: 'single', key: 'priceRange',    label: 'How much would you realistically pay for a local comedy ticket?', options: TICKET_PRICE_RANGES },
  { kind: 'text',   key: 'favorites',     label: "Who are your favourite comedians?",                               hint: 'e.g. comedians you\'d love to see live' },
]

const TOTAL_QUESTIONS = QUESTIONS.length

function PreferencesStep({
  email,
  magicSent,
  onComplete,
}: {
  email: string
  magicSent: boolean
  onComplete: (member: Partial<MemberState>) => void
}) {
  const [qIndex, setQIndex] = useState(0)
  const [answers, setAnswers] = useState<PrefAnswers>({
    ageRange: null, canadaStatus: null, city: null, downtown: null,
    comedyPrefs: [], priceRange: null, favorites: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const question = QUESTIONS[qIndex]
  const isLast = qIndex === TOTAL_QUESTIONS - 1

  function setSingle(key: keyof Omit<PrefAnswers, 'comedyPrefs' | 'favorites'>, value: string) {
    setAnswers((prev) => ({ ...prev, [key]: value }))
    // Auto-advance after a short delay so the selection is visibly confirmed
    setTimeout(() => setQIndex((i) => Math.min(i + 1, TOTAL_QUESTIONS - 1)), 280)
  }

  function toggleMulti(value: string) {
    setAnswers((prev) => ({
      ...prev,
      comedyPrefs: prev.comedyPrefs.includes(value)
        ? prev.comedyPrefs.filter((v) => v !== value)
        : [...prev.comedyPrefs, value],
    }))
  }

  function handleNext() {
    setQIndex((i) => Math.min(i + 1, TOTAL_QUESTIONS - 1))
  }

  function handleBack() {
    setError('')
    setQIndex((i) => Math.max(i - 1, 0))
  }

  async function handleSubmit() {
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/founding-members/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          ageRange: answers.ageRange,
          canadaStatus: answers.canadaStatus,
          city: answers.city,
          downtownBramptonInterest: answers.downtown,
          comedyPreferences: answers.comedyPrefs,
          ticketPriceRange: answers.priceRange,
          favoriteComedians: answers.favorites.trim() || null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Could not save your preferences.')

      trackInsiderEvent('preferences_completed')
      trackInsiderEvent('credit_awarded', { reason: 'preferences', amount: CREDIT_PREFERENCES })

      onComplete({ totalCredits: data.member?.totalCredits ?? 0, preferencesAwarded: true, preferencesCompleted: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  // Current answer for this question (to highlight)
  const currentSingleValue = question.kind === 'single'
    ? (answers[question.key] as string | null)
    : null

  return (
    <div className="space-y-5">
      {/* Magic link reminder */}
      {magicSent && (
        <div className="rounded-lg border border-green-700/50 bg-green-900/20 p-3 text-center text-xs text-green-300">
          Check your email for your magic link — it activates your account and unlocks your credits.
        </div>
      )}

      {/* Progress dots */}
      <div className="flex items-center gap-1.5">
        {QUESTIONS.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
              i < qIndex ? 'bg-yellow-400' : i === qIndex ? 'bg-yellow-400/60' : 'bg-white/15'
            }`}
          />
        ))}
      </div>
      <p className="text-xs text-stone-400">
        Question {qIndex + 1} of {TOTAL_QUESTIONS}
      </p>

      {/* Question */}
      <div>
        <p className="text-base font-semibold leading-snug text-white">
          {question.label}
          {question.kind === 'text' && (
            <span className="ml-1.5 text-sm font-normal text-stone-500">(optional)</span>
          )}
        </p>
        {question.kind === 'multi' && (
          <p className="mt-0.5 text-xs text-stone-500">Select all that apply</p>
        )}
      </div>

      {/* Answer area */}
      {question.kind === 'single' && (
        <div className="flex flex-wrap gap-2">
          {question.options.map((opt) => {
            const active = currentSingleValue === opt
            return (
              <button
                key={opt}
                type="button"
                onClick={() => setSingle(question.key, opt)}
                className={`rounded-xl border px-3.5 py-2 text-sm transition-all duration-150 ${
                  active
                    ? 'border-yellow-400 bg-yellow-400 font-semibold text-zinc-950 shadow-md shadow-yellow-400/20'
                    : 'border-white/20 text-stone-300 hover:border-white/40 hover:text-stone-100'
                }`}
              >
                {opt}
              </button>
            )
          })}
        </div>
      )}

      {question.kind === 'multi' && (
        <div className="flex flex-wrap gap-2">
          {question.options.map((opt) => {
            const active = answers.comedyPrefs.includes(opt)
            return (
              <button
                key={opt}
                type="button"
                onClick={() => toggleMulti(opt)}
                className={`rounded-xl border px-3.5 py-2 text-sm transition-all duration-150 ${
                  active
                    ? 'border-yellow-400 bg-yellow-400 font-semibold text-zinc-950 shadow-md shadow-yellow-400/20'
                    : 'border-white/20 text-stone-300 hover:border-white/40 hover:text-stone-100'
                }`}
              >
                {opt}
              </button>
            )
          })}
        </div>
      )}

      {question.kind === 'text' && (
        <Input
          value={answers.favorites}
          onChange={(e) => setAnswers((prev) => ({ ...prev, favorites: e.target.value }))}
          placeholder={question.hint}
          className="border-white/15 bg-zinc-800 text-stone-100 placeholder:text-stone-500 focus:border-yellow-400"
        />
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      {/* Navigation */}
      <div className="flex items-center gap-3 pt-1">
        {qIndex > 0 && (
          <button
            type="button"
            onClick={handleBack}
            className="flex items-center gap-1 text-sm text-stone-400 hover:text-stone-200"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>
        )}

        <div className="flex-1" />

        {isLast ? (
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className="bg-yellow-400 font-bold text-zinc-950 hover:bg-yellow-300"
          >
            {loading ? 'Unlocking…' : 'Finish & Unlock Credits'}
          </Button>
        ) : (
          /* Only show Next for multi-select and text (single-select auto-advances) */
          question.kind !== 'single' && (
            <Button
              type="button"
              onClick={handleNext}
              className="bg-yellow-400 font-bold text-zinc-950 hover:bg-yellow-300"
            >
              Next
            </Button>
          )
        )}
      </div>
    </div>
  )
}

// ── Confirmation ─────────────────────────────────────────────

function Confirmation({ credits }: { credits: number }) {
  const items = [
    'Founding Member Status Activated',
    'Preferences Saved',
    'Credits Added',
    'Early Access Enabled',
  ]
  return (
    <div className="rounded-2xl border border-yellow-400/30 bg-gradient-to-b from-yellow-400/10 to-transparent p-7 text-center shadow-xl shadow-black/40">
      <div className="text-4xl">🎉</div>
      <h2 className="mt-3 text-2xl font-extrabold text-white">
        You&apos;re Officially a Founding Member
      </h2>
      <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-stone-300">
        You&apos;re now on the priority list for future comedy events, early access offers, and
        special ticket deals.
      </p>

      <ul className="mx-auto mt-6 max-w-xs space-y-2 text-left">
        {items.map((i) => (
          <li key={i} className="flex items-center gap-2 text-sm text-stone-200">
            <span className="text-yellow-400">✓</span>
            {i}
          </li>
        ))}
      </ul>

      <div className="mt-6 rounded-xl border border-white/10 bg-white/5 px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-stone-400">
          Credits Earned
        </p>
        <p className="mt-1 text-3xl font-extrabold text-yellow-400">${credits}</p>
      </div>

      <div className="mt-7">
        <p className="text-sm text-stone-400">Follow us on Instagram</p>
        <p className="font-semibold text-white">@{INSTAGRAM_HANDLE}</p>
        <Button
          asChild
          className="mt-3 bg-yellow-400 font-bold text-zinc-950 hover:bg-yellow-300"
          onClick={() => trackInsiderEvent('instagram_clicked')}
        >
          <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">
            Visit Instagram
          </a>
        </Button>
      </div>
    </div>
  )
}
