'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Profile, Event } from '@/lib/supabase'
import { formatDateTime, formatDate } from '@/lib/dateUtils'
import NavigationTabs from '@/components/NavigationTabs'
import Link from 'next/link'

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
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-2xl">Loading...</div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-2xl">Profile not found</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Navigation Tabs */}
      <NavigationTabs />

      <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Profile Card */}
        <div className="bg-white rounded-lg shadow-lg p-6 md:p-8 mb-6">
          {!isEditing ? (
            <>
              <div className="flex items-start gap-4 mb-6">
                {/* Profile Picture */}
                <div className="flex-shrink-0">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={profile.full_name || 'Profile'}
                      className="w-20 h-20 rounded-full object-cover border-2 border-gray-200"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-2xl font-bold border-2 border-gray-200">
                      {getInitials(profile.full_name)}
                    </div>
                  )}
                </div>

                <div className="flex-1">
                  <div className="flex justify-between items-start">
                    <div>
                      <h2 className="text-3xl font-bold text-gray-900 mb-1">
                        {profile.full_name || 'No name set'}
                      </h2>
                      <p className="text-gray-600 text-sm">{profile.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={copyPublicProfileLink}
                        className="bg-gray-100 text-gray-700 p-2 rounded-lg hover:bg-gray-200 transition-colors"
                        title="Share Profile"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setIsEditing(true)}
                        className="bg-gray-100 text-gray-700 p-2 rounded-lg hover:bg-gray-200 transition-colors"
                        title="Edit Profile"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Consolidated Stats - Horizontal Layout */}
                  <div className="flex items-center gap-4 mt-4 pt-4 border-t border-gray-200">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-700">Credits:</span>
                      <span className="text-lg font-bold text-blue-600">{profile.credits}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-700">Attended:</span>
                      <span className="text-lg font-bold text-green-600">{attendedCount}</span>
                    </div>
                  </div>
                </div>
              </div>

              {profile.bio && (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Bio</h3>
                  <p className="text-gray-800 whitespace-pre-wrap">{profile.bio}</p>
                </div>
              )}

              {/* Social Links */}
              {(profile.website_link || profile.instagram_link || profile.youtube_link || profile.twitter_link) && (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Social Links</h3>
                  <div className="flex flex-wrap gap-3">
                    {profile.website_link && (
                      <a
                        href={profile.website_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-blue-100 text-blue-700 px-4 py-2 rounded-lg hover:bg-blue-200 font-medium"
                      >
                        🌐 Website
                      </a>
                    )}
                    {profile.instagram_link && (
                      <a
                        href={profile.instagram_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-pink-100 text-pink-700 px-4 py-2 rounded-lg hover:bg-pink-200 font-medium"
                      >
                        📷 Instagram
                      </a>
                    )}
                    {profile.youtube_link && (
                      <a
                        href={profile.youtube_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-red-100 text-red-700 px-4 py-2 rounded-lg hover:bg-red-200 font-medium"
                      >
                        ▶️ YouTube
                      </a>
                    )}
                    {profile.twitter_link && (
                      <a
                        href={profile.twitter_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-sky-100 text-sky-700 px-4 py-2 rounded-lg hover:bg-sky-200 font-medium"
                      >
                        🐦 Twitter
                      </a>
                    )}
                  </div>
                </div>
              )}

            </>
          ) : (
            <form onSubmit={handleSaveProfile} className="space-y-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold text-gray-900">Edit Profile</h2>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(false)
                      // Reset form data
                      setFormData({
                        full_name: profile.full_name || '',
                        bio: profile.bio || '',
                        website_link: profile.website_link || '',
                        instagram_link: profile.instagram_link || '',
                        youtube_link: profile.youtube_link || '',
                        twitter_link: profile.twitter_link || ''
                      })
                    }}
                    className="bg-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-400 font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 font-medium"
                  >
                    {submitting ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Full Name *
                </label>
                <input
                  type="text"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Bio
                </label>
                <textarea
                  value={formData.bio}
                  onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={4}
                  placeholder="Tell us about yourself..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Website
                </label>
                <input
                  type="url"
                  value={formData.website_link}
                  onChange={(e) => setFormData({ ...formData, website_link: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="https://example.com"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Instagram
                  </label>
                  <input
                    type="url"
                    value={formData.instagram_link}
                    onChange={(e) => setFormData({ ...formData, instagram_link: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="https://instagram.com/username"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    YouTube
                  </label>
                  <input
                    type="url"
                    value={formData.youtube_link}
                    onChange={(e) => setFormData({ ...formData, youtube_link: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="https://youtube.com/@username"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Twitter
                  </label>
                  <input
                    type="url"
                    value={formData.twitter_link}
                    onChange={(e) => setFormData({ ...formData, twitter_link: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="https://twitter.com/username"
                  />
                </div>
              </div>
            </form>
          )}
        </div>

        {/* Event Bookings */}
        {eventBookings.length > 0 && (
          <div className="bg-white rounded-lg shadow-lg p-6 md:p-8">
            <h3 className="text-2xl font-bold text-gray-900 mb-6">My Event Bookings</h3>
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
                    className="group block border border-gray-200 rounded-lg p-4 hover:border-blue-400 hover:shadow-lg hover:bg-blue-50/30 transition-all duration-200 cursor-pointer"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <h4 className="font-bold text-lg text-gray-900 mb-1 group-hover:text-blue-700 transition-colors">{booking.title}</h4>
                        <p className="text-sm text-gray-600">
                          📅 {formatDateTime(booking.date)}
                        </p>
                        <p className="text-sm text-gray-600">📍 {booking.location}</p>
                        <div className="flex items-center gap-3 mt-2">
                          <span className={`inline-block px-2 py-1 rounded text-xs font-semibold ${statusColor}`}>
                            {statusDisplay}
                          </span>
                          <span className="text-sm text-gray-600">
                            💳 {booking.credits_used} credit{booking.credits_used !== 1 ? 's' : ''} used
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          {actionLabel}: {formatDate(booking.booked_at)}
                        </p>
                      </div>
                      <div className="flex-shrink-0 ml-4 flex items-center">
                        <div className="w-8 h-8 rounded-full bg-gray-100 group-hover:bg-blue-500 flex items-center justify-center transition-colors">
                          <svg className="w-5 h-5 text-gray-400 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        )}

        {eventBookings.length === 0 && (
          <div className="bg-white rounded-lg shadow-lg p-6 md:p-8 text-center text-gray-500">
            <p className="text-lg">No event bookings yet</p>
            <Link
              href="/dashboard"
              className="text-blue-600 hover:text-blue-800 font-medium mt-2 inline-block"
            >
              Browse Events →
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
