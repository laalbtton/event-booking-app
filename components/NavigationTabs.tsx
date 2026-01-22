'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function NavigationTabs() {
  const pathname = usePathname()
  const router = useRouter()
  const [userRole, setUserRole] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    checkUserRole()
  }, [])

  useEffect(() => {
    let channel: any = null
    let refreshInterval: NodeJS.Timeout | null = null

    async function setupNotifications() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Load initial count
      await loadUnreadCount()
      
      // Set up real-time subscription for notifications
      // Use a unique channel name per user to avoid conflicts
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
          (payload) => {
            console.log('New notification received:', payload)
            // Immediately update count when new notification is inserted
            loadUnreadCount()
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            console.log('Notification updated:', payload)
            // Update count when notification is marked as read/unread
            loadUnreadCount()
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'DELETE',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            console.log('Notification deleted')
            // Update count when notification is deleted
            loadUnreadCount()
          }
        )
        .subscribe((status) => {
          console.log('Notifications subscription status:', status)
          if (status === 'SUBSCRIBED') {
            console.log('Successfully subscribed to notifications')
          } else if (status === 'CHANNEL_ERROR') {
            console.error('Error subscribing to notifications')
            // Retry after a delay
            setTimeout(() => {
              loadUnreadCount()
            }, 1000)
          }
        })

      // Fallback: Periodic refresh every 30 seconds to ensure count stays updated
      // This helps catch any notifications that might be missed by real-time
      refreshInterval = setInterval(() => {
        loadUnreadCount()
      }, 30000) // 30 seconds
    }

    setupNotifications()

    return () => {
      if (channel) {
        console.log('Cleaning up notifications subscription')
        supabase.removeChannel(channel)
      }
      if (refreshInterval) {
        clearInterval(refreshInterval)
      }
    }
  }, [])

  async function loadUnreadCount() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
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

      if (count !== null) {
        setUnreadCount(count)
      } else {
        setUnreadCount(0)
      }
    } catch (error) {
      console.error('Exception loading unread count:', error)
    }
  }

  async function checkUserRole() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile) {
      setUserRole(profile.role)
      setIsAdmin(profile.role === 'admin')
    } else {
      // Fallback: check admin_users table
      const { data: adminData } = await supabase
        .from('admin_users')
        .select('*')
        .eq('user_id', user.id)
        .single()

      setIsAdmin(!!adminData)
      setUserRole(adminData ? 'admin' : 'performer')
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/')
  }

  const isActive = (path: string) => pathname === path || pathname?.startsWith(path + '/')

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white shadow-lg border-t border-gray-200 z-50 safe-area-inset-bottom">
      <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-8">
        <nav className="flex items-center justify-around py-2 sm:justify-between">
          <div className="flex items-center gap-1 sm:gap-2 flex-1 sm:flex-initial justify-around sm:justify-start">
            <Link
              href="/dashboard"
              className={`flex flex-col items-center gap-1 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg transition-colors ${
                isActive('/dashboard')
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              <span className="text-xs font-medium">Dashboard</span>
            </Link>

            <Link
              href="/profile"
              className={`flex flex-col items-center gap-1 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg transition-colors ${
                isActive('/profile') && !pathname?.startsWith('/profile/')
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span className="text-xs font-medium">Profile</span>
            </Link>

            {(userRole === 'event_creator' || userRole === 'admin') && (
              <Link
                href="/events/manage"
                className={`flex flex-col items-center gap-1 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg transition-colors ${
                  isActive('/events/manage')
                    ? 'bg-green-50 text-green-600'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="text-xs font-medium text-center leading-tight hidden sm:inline">Manage Events</span>
                <span className="text-xs font-medium text-center leading-tight sm:hidden">Events</span>
              </Link>
            )}

            {isAdmin && (
              <Link
                href="/admin"
                className={`flex flex-col items-center gap-1 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg transition-colors ${
                  isActive('/admin')
                    ? 'bg-purple-50 text-purple-600'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="text-xs font-medium text-center leading-tight">Admin</span>
              </Link>
            )}
          </div>

          <div className="flex items-center gap-1 sm:gap-2 flex-1 sm:flex-initial justify-around sm:justify-end">
            <Link
              href="/notifications"
              className={`relative flex flex-col items-center gap-1 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg transition-colors ${
                isActive('/notifications')
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute top-0 right-0 bg-red-500 text-white text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center text-[10px]">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
              <span className="text-xs font-medium hidden sm:inline">Notifications</span>
              <span className="text-xs font-medium sm:hidden">Alerts</span>
            </Link>

            <button
              onClick={handleSignOut}
              className="flex flex-col items-center gap-1 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span className="text-xs font-medium">Logout</span>
            </button>
          </div>
        </nav>
      </div>
    </div>
  )
}
