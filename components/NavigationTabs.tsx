'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Home, MessageSquare, Mic, MoreHorizontal, LogOut, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthBootstrap } from '@/components/providers/auth-bootstrap-provider'
import { signOutAndCleanup } from '@/lib/authClient'

export default function NavigationTabs() {
  const pathname = usePathname()
  const router = useRouter()
  const { authResolved, user } = useAuthBootstrap()
  const [userRole, setUserRole] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [isVenueStaff, setIsVenueStaff] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [userId, setUserId] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState('')
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const warnedRealtimeRef = useRef(false)
  const [feedbackForm, setFeedbackForm] = useState({
    email: '',
    rating: '',
    message: '',
  })

  useEffect(() => {
    if (!authResolved) return
    if (!user) {
      setUserRole(null)
      setIsAdmin(false)
      setIsVenueStaff(false)
      setUserId(null)
      setUserEmail('')
      setUnreadCount(0)
      return
    }
    void checkUserRole(user.id, user.email || '')
  }, [authResolved, user])

  useEffect(() => {
    if (feedbackOpen && userEmail && !feedbackForm.email) {
      setFeedbackForm((prev) => ({ ...prev, email: userEmail }))
    }
  }, [feedbackOpen, userEmail, feedbackForm.email])

  useEffect(() => {
    let channel: any = null
    let refreshInterval: NodeJS.Timeout | null = null

    async function setupNotifications() {
      try {
        if (!user) return

        // Load initial count
        await loadUnreadCount()
        
        // Set up real-time subscription for notifications
        // Use a unique channel name per user to avoid conflicts
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
              if (status === 'SUBSCRIBED') {
                console.log('Successfully subscribed to notifications')
              } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                // Fallback to periodic refresh; avoid spamming console
                if (!warnedRealtimeRef.current) {
                  console.debug('Notifications subscription unavailable, using periodic refresh')
                  warnedRealtimeRef.current = true
                }
              }
            })
        } catch (subscriptionError) {
          // If subscription fails, we'll rely on periodic refresh
          if (!warnedRealtimeRef.current) {
            console.debug('Failed to set up notifications subscription, using periodic refresh')
            warnedRealtimeRef.current = true
          }
        }

        // Fallback: Periodic refresh every 30 seconds to ensure count stays updated
        // This helps catch any notifications that might be missed by real-time
        refreshInterval = setInterval(() => {
          loadUnreadCount()
        }, 30000) // 30 seconds
      } catch (error) {
        // If setup fails completely, still try to load count periodically
        if (!warnedRealtimeRef.current) {
          console.debug('Error setting up notifications, using periodic refresh only')
          warnedRealtimeRef.current = true
        }
        refreshInterval = setInterval(() => {
          loadUnreadCount()
        }, 30000)
      }
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
  }, [authResolved, user?.id])

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

      if (count !== null) {
        setUnreadCount(count)
      } else {
        setUnreadCount(0)
      }
    } catch (error) {
      console.error('Exception loading unread count:', error)
    }
  }

  async function checkUserRole(userIdValue: string, userEmailValue: string) {
    setUserId(userIdValue)
    setUserEmail(userEmailValue)

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userIdValue)
      .single()

    if (profile) {
      setUserRole(profile.role)
      setIsAdmin(profile.role === 'admin')
    } else {
      // Fallback: check admin_users table
      const { data: adminData } = await supabase
        .from('admin_users')
        .select('*')
        .eq('user_id', userIdValue)
        .single()

      setIsAdmin(!!adminData)
      setUserRole(adminData ? 'admin' : 'performer')
    }

    const { data: venueStaffRow } = await supabase
      .from('venue_staff')
      .select('id')
      .eq('user_id', userIdValue)
      .eq('active', true)
      .limit(1)
      .maybeSingle()
    setIsVenueStaff(!!venueStaffRow)
  }

  async function handleSignOut() {
    await signOutAndCleanup()
    router.push('/')
  }

  async function handleSubmitFeedback(e: React.FormEvent) {
    e.preventDefault()
    if (!feedbackForm.message.trim()) {
      alert('Please enter your feedback.')
      return
    }

    setFeedbackSubmitting(true)
    try {
      const payload = {
        email: feedbackForm.email || userEmail || '',
        rating: feedbackForm.rating ? Number(feedbackForm.rating) : null,
        message: feedbackForm.message.trim(),
        path: pathname || '',
        userId,
        userRole,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      }

      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        throw new Error('Failed to send feedback')
      }

      alert('Thanks for the feedback!')
      setFeedbackForm((prev) => ({ ...prev, rating: '', message: '' }))
      setFeedbackOpen(false)
    } catch (error) {
      console.error('Error sending feedback:', error)
      alert('Sorry, we could not send your feedback. Please try again.')
    } finally {
      setFeedbackSubmitting(false)
    }
  }

  const isActive = (path: string) => pathname === path || pathname?.startsWith(path + '/')
  const navItemClass =
    'flex flex-col items-center gap-1 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg transition-colors'

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-zinc-900 shadow-lg border-t border-gray-200 dark:border-zinc-800 z-50 safe-area-inset-bottom">
      <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-8">
        <nav className="flex items-center justify-around py-2 sm:justify-between">
          <div className="flex items-center gap-1 sm:gap-2 flex-1 justify-around">
            <Link
              href="/profile"
              className={`${navItemClass} ${
                isActive('/profile') && !pathname?.startsWith('/profile/')
                  ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400'
                  : 'text-gray-600 dark:text-zinc-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-zinc-800'
              }`}
            >
              <Home className="w-5 h-5" />
              <span className="text-xs font-medium">Home</span>
            </Link>

            <Link
              href="/dashboard"
              className={`${navItemClass} ${
                isActive('/dashboard')
                  ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400'
                  : 'text-gray-600 dark:text-zinc-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-zinc-800'
              }`}
            >
              <Mic className="w-5 h-5" />
              <span className="text-xs font-medium">Perform</span>
            </Link>

            {(userRole === 'event_creator' || userRole === 'admin') && (
              <Link
                href="/events/manage"
                className={`${navItemClass} ${
                  isActive('/events/manage')
                    ? 'bg-green-50 dark:bg-green-950/50 text-green-600 dark:text-green-400'
                    : 'text-gray-600 dark:text-zinc-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-zinc-800'
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
                className={`${navItemClass} ${
                  isActive('/admin')
                    ? 'bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400'
                    : 'text-gray-600 dark:text-zinc-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-zinc-800'
                }`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="text-xs font-medium text-center leading-tight">Admin</span>
              </Link>
            )}

            {(!isAdmin && isVenueStaff) && (
              <Link
                href="/venues/redemptions"
                className={`${navItemClass} ${
                  isActive('/venues/redemptions')
                    ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400'
                    : 'text-gray-600 dark:text-zinc-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-zinc-800'
                }`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a5 5 0 10-10 0v2m-2 0h14l-1 10H6L5 9z" />
                </svg>
                <span className="text-xs font-medium text-center leading-tight">Venue</span>
              </Link>
            )}
            <Link
              href="/notifications"
              className={`relative ${navItemClass} ${
                isActive('/notifications')
                  ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400'
                  : 'text-gray-600 dark:text-zinc-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-zinc-800'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {unreadCount > 0 && (
                <Badge 
                  variant="destructive" 
                  className="absolute top-0 right-0 w-4 h-4 flex items-center justify-center text-[10px] p-0 rounded-full"
                >
                  {unreadCount > 9 ? '9+' : unreadCount}
                </Badge>
              )}
              <span className="text-xs font-medium hidden sm:inline">Notifications</span>
              <span className="text-xs font-medium sm:hidden">Alerts</span>
            </Link>
            <Button
              onClick={() => setMoreOpen(true)}
              variant="ghost"
              size="sm"
              className={`${navItemClass} h-auto text-gray-600 dark:text-zinc-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-zinc-800`}
            >
              <MoreHorizontal className="w-5 h-5" />
              <span className="text-xs font-medium">More</span>
            </Button>
          </div>
        </nav>
      </div>

      <Dialog open={feedbackOpen} onOpenChange={setFeedbackOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Send Feedback</DialogTitle>
            <DialogDescription>
              Help us improve during alpha testing.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmitFeedback} className="space-y-4">
            <div>
              <Label htmlFor="feedback-email">Your Email (optional)</Label>
              <Input
                id="feedback-email"
                type="email"
                value={feedbackForm.email}
                onChange={(e) => setFeedbackForm((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="you@example.com"
              />
            </div>

            <div>
              <Label htmlFor="feedback-rating">Rating (optional)</Label>
              <select
                id="feedback-rating"
                value={feedbackForm.rating}
                onChange={(e) => setFeedbackForm((prev) => ({ ...prev, rating: e.target.value }))}
                className="w-full px-4 py-2 border border-input bg-background rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Select rating</option>
                <option value="5">5 - Excellent</option>
                <option value="4">4 - Good</option>
                <option value="3">3 - Okay</option>
                <option value="2">2 - Needs work</option>
                <option value="1">1 - Poor</option>
              </select>
            </div>

            <div>
              <Label htmlFor="feedback-message">Feedback *</Label>
              <Textarea
                id="feedback-message"
                value={feedbackForm.message}
                onChange={(e) => setFeedbackForm((prev) => ({ ...prev, message: e.target.value }))}
                placeholder="What worked well? What needs improvement?"
                rows={4}
                required
              />
            </div>

            <div className="flex gap-3">
              <Button type="submit" disabled={feedbackSubmitting} className="flex-1">
                {feedbackSubmitting ? 'Sending...' : 'Send Feedback'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setFeedbackOpen(false)}
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>More</DialogTitle>
            <DialogDescription>Quick actions</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => {
                setMoreOpen(false)
                setFeedbackOpen(true)
              }}
            >
              <MessageSquare className="w-4 h-4 mr-2" />
              Feedback
            </Button>
            <Button
              asChild
              variant="outline"
              className="w-full justify-start"
              onClick={() => setMoreOpen(false)}
            >
              <Link href="/settings">
                <Settings className="w-4 h-4 mr-2 inline" />
                Settings
              </Link>
            </Button>
            <Button
              variant="destructive"
              className="w-full justify-start"
              onClick={handleSignOut}
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign out
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
