'use client'

/**
 * RedButtonListener
 *
 * Mounted once in the root layout for authenticated users.
 * Subscribes to Supabase Realtime INSERT/UPDATE events on the
 * `red_button_sessions` table. When an active session is detected
 * for an event where the current user has a confirmed booking,
 * it shows the <RedButtonPrompt> modal.
 */

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import RedButtonPrompt from './RedButtonPrompt'
import type { RealtimeChannel } from '@supabase/supabase-js'

type SessionPayload = {
  id: string
  event_id: string
  active: boolean
}

export default function RedButtonListener() {
  const [promptState, setPromptState] = useState<{ eventId: string; sessionId: string } | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const dismissedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    async function subscribe() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      channelRef.current = supabase
        .channel('red_button_listener')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'red_button_sessions' },
          async (payload) => {
            const row = payload.new as SessionPayload
            if (!row.active) return
            if (dismissedRef.current.has(row.id)) return
            await handleActiveSession(row, user.id)
          },
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'red_button_sessions' },
          async (payload) => {
            const row = payload.new as SessionPayload
            if (!row.active) {
              // Session ended — close modal if open for this session
              setPromptState((prev) => (prev?.sessionId === row.id ? null : prev))
              return
            }
            if (dismissedRef.current.has(row.id)) return
            await handleActiveSession(row, user.id)
          },
        )
        .subscribe()
    }

    async function handleActiveSession(row: SessionPayload, userId: string) {
      // Verify current user has a confirmed booking for this event
      const { data: booking } = await supabase
        .from('bookings')
        .select('id')
        .eq('event_id', row.event_id)
        .eq('user_id', userId)
        .eq('status', 'confirmed')
        .maybeSingle()

      if (!booking) return

      setPromptState({ eventId: row.event_id, sessionId: row.id })
    }

    subscribe()

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [])

  if (!promptState) return null

  return (
    <RedButtonPrompt
      eventId={promptState.eventId}
      sessionId={promptState.sessionId}
      onClose={() => {
        dismissedRef.current.add(promptState.sessionId)
        setPromptState(null)
      }}
    />
  )
}
