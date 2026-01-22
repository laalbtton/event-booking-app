'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Profile, Event } from '@/lib/supabase'
import { formatDateTime, formatDate } from '@/lib/dateUtils'
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
import { cn } from '@/lib/utils'

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
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [eventBookings, setEventBookings] = useState<EventBooking[]>([])
  const [attendedCount, setAttendedCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
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
    checkAuth()
  }, [])

  async function checkAuth() {
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      router.push('/login')
      return
    }

    // Get avatar URL from user metadata (for Google OAuth users)
    const avatar = user.user_metadata?.avatar_url || user.user_metadata?.picture || null
    setAvatarUrl(avatar)

    loadProfile(user.id)
  }

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
            location
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
        waitlist_position: b.waitlist_position
      }))
      setEventBookings(events)

      // Get attended count
      const attended = events.filter(e => e.attendance_status === 'attended').length
      setAttendedCount(attended)

    } catch (error: any) {
      console.error('Error loading profile:', error)
      alert('Error loading profile: ' + error.message)
    } finally {
      setLoading(false)
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

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/')
  }

  if (loading) {
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
                  <div className="flex items-center gap-2 shrink-0">
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
        {eventBookings.length > 0 && (
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight">My Event Bookings</CardTitle>
            </CardHeader>
            <CardContent>
            <div className="space-y-4">
              {eventBookings.map((booking) => {
                // Determine status display
                let statusDisplay = ''
                let statusColor = ''
                
                if (booking.attendance_status === 'attended') {
                  statusDisplay = '✓ Attended'
                  statusColor = 'bg-green-100 text-green-700'
                } else if (booking.attendance_status === 'no_show') {
                  statusDisplay = '✗ No Show'
                  statusColor = 'bg-red-100 text-red-700'
                } else if (booking.status === 'cancelled') {
                  statusDisplay = 'Cancelled'
                  statusColor = 'bg-gray-100 text-gray-700'
                } else if (booking.status === 'waitlist') {
                  statusDisplay = `⏳ Waitlist${booking.waitlist_position ? ` #${booking.waitlist_position}` : ''}`
                  statusColor = 'bg-yellow-100 text-yellow-700'
                } else if (booking.status === 'confirmed') {
                  statusDisplay = 'Confirmed'
                  statusColor = 'bg-blue-100 text-blue-700'
                } else {
                  statusDisplay = booking.status
                  statusColor = 'bg-gray-100 text-gray-700'
                }

                // Determine which label to show based on action
                // Note: We use booked_at for all dates since bookings table doesn't have updated_at
                let actionLabel = 'Booked'
                if (booking.status === 'cancelled') {
                  actionLabel = 'Cancelled'
                } else if (booking.attendance_status === 'attended') {
                  actionLabel = 'Attended'
                } else if (booking.attendance_status === 'no_show') {
                  actionLabel = 'Marked as No Show'
                }

                return (
                  <Link
                    key={booking.id}
                    href={`/events/${booking.event_id}`}
                    className="group block"
                  >
                    <Card className="hover:border-primary hover:shadow-md transition-all duration-200 cursor-pointer">
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start gap-4">
                          <div className="flex-1 min-w-0 space-y-2">
                            <h4 className="font-bold text-base sm:text-lg group-hover:text-primary transition-colors truncate">{booking.title}</h4>
                            <div className="space-y-1 text-sm text-muted-foreground">
                              <p>📅 {formatDateTime(booking.date)}</p>
                              <p>📍 {booking.location}</p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 pt-1">
                              <Badge variant="outline" className={cn("text-xs", statusColor)}>
                                {statusDisplay}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                💳 {booking.credits_used} credit{booking.credits_used !== 1 ? 's' : ''} used
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground pt-1">
                              {actionLabel}: {formatDate(booking.booked_at)}
                            </p>
                          </div>
                          <div className="flex-shrink-0">
                            <div className="w-8 h-8 rounded-full bg-muted group-hover:bg-primary flex items-center justify-center transition-colors">
                              <svg className="w-5 h-5 text-muted-foreground group-hover:text-primary-foreground transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                )
              })}
              </div>
            </CardContent>
          </Card>
        )}

        {eventBookings.length === 0 && (
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
      </div>
    </div>
  )
}
