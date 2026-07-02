'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

type Props = {
  eventId: string
  sessionId: string
  onClose: () => void
}

type SubmitState = 'idle' | 'submitting' | 'correct' | 'wrong' | 'already_submitted' | 'ended'

export default function RedButtonPrompt({ eventId, sessionId, onClose }: Props) {
  const [guess, setGuess] = useState('')
  const [state, setState] = useState<SubmitState>('idle')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const num = parseInt(guess, 10)
    if (isNaN(num) || num < 11 || num > 99) {
      setError('Enter a number between 11 and 99')
      return
    }
    setError(null)
    setState('submitting')

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setError('Not authenticated'); setState('idle'); return }

      const res = await fetch(`/api/events/${eventId}/red-button/submit`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sessionId, guess: num }),
      })
      const data = await res.json()

      if (!res.ok) {
        if (res.status === 400 && data.error?.includes('ended')) {
          setState('ended')
        } else {
          setError(data.error || 'Failed to submit')
          setState('idle')
        }
        return
      }

      if (data.alreadySubmitted) {
        setState(data.correct ? 'correct' : 'already_submitted')
        return
      }

      setState(data.correct ? 'correct' : 'wrong')
    } catch (e: any) {
      setError(e.message || 'Error')
      setState('idle')
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4">
      <div className="relative w-full max-w-sm rounded-2xl bg-zinc-900 border border-zinc-700 shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="bg-red-700 px-5 py-4 text-center">
          <p className="text-white font-black text-lg tracking-wide">🔴 RED BUTTON PROMO</p>
          <p className="text-red-100 text-xs mt-0.5">Live at this event — enter the host&apos;s number!</p>
        </div>

        <div className="px-5 py-6 space-y-5 text-center">

          {(state === 'idle' || state === 'submitting') && (
            <>
              <div>
                <p className="text-stone-300 text-sm mb-1">Enter the 2-digit number the host is showing</p>
                <p className="text-stone-500 text-xs">(11 – 99)</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <input
                  type="number"
                  inputMode="numeric"
                  min={11}
                  max={99}
                  value={guess}
                  onChange={(e) => { setGuess(e.target.value); setError(null) }}
                  placeholder="??"
                  className="w-32 mx-auto block text-center text-4xl font-black bg-zinc-800 border-2 border-zinc-600 rounded-xl px-3 py-3 text-white focus:outline-none focus:border-red-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  disabled={state === 'submitting'}
                />
                {error && <p className="text-red-400 text-xs">{error}</p>}

                <button
                  type="submit"
                  disabled={state === 'submitting' || !guess}
                  className="w-full rounded-xl bg-red-600 hover:bg-red-500 disabled:bg-zinc-700 disabled:text-zinc-400 text-white font-black py-3.5 text-base transition-colors"
                >
                  {state === 'submitting' ? 'Submitting…' : '🔴 Press the Red Button'}
                </button>
              </form>
            </>
          )}

          {state === 'correct' && (
            <div className="space-y-3 py-2">
              <div className="text-6xl">✅</div>
              <p className="text-green-400 font-black text-xl">Correct!</p>
              <p className="text-stone-300 text-sm">You&apos;ve earned <strong className="text-yellow-400">2 Ryan&apos;s Chai credits</strong>!</p>
              <p className="text-stone-500 text-xs">You&apos;re also entered in the lucky draw for a Free Chai.</p>
            </div>
          )}

          {state === 'wrong' && (
            <div className="space-y-3 py-2">
              <div className="text-5xl">❌</div>
              <p className="text-red-400 font-black text-lg">Wrong number!</p>
              <p className="text-stone-400 text-sm">You&apos;re still entered in the lucky draw though. Good luck!</p>
            </div>
          )}

          {state === 'already_submitted' && (
            <div className="space-y-3 py-2">
              <div className="text-5xl">✅</div>
              <p className="text-stone-300 text-sm">You already submitted a correct answer and earned your credits!</p>
            </div>
          )}

          {state === 'ended' && (
            <div className="space-y-3 py-2">
              <div className="text-5xl">🏁</div>
              <p className="text-stone-300 text-sm">The promo has ended. Stay tuned for the lucky draw winner!</p>
            </div>
          )}

          <button
            onClick={onClose}
            className="text-stone-500 hover:text-stone-300 text-xs underline transition-colors"
          >
            {state === 'idle' || state === 'submitting' ? 'Skip' : 'Close'}
          </button>

        </div>
      </div>
    </div>
  )
}
