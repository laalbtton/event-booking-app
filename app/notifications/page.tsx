'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import NavigationTabs from '@/components/NavigationTabs'
import { formatDateTime } from '@/lib/dateUtils'
import Link from 'next/link'

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
  const [markingRead, setMarkingRead] = useState<string | null>(null)

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
      setNotifications(data || [])
    } catch (error) {
      console.error('Error loading notifications:', error)
    } finally {
      setLoading(false)
    }
  }

  async function markAsRead(notificationId: string) {
    if (markingRead === notificationId) return
    
    setMarkingRead(notificationId)
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
    } finally {
      setMarkingRead(null)
    }
  }

  async function markAllAsRead() {
    const unreadIds = notifications.filter(n => !n.read).map(n => n.id)
    if (unreadIds.length === 0) return

    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .in('id', unreadIds)

      if (error) throw error

      // Update local state
      setNotifications(prev =>
        prev.map(n => ({ ...n, read: true }))
      )
    } catch (error) {
      console.error('Error marking all as read:', error)
    }
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

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'waitlist_promoted':
        return '🎉'
      case 'waitlist_position_improved':
        return '⬆️'
      case 'waitlist_position_changed':
        return '📊'
      case 'booking_confirmed':
        return '✅'
      case 'booking_cancelled':
        return '❌'
      case 'event_updated':
        return '📝'
      case 'event_reminder':
        return '📅'
      default:
        return '🔔'
    }
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
      default:
        return 'border-gray-500 bg-gray-50'
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <NavigationTabs />
        <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
          <div className="text-center">Loading notifications...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <NavigationTabs />

      <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
              {unreadCount > 0 && (
                <p className="text-sm text-gray-600 mt-1">
                  {unreadCount} unread notification{unreadCount !== 1 ? 's' : ''}
                </p>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
              >
                Mark all as read
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">🔔</div>
              <p className="text-gray-600 text-lg">No notifications yet</p>
              <p className="text-gray-500 text-sm mt-2">
                You'll see notifications here when your booking status changes
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`border-l-4 rounded-lg p-4 transition-all ${
                    notification.read
                      ? 'bg-gray-50 border-gray-300'
                      : `${getNotificationColor(notification.type)} border-opacity-100`
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="text-2xl flex-shrink-0">
                      {getNotificationIcon(notification.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <h3 className={`font-semibold text-sm ${
                            notification.read ? 'text-gray-700' : 'text-gray-900'
                          }`}>
                            {notification.title}
                          </h3>
                          <p className={`text-sm mt-1 ${
                            notification.read ? 'text-gray-600' : 'text-gray-800'
                          }`}>
                            {notification.message}
                          </p>
                          <p className="text-xs text-gray-500 mt-2">
                            {formatDateTime(notification.created_at)}
                          </p>
                        </div>
                        {!notification.read && (
                          <div className="flex-shrink-0 w-2 h-2 bg-blue-600 rounded-full mt-1"></div>
                        )}
                      </div>
                      
                      {(notification.related_event_id || notification.related_booking_id) && (
                        <div className="mt-3 flex gap-2">
                          {notification.related_event_id && (
                            <Link
                              href={`/events/${notification.related_event_id}`}
                              className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                              onClick={() => markAsRead(notification.id)}
                            >
                              View Event →
                            </Link>
                          )}
                          {notification.related_booking_id && (
                            <Link
                              href="/dashboard"
                              className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                              onClick={() => markAsRead(notification.id)}
                            >
                              View Booking →
                            </Link>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-2 flex-shrink-0">
                      {!notification.read && (
                        <button
                          onClick={() => markAsRead(notification.id)}
                          disabled={markingRead === notification.id}
                          className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50 disabled:opacity-50"
                        >
                          {markingRead === notification.id ? '...' : 'Mark read'}
                        </button>
                      )}
                      <button
                        onClick={() => deleteNotification(notification.id)}
                        className="text-xs text-gray-500 hover:text-red-600 px-2 py-1 rounded hover:bg-gray-100"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
