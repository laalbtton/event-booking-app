'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Bell } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthBootstrap } from '@/components/providers/auth-bootstrap-provider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Tone = 'default' | 'onDark'

type NotificationsBellLinkProps = {
  /** Visual style: default matches header icons; onDark for green credit banner */
  tone?: Tone
  className?: string
}

export function NotificationsBellLink({ tone = 'default', className }: NotificationsBellLinkProps) {
  const { authResolved, user } = useAuthBootstrap()
  const [unreadCount, setUnreadCount] = useState(0)
  const warnedRealtimeRef = useRef(false)

  async function loadUnreadCount() {
    try {
      if (!user) {
        setUnreadCount(0)
        return
      }
      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('read', false)

      if (error) {
        console.error('Error loading unread count:', error)
        return
      }
      setUnreadCount(count ?? 0)
    } catch (e) {
      console.error('Exception loading unread count:', e)
    }
  }

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null
    let refreshInterval: ReturnType<typeof setInterval> | null = null

    async function setup() {
      try {
        if (!user) return

        await loadUnreadCount()

        try {
          channel = supabase
            .channel(`notifications-changes-${user.id}`)
            .on(
              'postgres_changes',
              {
                event: 'INSERT',
                schema: 'public',
                table: 'notifications',
                filter: `user_id=eq.${user.id}`,
              },
              () => loadUnreadCount()
            )
            .on(
              'postgres_changes',
              {
                event: 'UPDATE',
                schema: 'public',
                table: 'notifications',
                filter: `user_id=eq.${user.id}`,
              },
              () => loadUnreadCount()
            )
            .on(
              'postgres_changes',
              {
                event: 'DELETE',
                schema: 'public',
                table: 'notifications',
                filter: `user_id=eq.${user.id}`,
              },
              () => loadUnreadCount()
            )
            .subscribe((status) => {
              if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                if (!warnedRealtimeRef.current) {
                  console.debug('Notifications subscription unavailable, using periodic refresh')
                  warnedRealtimeRef.current = true
                }
              }
            })
        } catch {
          if (!warnedRealtimeRef.current) {
            console.debug('Failed to set up notifications subscription, using periodic refresh')
            warnedRealtimeRef.current = true
          }
        }

        refreshInterval = setInterval(() => loadUnreadCount(), 30_000)
      } catch {
        if (!warnedRealtimeRef.current) {
          console.debug('Error setting up notifications, using periodic refresh only')
          warnedRealtimeRef.current = true
        }
        refreshInterval = setInterval(() => loadUnreadCount(), 30_000)
      }
    }

    void setup()

    return () => {
      if (channel) supabase.removeChannel(channel)
      if (refreshInterval) clearInterval(refreshInterval)
    }
  }, [authResolved, user?.id])

  if (!authResolved || !user) return null

  const isDark = tone === 'onDark'

  return (
    <div className={cn('relative inline-flex shrink-0', className)}>
      <Button
        asChild
        variant="ghost"
        size="icon"
        className={cn(
          'relative h-8 w-8',
          isDark && 'text-white hover:bg-white/15 hover:text-white border border-white/25'
        )}
        title="Notifications"
      >
        <Link href="/notifications" aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications'}>
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -right-0.5 -top-0.5 h-4 min-w-4 flex items-center justify-center rounded-full p-0 text-[10px]"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Link>
      </Button>
    </div>
  )
}
