'use client'

import Link from 'next/link'

type Props = {
  eventId: string
  sessionId: string
  onClose: () => void
}

/**
 * Compact nudge when a Red Button session starts.
 * Number entry and performer votes live on the audience Live Mode page.
 */
export default function RedButtonPrompt({ eventId, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4">
      <div className="relative w-full max-w-sm rounded-2xl bg-zinc-900 border border-zinc-700 shadow-2xl overflow-hidden">
        <div className="bg-red-700 px-5 py-4 text-center">
          <p className="text-white font-black text-lg tracking-wide">LIVE MODE IS ON</p>
          <p className="text-red-100 text-xs mt-0.5">Enter the host&apos;s number and react to performers</p>
        </div>

        <div className="px-5 py-6 space-y-4 text-center">
          <p className="text-stone-300 text-sm">
            Open Live Mode to press the Red Button, vote green/red, and see who&apos;s on stage.
          </p>
          <Link
            href={`/events/${eventId}/live/audience`}
            onClick={onClose}
            className="block w-full rounded-xl bg-red-600 hover:bg-red-500 text-white font-black py-3.5 text-base transition-colors"
          >
            Open Live Mode
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="text-stone-500 hover:text-stone-300 text-xs underline transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  )
}
