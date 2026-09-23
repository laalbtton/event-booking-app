'use client'

import { useState } from 'react'

export function BramptonEmailSubscribe() {
  const [firstName, setFirstName] = useState('')
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle')
  const [error, setError] = useState('')

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('saving')
    setError('')
    try {
      const res = await fetch('/api/brampton/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName, email }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof data?.error === 'string' ? data.error : 'Could not subscribe')
        setStatus('error')
        return
      }
      setStatus('done')
    } catch {
      setError('Could not subscribe. Try again.')
      setStatus('error')
    }
  }

  if (status === 'done') {
    return (
      <div className="rounded-2xl border border-yellow-400/30 bg-yellow-400/10 px-5 py-5 text-center">
        <p className="text-lg font-bold text-yellow-300">You’re on the list.</p>
        <p className="mt-1 text-sm text-stone-300">
          We’ll email you when this week’s Brampton shows are posted.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block text-left">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-stone-400">
            First name
          </span>
          <input
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="Optional"
            className="w-full rounded-xl border border-white/15 bg-zinc-900 px-4 py-3 text-stone-100 placeholder:text-stone-600 focus:border-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-400/40"
          />
        </label>
        <label className="block text-left">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-stone-400">
            Email
          </span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            className="w-full rounded-xl border border-white/15 bg-zinc-900 px-4 py-3 text-stone-100 placeholder:text-stone-600 focus:border-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-400/40"
          />
        </label>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={status === 'saving'}
        className="w-full rounded-xl bg-yellow-400 px-5 py-3 text-sm font-bold text-zinc-950 hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status === 'saving' ? 'Subscribing…' : 'Email me this week’s shows'}
      </button>
      <p className="text-center text-xs text-stone-500">
        No account needed. Unsubscribe anytime. Want credits too?{' '}
        <a href="/brampton-comedy-insider" className="text-yellow-400 underline hover:text-yellow-300">
          Join Brampton Comedy Insider
        </a>
        .
      </p>
    </form>
  )
}
