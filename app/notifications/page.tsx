'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { formatTime } from '@/lib/dateUtils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

type Notification = {
  id: string
  type: string
  title: string
  message: string
  read: boolean
  related_booking_id: string | null
  related_event_id: string | null
  created_at: string
}

export default function NotificationsPage() {
  const router = useRouter()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [swipingId, setSwipingId] = useState<string | null>(null)
  const [swipeOffset, setSwipeOffset] = useState<Record<string, number>>({})
  const [swipeDirection, setSwipeDirection] = useState<Record<string, 'left' | 'right'>>({})
  const touchStartX = useRef<Record<string, number>>({})
  const touchStartY = useRef<Record<string, number>>({})

  useEffect(() => {
    checkAuth()
  }, [])

  async function checkAuth() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }
    loadNotifications(user.id)
  }

  async function loadNotifications(userId: string) {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(100)

      if (error) throw error
      const loadedNotifications = data || []
      setNotifications(loadedNotifications)

      // Auto-mark unread notifications as read when page loads
      const unreadIds = loadedNotifications.filter(n => !n.read).map(n => n.id)
      if (unreadIds.length > 0) {
        await supabase
          .from('notifications')
          .update({ read: true })
          .in('id', unreadIds)
        
        // Update local state
        setNotifications(prev =>
          prev.map(n => unreadIds.includes(n.id) ? { ...n, read: true } : n)
        )
      }
    } catch (error) {
      console.error('Error loading notifications:', error)
    } finally {
      setLoading(false)
    }
  }

  async function markAsRead(notificationId: string) {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', notificationId)

      if (error) throw error

      // Update local state
      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
      )
    } catch (error) {
      console.error('Error marking notification as read:', error)
    }
  }

  async function handleNotificationClick(notification: Notification) {
    // Mark as read when clicked
    if (!notification.read) {
      markAsRead(notification.id)
    }

    // Navigate based on notification type
    if (notification.type === 'event_creator_request') {
      router.push('/admin/requests')
    } else if (notification.type === 'event_pending_approval' && notification.related_event_id) {
      // Look up the primary community for this event and go to the community admin panel
      const { data: link } = await supabase
        .from('event_communities')
        .select('community_id')
        .eq('event_id', notification.related_event_id)
        .eq('is_primary', true)
        .maybeSingle()
      if (link?.community_id) {
        router.push(`/communities/${link.community_id}`)
      } else {
        // Fallback: look up any community link for this event
        const { data: anyLink } = await supabase
          .from('event_communities')
          .select('community_id')
          .eq('event_id', notification.related_event_id)
          .limit(1)
          .maybeSingle()
        router.push(anyLink?.community_id ? `/communities/${anyLink.community_id}` : '/dashboard')
      }
    } else if (
      (notification.type === 'host_poster_reminder_5d' || notification.type === 'host_poster_reminder_24h') &&
      notification.related_event_id
    ) {
      router.push(`/events/${notification.related_event_id}/hosting-info`)
    } else if (notification.related_event_id) {
      router.push(`/events/${notification.related_event_id}`)
    } else if (notification.related_booking_id) {
      router.push('/dashboard')
    }
  }

  function handleTouchStart(e: React.TouchEvent, notificationId: string) {
    touchStartX.current[notificationId] = e.touches[0].clientX
    touchStartY.current[notificationId] = e.touches[0].clientY
    setSwipingId(notificationId)
  }

  function handleTouchMove(e: React.TouchEvent, notificationId: string) {
    if (swipingId !== notificationId) return

    const currentX = e.touches[0].clientX
    const currentY = e.touches[0].clientY
    const startX = touchStartX.current[notificationId]
    const startY = touchStartY.current[notificationId]

    const deltaX = currentX - startX
    const deltaY = Math.abs(currentY - startY)

    // Only allow horizontal swipe
    if (deltaY < 50) {
      if (deltaX < 0) {
        // Swipe left (for delete)
        const offset = Math.max(deltaX, -100) // Limit swipe to -100px
        setSwipeOffset(prev => ({ ...prev, [notificationId]: offset }))
        setSwipeDirection(prev => ({ ...prev, [notificationId]: 'left' }))
      } else if (deltaX > 0) {
        // Swipe right (for time)
        const offset = Math.min(deltaX, 100) // Limit swipe to 100px
        setSwipeOffset(prev => ({ ...prev, [notificationId]: offset }))
        setSwipeDirection(prev => ({ ...prev, [notificationId]: 'right' }))
      }
    }
  }

  function handleTouchEnd(notificationId: string) {
    const offset = swipeOffset[notificationId] || 0
    const direction = swipeDirection[notificationId]
    
    if (direction === 'left' && offset < -50) {
      // Swipe left threshold reached, delete notification
      deleteNotification(notificationId)
    }
    
    // Reset swipe state after a delay for right swipe (to show time)
    if (direction === 'right' && offset > 50) {
      setTimeout(() => {
        setSwipeOffset(prev => {
          const newState = { ...prev }
          delete newState[notificationId]
          return newState
        })
        setSwipeDirection(prev => {
          const newState = { ...prev }
          delete newState[notificationId]
          return newState
        })
        setSwipingId(null)
      }, 2000) // Show time for 2 seconds
    } else {
      // Reset immediately for left swipe or small movements
      setSwipeOffset(prev => {
        const newState = { ...prev }
        delete newState[notificationId]
        return newState
      })
      setSwipeDirection(prev => {
        const newState = { ...prev }
        delete newState[notificationId]
        return newState
      })
      setSwipingId(null)
    }
    
    touchStartX.current[notificationId] = 0
    touchStartY.current[notificationId] = 0
  }


  async function deleteNotification(notificationId: string) {
    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', notificationId)

      if (error) throw error

      // Update local state
      setNotifications(prev => prev.filter(n => n.id !== notificationId))
    } catch (error) {
      console.error('Error deleting notification:', error)
    }
  }

  const unreadCount = notifications.filter(n => !n.read).length

  function groupNotificationsByDate(notifications: Notification[]) {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const weekAgo = new Date(today)
    weekAgo.setDate(weekAgo.getDate() - 7)

    const groups: Record<string, Notification[]> = {
      'Today': [],
      'Yesterday': [],
      'This Week': [],
      'Older': []
    }

    notifications.forEach(notification => {
      const notificationDate = new Date(notification.created_at)
      const notificationDay = new Date(notificationDate.getFullYear(), notificationDate.getMonth(), notificationDate.getDate())

      if (notificationDay.getTime() === today.getTime()) {
        groups['Today'].push(notification)
      } else if (notificationDay.getTime() === yesterday.getTime()) {
        groups['Yesterday'].push(notification)
      } else if (notificationDate >= weekAgo) {
        groups['This Week'].push(notification)
      } else {
        groups['Older'].push(notification)
      }
    })

    // Remove empty groups
    return Object.entries(groups).filter(([_, notifications]) => notifications.length > 0)
  }

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'waitlist_promoted':
      case 'waitlist_position_improved':
      case 'booking_confirmed':
        return 'border-green-500 bg-green-50'
      case 'waitlist_position_changed':
        return 'border-blue-500 bg-blue-50'
      case 'booking_cancelled':
        return 'border-red-500 bg-red-50'
      case 'event_updated':
        return 'border-yellow-500 bg-yellow-50'
      case 'event_reminder':
        return 'border-purple-500 bg-purple-50'
      case 'event_creator_request':
        return 'border-amber-500 bg-amber-50'
      default:
        return 'border-gray-500 bg-gray-50'
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
<div className="max-w-4xl mx-auto -mx-4 sm:mx-0 px-0 py-6 sm:py-8 pb-20">
          <Card>
            <CardHeader>
              <Skeleton className="h-8 w-48" />
            </CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-20">
