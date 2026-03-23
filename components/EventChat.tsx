'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Bell, BellOff, Send, X } from 'lucide-react'

type ChatMessage = {
  id: string
  content: string
  created_at: string
  user_id: string
  profiles: {
    display_name: string | null
    avatar_url: string | null
  } | null
}

type Props = {
  eventId: string
  isHost: boolean
  chatMode: 'open' | 'host_only'
  currentUserId: string
  /** true when the user has a confirmed performer booking for this event (or is host/creator) */
  canSendMessages: boolean
  onClose: () => void
}

export default function EventChat({ eventId, isHost, chatMode, currentUserId, canSendMessages, onClose }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [notifEnabled, setNotifEnabled] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Can send = has a confirmed booking for this event (or is host) AND mode allows it
  const canSend = canSendMessages && (isHost || chatMode === 'open')

  // Load message history
  useEffect(() => {
    async function load() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const token = session?.access_token
        if (!token) return

        const res = await fetch(`/api/events/${eventId}/chat/messages`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const json = await res.json()
        if (res.ok) {
          setMessages(json.messages || [])
        } else {
          setLoadError(json.error || 'Failed to load messages')
        }

        // Fetch current notification pref
        const { data: pref } = await supabase
          .from('event_chat_notification_prefs')
          .select('enabled')
          .eq('user_id', currentUserId)
          .eq('event_id', eventId)
          .maybeSingle()
        if (pref !== null && pref !== undefined) {
          setNotifEnabled(pref.enabled)
        }
      } catch (err) {
        console.error('chat load error:', err)
      }
    }
    load()
  }, [eventId, currentUserId])

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`event-chat-${eventId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'event_chat_messages',
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          const newMsg = payload.new as ChatMessage
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev
            return [...prev, newMsg]
          })
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [eventId])

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    const trimmed = input.trim()
    if (!trimmed || sending) return

    setSending(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return

      const res = await fetch(`/api/events/${eventId}/chat/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ content: trimmed }),
      })

      if (res.ok) {
        setInput('')
      } else {
        const json = await res.json()
        console.error('send error:', json.error)
      }
    } finally {
      setSending(false)
    }
  }

  async function toggleNotif() {
    const next = !notifEnabled
    setNotifEnabled(next)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return

      await fetch(`/api/events/${eventId}/chat/notification-pref`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ enabled: next }),
      })
    } catch (err) {
      console.error('notif pref error:', err)
      setNotifEnabled(!next) // revert on error
    }
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900">
        <h2 className="text-white font-semibold text-base">Event Chat</h2>
        <div className="flex items-center gap-3">
          <button
            onClick={toggleNotif}
            className="text-zinc-400 hover:text-yellow-400 transition-colors"
            title={notifEnabled ? 'Mute notifications' : 'Unmute notifications'}
          >
            {notifEnabled ? <Bell size={18} /> : <BellOff size={18} />}
          </button>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {loadError && (
          <p className="text-red-400 text-sm text-center">{loadError}</p>
        )}
        {!loadError && messages.length === 0 && (
          <p className="text-zinc-500 text-sm text-center pt-8">No messages yet. Be the first to say something!</p>
        )}
        {messages.map((msg) => {
          const isOwn = msg.user_id === currentUserId
          return (
            <div
              key={msg.id}
              className={`flex gap-2 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}
            >
              {/* Avatar */}
              <div className="flex-shrink-0">
                {msg.profiles?.avatar_url ? (
                  <img
                    src={msg.profiles.avatar_url}
                    alt={msg.profiles.display_name || ''}
                    className="w-8 h-8 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-xs text-zinc-300">
                    {(msg.profiles?.display_name?.[0] || '?').toUpperCase()}
                  </div>
                )}
              </div>
              {/* Bubble */}
              <div className={`max-w-[75%] ${isOwn ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
                {!isOwn && (
                  <span className="text-xs text-zinc-400 px-1">
                    {msg.profiles?.display_name || 'Unknown'}
                  </span>
                )}
                <div
                  className={`px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words ${
                    isOwn
                      ? 'bg-yellow-400 text-zinc-950 rounded-tr-sm'
                      : 'bg-zinc-800 text-zinc-100 rounded-tl-sm'
                  }`}
                >
                  {msg.content}
                </div>
                <span className="text-xs text-zinc-600 px-1">{formatTime(msg.created_at)}</span>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      {canSend ? (
        <div className="flex items-center gap-2 px-4 py-3 border-t border-zinc-800 bg-zinc-900">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            placeholder="Type a message…"
            maxLength={1000}
            className="flex-1 bg-zinc-800 text-white placeholder-zinc-500 rounded-full px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-yellow-400"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="w-9 h-9 rounded-full bg-yellow-400 text-zinc-950 flex items-center justify-center disabled:opacity-40 transition-opacity"
          >
            <Send size={16} />
          </button>
        </div>
      ) : (
        <div className="px-4 py-3 border-t border-zinc-800 bg-zinc-900">
          <p className="text-zinc-500 text-sm text-center">
            {!canSendMessages
              ? 'Register for this event as a performer to send messages.'
              : 'Only the host can send messages in this chat.'}
          </p>
        </div>
      )}
    </div>
  )
}
