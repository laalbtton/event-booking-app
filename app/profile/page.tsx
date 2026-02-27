'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Profile, Event } from '@/lib/supabase'
import { formatDateTime, formatDate, formatTime } from '@/lib/dateUtils'
import NavigationTabs from '@/components/NavigationTabs'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthBootstrap } from '@/components/providers/auth-bootstrap-provider'
import { signOutAndCleanup } from '@/lib/authClient'

type EventBooking = {
  id: string
  event_id: string
  title: string
  date: string
  location: string
  booked_at: string
  credits_used: number
  status: string
  attendance_status: string | null
  waitlist_position: number | null
  event_status?: string | null
}

type InviteItem = {
  id: string
  status: 'pending' | 'accepted' | 'declined'
  created_at: string
  events: {
    id: string
    title: string
    date: string
    location: string | null
  }
}

export default function ProfilePage() {
  const { authResolved, user } = useAuthBootstrap()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [eventBookings, setEventBookings] = useState<EventBooking[]>([])
  const [invites, setInvites] = useState<InviteItem[]>([])
  const [respondingInvite, setRespondingInvite] = useState<string | null>(null)
  const [attendedCount, setAttendedCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [authAvatarUrl, setAuthAvatarUrl] = useState<string | null>(null)
  const [swipingId, setSwipingId] = useState<string | null>(null)
  const [swipeOffset, setSwipeOffset] = useState<Record<string, number>>({})
  const [swipeDirection, setSwipeDirection] = useState<Record<string, 'right' | 'left'>>({})
  const [instagramConnected, setInstagramConnected] = useState(false)
  const [instagramUsername, setInstagramUsername] = useState<string | null>(null)
  const [globalAutoPostEnabled, setGlobalAutoPostEnabled] = useState(false)
  const [autopostLoading, setAutopostLoading] = useState(false)
  const [autopostJobs, setAutopostJobs] = useState<any[]>([])
  const touchStartX = useRef<Record<string, number>>({})
  const touchStartY = useRef<Record<string, number>>({})
  const router = useRouter()

  const [formData, setFormData] = useState({
    full_name: '',
    bio: '',
    website_link: '',
    instagram_link: '',
    youtube_link: '',
    twitter_link: ''
  })

  useEffect(() => {
    if (!authResolved) return
    if (!user) {
      setLoading(false)
      router.push('/login')
      return
    }

    const avatar = user.user_metadata?.avatar_url || user.user_metadata?.picture || null
    setAuthAvatarUrl(avatar)
    setAvatarUrl(avatar)
    setLoading(true)
    void loadProfile(user.id)
  }, [authResolved, user, router])

  // Generate initials from name
  function getInitials(name: string | null | undefined): string {
    if (!name) return '?'
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    }
    return name.substring(0, 2).toUpperCase()
  }

  function copyPublicProfileLink() {
    if (!profile) return
    const publicUrl = `${window.location.origin}/profile/${profile.id}`
    navigator.clipboard.writeText(publicUrl)
    alert('Public profile link copied to clipboard!')
  }

  async function handleSignOut() {
    await signOutAndCleanup()
    router.push('/')
  }

  async function loadProfile(userId: string) {
    setLoading(true)
    try {
      // Load profile
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (profileError) throw profileError
      setProfile(profileData)

      // Prefer stored avatar_url, fallback to auth metadata
      const resolvedAvatar = profileData.avatar_url || authAvatarUrl
      setAvatarUrl(resolvedAvatar || null)

      // Persist Google avatar to profiles if missing
      if (!profileData.avatar_url && authAvatarUrl) {
        await supabase
          .from('profiles')
          .update({ avatar_url: authAvatarUrl, updated_at: new Date().toISOString() })
          .eq('id', userId)
      }
      
      // Set form data
      setFormData({
        full_name: profileData.full_name || '',
        bio: profileData.bio || '',
        website_link: profileData.website_link || '',
        instagram_link: profileData.instagram_link || '',
        youtube_link: profileData.youtube_link || '',
        twitter_link: profileData.twitter_link || ''
      })

      // Load all bookings where credits were used (attended, cancelled, no_show, etc.)
      const { data: bookingsData, error: bookingsError } = await supabase
        .from('bookings')
        .select(`
          id,
          event_id,
          credits_used,
          status,
          attendance_status,
          waitlist_position,
          booked_at,
          events (
            id,
            title,
            date,
            location,
            status
          )
        `)
        .eq('user_id', userId)
        .gt('credits_used', 0)
        .order('booked_at', { ascending: false })

      if (bookingsError) throw bookingsError
      
      const events = (bookingsData || []).map((b: any) => ({
        id: b.id,
        event_id: b.events.id,
        title: b.events.title,
        date: b.events.date,
        location: b.events.location,
        booked_at: b.booked_at,
        credits_used: b.credits_used,
        status: b.status,
        attendance_status: b.attendance_status,
        waitlist_position: b.waitlist_position,
        event_status: b.events.status
      }))
      setEventBookings(events)

      // Get attended count
      const attended = events.filter(e => e.attendance_status === 'attended').length
      setAttendedCount(attended)

      const { data: invitesData, error: invitesError } = await supabase
        .from('event_invites')
        .select(`
          id,
          status,
          created_at,
          events (
            id,
            title,
            date,
            location
          )
        `)
        .eq('invited_user_id', userId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })

      if (!invitesError) {
        setInvites(invitesData as any)
      }

      await loadPosterAutomationState(userId)

    } catch (error: any) {
      console.error('Error loading profile:', error)
      alert('Error loading profile: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  async function loadPosterAutomationState(userId: string) {
    const { data: socialRows } = await supabase
      .from('social_accounts')
      .select('account_username, is_active')
      .eq('user_id', userId)
      .eq('provider', 'instagram')
      .eq('is_active', true)
      .limit(1)

    const social = socialRows && socialRows[0]
    setInstagramConnected(!!social)
    setInstagramUsername(social?.account_username || null)

    const { data: prefRows } = await supabase
      .from('poster_auto_post_prefs')
      .select('auto_post_enabled')
      .eq('user_id', userId)
      .is('event_id', null)
      .limit(1)

    setGlobalAutoPostEnabled(!!prefRows?.[0]?.auto_post_enabled)

    const { data: sessionData } = await supabase.auth.getSession()
    const accessToken = sessionData.session?.access_token
    if (!accessToken) {
      setAutopostJobs([])
      return
    }

    const jobsResponse = await fetch('/api/poster-autopost/jobs?mine=true', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const jobsResult = await jobsResponse.json().catch(() => ({}))
    if (jobsResponse.ok) {
      setAutopostJobs(Array.isArray(jobsResult.jobs) ? jobsResult.jobs.slice(0, 6) : [])
    }
  }

  async function handleConnectInstagram() {
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (!accessToken) throw new Error('Not authenticated')

      const response = await fetch('/api/social/instagram/connect?redirect=/profile', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.connectUrl) throw new Error(result.error || 'Failed to start OAuth')
      window.location.href = result.connectUrl
    } catch (error: any) {
      alert(error.message || 'Could not connect Instagram')
    }
  }

  async function handleDisconnectInstagram() {
    try {
      setAutopostLoading(true)
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (!accessToken) throw new Error('Not authenticated')

      const response = await fetch('/api/social/instagram/disconnect', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Failed to disconnect')

      if (profile) await loadPosterAutomationState(profile.id)
    } catch (error: any) {
      alert(error.message || 'Could not disconnect Instagram')
    } finally {
      setAutopostLoading(false)
    }
  }

  async function updateGlobalAutoPost(enabled: boolean) {
    try {
      setAutopostLoading(true)
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (!accessToken) throw new Error('Not authenticated')

      const response = await fetch('/api/poster-autopost/preferences', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ eventId: null, enabled }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Failed to update preference')
      setGlobalAutoPostEnabled(enabled)
    } catch (error: any) {
      alert(error.message || 'Could not update auto-post setting')
    } finally {
      setAutopostLoading(false)
    }
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return

    setSubmitting(true)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: formData.full_name,
          bio: formData.bio,
          website_link: formData.website_link || null,
          instagram_link: formData.instagram_link || null,
          youtube_link: formData.youtube_link || null,
          twitter_link: formData.twitter_link || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', profile.id)

      if (error) throw error

      setIsEditing(false)
      await loadProfile(profile.id)
      alert('Profile updated successfully!')
    } catch (error: any) {
      console.error('Error updating profile:', error)
      alert('Error updating profile: ' + error.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function respondToInvite(inviteId: string, action: 'accept' | 'decline') {
    setRespondingInvite(inviteId)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      const response = await fetch('/api/invites/respond', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ inviteId, action }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to respond to invite')
      }

      if (profile) {
        await loadProfile(profile.id)
      }
    } catch (error: any) {
      console.error('Error responding to invite:', error)
      alert('Error responding to invite: ' + error.message)
    } finally {
      setRespondingInvite(null)
    }
  }

  function handleTouchStart(e: React.TouchEvent, rowId: string) {
    touchStartX.current[rowId] = e.touches[0].clientX
    touchStartY.current[rowId] = e.touches[0].clientY
    setSwipingId(rowId)
  }

  function handleTouchMove(e: React.TouchEvent, rowId: string) {
    if (swipingId !== rowId) return

    const currentX = e.touches[0].clientX
    const currentY = e.touches[0].clientY
    const startX = touchStartX.current[rowId]
    const startY = touchStartY.current[rowId]

    const deltaX = currentX - startX
    const deltaY = Math.abs(currentY - startY)

    if (deltaY < 50) {
      if (deltaX > 0) {
        const offset = Math.min(deltaX, 100)
        setSwipeOffset(prev => ({ ...prev, [rowId]: offset }))
        setSwipeDirection(prev => ({ ...prev, [rowId]: 'right' }))
      } else if (deltaX < 0) {
        const offset = Math.max(deltaX, -40)
        setSwipeOffset(prev => ({ ...prev, [rowId]: offset }))
        setSwipeDirection(prev => ({ ...prev, [rowId]: 'left' }))
      }
    }
  }

  function handleTouchEnd(rowId: string) {
    const offset = swipeOffset[rowId] || 0
    const direction = swipeDirection[rowId]

    if (direction === 'right' && offset > 50) {
      setTimeout(() => {
        setSwipeOffset(prev => {
          const next = { ...prev }
          delete next[rowId]
          return next
        })
        setSwipeDirection(prev => {
          const next = { ...prev }
          delete next[rowId]
          return next
        })
        setSwipingId(null)
      }, 2000)
    } else {
      setSwipeOffset(prev => {
        const next = { ...prev }
        delete next[rowId]
        return next
      })
      setSwipeDirection(prev => {
        const next = { ...prev }
        delete next[rowId]
        return next
      })
      setSwipingId(null)
    }

    touchStartX.current[rowId] = 0
    touchStartY.current[rowId] = 0
  }

  if (!authResolved || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="space-y-4">
              <Skeleton className="h-20 w-20 rounded-full mx-auto" />
              <Skeleton className="h-8 w-3/4 mx-auto" />
              <Skeleton className="h-4 w-full" />
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">Profile not found</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Navigation Tabs */}
      <NavigationTabs />

      <div className="max-w-4xl mx-auto px-4 py-6 sm:py-8 sm:px-6 lg:px-8">
        {/* Profile Card */}
        <Card className="mb-6 shadow-sm">
          <CardContent className="p-6 sm:p-8">
          {!isEditing ? (
            <>
            <div className="flex items-start gap-4 sm:gap-6 mb-6">
              {/* Profile Picture */}
              <Avatar className="w-20 h-20 sm:w-24 sm:h-24 border-2 border-border">
                <AvatarImage src={avatarUrl || undefined} alt={profile.full_name || 'Profile'} />
                <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white text-2xl font-bold">
                  {getInitials(profile.full_name)}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1 min-w-0">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
                  <div className="min-w-0">
                    <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-1 truncate">
                      {profile.full_name || 'No name set'}
                    </h2>
                    <p className="text-sm text-muted-foreground truncate">{profile.email}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    <Button
                      onClick={copyPublicProfileLink}
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9"
                      title="Share Profile"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                      </svg>
                    </Button>
                    <Button
                      onClick={() => setIsEditing(true)}
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9"
                      title="Edit Profile"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </Button>
                    <Button
                      onClick={handleSignOut}
                      variant="outline"
                      size="sm"
                      className="h-9"
                    >
                      <LogOut className="w-4 h-4 mr-2" />
                      Sign out
                    </Button>
                  </div>
                </div>

                {/* Consolidated Stats - Horizontal Layout */}
                <div className="flex items-center gap-6 pt-4 border-t">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-muted-foreground">Credits:</span>
                    <span className="text-lg sm:text-xl font-bold text-primary">{profile.credits}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-muted-foreground">Attended:</span>
                    <span className="text-lg sm:text-xl font-bold text-green-600">{attendedCount}</span>
                  </div>
                </div>
              </div>
            </div>

            {profile.bio && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold mb-2 tracking-tight">Bio</h3>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{profile.bio}</p>
              </div>
            )}

            {/* Social Links */}
            {(profile.website_link || profile.instagram_link || profile.youtube_link || profile.twitter_link) && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold mb-3 tracking-tight">Social Links</h3>
                <div className="flex flex-wrap gap-2">
                  {profile.website_link && (
                    <Button variant="outline" size="sm" asChild>
                      <a href={profile.website_link} target="_blank" rel="noopener noreferrer">
                        🌐 Website
                      </a>
                    </Button>
                  )}
                  {profile.instagram_link && (
                    <Button variant="outline" size="sm" className="bg-pink-50 hover:bg-pink-100 border-pink-200" asChild>
                      <a href={profile.instagram_link} target="_blank" rel="noopener noreferrer">
                        📷 Instagram
                      </a>
                    </Button>
                  )}
                  {profile.youtube_link && (
                    <Button variant="outline" size="sm" className="bg-red-50 hover:bg-red-100 border-red-200" asChild>
                      <a href={profile.youtube_link} target="_blank" rel="noopener noreferrer">
                        ▶️ YouTube
                      </a>
                    </Button>
                  )}
                  {profile.twitter_link && (
                    <Button variant="outline" size="sm" className="bg-sky-50 hover:bg-sky-100 border-sky-200" asChild>
                      <a href={profile.twitter_link} target="_blank" rel="noopener noreferrer">
                        🐦 Twitter
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            )}

            </>
          ) : (
            <form onSubmit={handleSaveProfile} className="space-y-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <CardTitle className="text-2xl sm:text-3xl font-bold tracking-tight">Edit Profile</CardTitle>
                <div className="flex gap-2 w-full sm:w-auto">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsEditing(false)
                      setFormData({
                        full_name: profile.full_name || '',
                        bio: profile.bio || '',
                        website_link: profile.website_link || '',
                        instagram_link: profile.instagram_link || '',
                        youtube_link: profile.youtube_link || '',
                        twitter_link: profile.twitter_link || ''
                      })
                    }}
                    className="flex-1 sm:flex-initial"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 sm:flex-initial"
                  >
                    {submitting ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>
              </div>

              <div className="space-y-2.5">
                <Label htmlFor="fullName" className="text-sm font-semibold">
                  Full Name *
                </Label>
                <Input
                  id="fullName"
                  type="text"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  required
                  className="h-11"
                />
              </div>

              <div className="space-y-2.5">
                <Label htmlFor="bio" className="text-sm font-semibold">
                  Bio
                </Label>
                <Textarea
                  id="bio"
                  value={formData.bio}
                  onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                  rows={4}
                  placeholder="Tell us about yourself..."
                />
              </div>

              <div className="space-y-2.5">
                <Label htmlFor="website" className="text-sm font-semibold">
                  Website
                </Label>
                <Input
                  id="website"
                  type="url"
                  value={formData.website_link}
                  onChange={(e) => setFormData({ ...formData, website_link: e.target.value })}
                  placeholder="https://example.com"
                  className="h-11"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2.5">
                  <Label htmlFor="instagram" className="text-sm font-semibold">
                    Instagram
                  </Label>
                  <Input
                    id="instagram"
                    type="url"
                    value={formData.instagram_link}
                    onChange={(e) => setFormData({ ...formData, instagram_link: e.target.value })}
                    placeholder="https://instagram.com/username"
                    className="h-11"
                  />
                </div>

                <div className="space-y-2.5">
                  <Label htmlFor="youtube" className="text-sm font-semibold">
                    YouTube
                  </Label>
                  <Input
                    id="youtube"
                    type="url"
                    value={formData.youtube_link}
                    onChange={(e) => setFormData({ ...formData, youtube_link: e.target.value })}
                    placeholder="https://youtube.com/@username"
                    className="h-11"
                  />
                </div>

                <div className="space-y-2.5">
                  <Label htmlFor="twitter" className="text-sm font-semibold">
                    Twitter
                  </Label>
                  <Input
                    id="twitter"
                    type="url"
                    value={formData.twitter_link}
                    onChange={(e) => setFormData({ ...formData, twitter_link: e.target.value })}
                    placeholder="https://twitter.com/username"
                    className="h-11"
                  />
                </div>
              </div>
            </form>
          )}
          </CardContent>
        </Card>

        {/* Event Bookings */}
        {(eventBookings.length > 0 || invites.length > 0) ? (
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight">My Event Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="activity" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="activity">Activity</TabsTrigger>
                  <TabsTrigger value="invites">Invites</TabsTrigger>
                </TabsList>
                <TabsContent value="activity" className="pt-4">
                  {eventBookings.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">No recent activity.</p>
                  ) : (
                    (() => {
                      const rows = eventBookings.map((booking) => {
                        const isEventCancelled = booking.status === 'cancelled' && booking.event_status === 'cancelled'
                        const activity = isEventCancelled
                          ? 'Event cancelled'
                          : booking.status === 'cancelled'
                            ? 'Cancelled'
                            : 'Booked'
                        const activityDate =
                          booking.booked_at
                        const displayAmount =
                          activity === 'Booked' ? -booking.credits_used : booking.credits_used

                        return {
                          ...booking,
                          activity,
                          activityDate,
                          displayAmount,
                        }
                      })

                      rows.sort((a, b) => new Date(b.activityDate).getTime() - new Date(a.activityDate).getTime())

                      return (
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-border text-sm">
                            <tbody className="divide-y divide-border">
                              {(() => {
                                const formatActivityDate = (value: string) =>
                                  new Date(value).toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric',
                                  })

                                const grouped = rows.reduce((acc: Record<string, typeof rows>, row) => {
                                  const key = formatActivityDate(row.activityDate)
                                  if (!acc[key]) acc[key] = []
                                  acc[key].push(row)
                                  return acc
                                }, {})

                                const orderedDates: string[] = []
                                rows.forEach((row) => {
                                  const key = formatActivityDate(row.activityDate)
                                  if (!orderedDates.includes(key)) {
                                    orderedDates.push(key)
                                  }
                                })

                                return orderedDates.flatMap((groupDate) => [
                                  (
                                    <tr key={`${groupDate}-header`}>
                                      <td colSpan={3} className="px-4 py-2 text-xs font-semibold text-muted-foreground bg-muted/30">
                                        {groupDate}
                                      </td>
                                    </tr>
                                  ),
                                  ...(grouped[groupDate] || []).map((row) => (
                                    <tr
                                      key={row.id}
                                      className="hover:bg-muted/30"
                                      style={{ transform: `translateX(${swipeOffset[row.id] || 0}px)` }}
                                      onTouchStart={(e) => handleTouchStart(e, row.id)}
                                      onTouchMove={(e) => handleTouchMove(e, row.id)}
                                      onTouchEnd={() => handleTouchEnd(row.id)}
                                    >
                                      <td className="px-4 py-3">
                                        <div className="font-medium text-foreground truncate max-w-[220px] sm:max-w-[320px]">
                                          <Link href={`/events/${row.event_id}`} className="hover:underline">
                                            {row.title}
                                          </Link>
                                        </div>
                                        <div className="text-xs text-muted-foreground">{row.activity}</div>
                                      </td>
                                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                                        {new Date(row.date).toLocaleDateString('en-US', {
                                          month: 'short',
                                          day: 'numeric',
                                          year: 'numeric'
                                        })}
                                      </td>
                                      <td className="px-4 py-3 text-right text-muted-foreground">
                                        <div className="text-sm">
                                          {row.displayAmount > 0 ? '+' : ''}{row.displayAmount}
                                        </div>
                                        {swipeDirection[row.id] === 'right' && (swipeOffset[row.id] || 0) > 50 && (
                                          <div className="text-xs text-muted-foreground mt-1">
                                            {formatTime(row.activityDate)}
                                          </div>
                                        )}
                                      </td>
                                    </tr>
                                  ))
                                ])
                              })()}
                            </tbody>
                          </table>
                        </div>
                      )
                    })()
                  )}
                </TabsContent>
                <TabsContent value="invites" className="pt-4">
                  {invites.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">No invites right now.</p>
                  ) : (
                    <div className="space-y-3">
                      {invites.map((invite) => (
                        <div key={invite.id} className="flex items-center justify-between gap-3 p-3 border rounded-lg">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{invite.events.title}</p>
                            <p className="text-xs text-muted-foreground truncate">{formatDate(invite.events.date)}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              onClick={() => respondToInvite(invite.id, 'accept')}
                              disabled={respondingInvite === invite.id}
                            >
                              Accept
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => respondToInvite(invite.id, 'decline')}
                              disabled={respondingInvite === invite.id}
                            >
                              Decline
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        ) : (
          <Card className="shadow-sm">
            <CardContent className="p-8 text-center">
              <p className="text-lg font-medium text-muted-foreground mb-3">No event bookings yet</p>
              <Button variant="link" asChild>
                <Link href="/dashboard">
                  Browse Events →
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

        <Card className="shadow-sm mt-6">
          <CardHeader>
            <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight">Poster Auto-Post</CardTitle>
            <CardDescription>Connect Instagram and control poster auto-post behavior.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 border rounded-lg">
              <div>
                <p className="text-sm font-medium">
                  Instagram {instagramConnected ? `connected${instagramUsername ? ` as @${instagramUsername}` : ''}` : 'not connected'}
                </p>
                <p className="text-xs text-muted-foreground">Only Instagram Business/Creator accounts are supported.</p>
              </div>
              {instagramConnected ? (
                <Button variant="outline" onClick={handleDisconnectInstagram} disabled={autopostLoading}>
                  Disconnect
                </Button>
              ) : (
                <Button onClick={handleConnectInstagram} disabled={autopostLoading}>
                  Connect Instagram
                </Button>
              )}
            </div>

            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <p className="text-sm font-medium">Enable auto-post by default</p>
                <p className="text-xs text-muted-foreground">Applied to new event posters unless you override per event.</p>
              </div>
              <input
                type="checkbox"
                checked={globalAutoPostEnabled}
                disabled={!instagramConnected || autopostLoading}
                onChange={(e) => updateGlobalAutoPost(e.target.checked)}
                className="h-4 w-4"
              />
            </div>

            <div>
              <p className="text-sm font-medium mb-2">Recent auto-post activity</p>
              {autopostJobs.length === 0 ? (
                <p className="text-xs text-muted-foreground">No poster jobs yet.</p>
              ) : (
                <div className="space-y-2">
                  {autopostJobs.map((job) => (
                    <div key={job.id} className="flex items-center justify-between text-xs p-2 border rounded">
                      <span className="text-muted-foreground">{new Date(job.created_at).toLocaleString()}</span>
                      <Badge variant="outline">{job.status}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