<div className="max-w-4xl mx-auto -mx-4 sm:mx-0 px-0 py-6 sm:py-8">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight">Notifications</CardTitle>
          </CardHeader>
          <CardContent>
            {notifications.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-6xl mb-4">🔔</div>
                <p className="text-muted-foreground text-lg font-medium mb-2">No notifications yet</p>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  You'll see notifications here when your booking status changes
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {groupNotificationsByDate(notifications).map(([dateGroup, groupNotifications]) => (
                  <div key={dateGroup} className="space-y-3">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide px-1">
                      {dateGroup}
                    </h3>
                    {groupNotifications.map((notification) => {
                      const offset = swipeOffset[notification.id] || 0
                      const direction = swipeDirection[notification.id]
                      const showDelete = direction === 'left' && offset < -50
                      const showTime = direction === 'right' && offset > 50

                      return (
                        <div
                          key={notification.id}
                          className="relative overflow-hidden"
                          onTouchStart={(e) => handleTouchStart(e, notification.id)}
                          onTouchMove={(e) => handleTouchMove(e, notification.id)}
                          onTouchEnd={() => handleTouchEnd(notification.id)}
                        >
                          {/* Delete button (revealed on swipe left) */}
                          <div
                            className={cn(
                              "absolute right-0 top-0 h-full flex items-center justify-center bg-destructive text-destructive-foreground px-6 z-10 transition-transform duration-200",
                              showDelete ? 'translate-x-0' : 'translate-x-full'
                            )}
                            style={{ width: '100px' }}
                          >
                            <span className="text-sm font-medium">Delete</span>
                          </div>

                          {/* Time display (revealed on swipe right) */}
                          <div
                            className={cn(
                              "absolute left-0 top-0 h-full flex items-center justify-center bg-muted text-muted-foreground px-4 z-10 transition-transform duration-200",
                              showTime ? 'translate-x-0' : '-translate-x-full'
                            )}
                            style={{ width: '80px' }}
                          >
                            <span className="text-xs font-medium">
                              {formatTime(notification.created_at)}
                            </span>
                          </div>

                          {/* Notification card */}
                          <Card
                            className={cn(
                              "border-l-4 transition-all shadow-sm cursor-pointer relative z-20",
                              notification.read
                                ? 'bg-muted/30 border-muted'
                                : getNotificationColor(notification.type),
                              (offset < 0 || offset > 0) && 'shadow-lg'
                            )}
                            style={{
                              transform: `translateX(${offset}px)`,
                              transition: swipingId === notification.id ? 'none' : 'transform 0.2s ease-out'
                            }}
                            onClick={() => handleNotificationClick(notification)}
                          >
                            <CardContent className="p-4">
                              <div className="flex items-start gap-3">
                                <div className="flex-1 min-w-0 space-y-1">
                                  <div className="flex items-center gap-2">
                                    <h3 className={cn(
                                      "font-semibold text-sm",
                                      notification.read ? 'text-muted-foreground' : 'text-foreground'
                                    )}>
                                      {notification.title}
                                    </h3>
                                    {!notification.read && (
                                      <Badge variant="default" className="h-2 w-2 p-0 rounded-full" />
                                    )}
                                  </div>
                                  <p className={cn(
                                    "text-sm leading-relaxed",
                                    notification.read ? 'text-muted-foreground' : 'text-foreground'
                                  )}>
                                    {notification.message}
                                  </p>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
