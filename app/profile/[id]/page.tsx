'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/lib/supabase'
import Link from 'next/link'

type AttendedEvent = {
  id: string
  title: string
  date: string
  location: string
  booked_at: string
}

export default function PublicProfilePage() {
  const params = useParams()
  const profileId = params.id as string

  const [profile, setProfile] = useState<Profile | null>(null)
  const [attendedEvents, setAttendedEvents] = useState<AttendedEvent[]>([])
  const [attendedCount, setAttendedCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadProfile()
  }, [profileId])

  async function loadProfile() {
    setLoading(true)
    try {
      // Load profile (public view - no email or credits)
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name, bio, website_link, instagram_link, youtube_link, twitter_link, created_at')
        .eq('id', profileId)
        .single()

      if (profileError) throw profileError
      setProfile(profileData)

      // Load attended events
      const { data: bookingsData, error: bookingsError } = await supabase
        .from('bookings')
        .select(`
          id,
          booked_at,
          events (
            id,
            title,
            date,
            location
          )
        `)
        .eq('user_id', profileId)
        .eq('attendance_status', 'attended')
        .order('booked_at', { ascending: false })

      if (bookingsError) throw bookingsError
      
      const events = (bookingsData || []).map((b: any) => ({
        id: b.events.id,
        title: b.events.title,
        date: b.events.date,
        location: b.events.location,
        booked_at: b.booked_at
      }))
      setAttendedEvents(events)

      // Get attended count
      const { count, error: countError } = await supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', profileId)
        .eq('attendance_status', 'attended')

      if (!countError) {
        setAttendedCount(count || 0)
      }

    } catch (error: any) {
      console.error('Error loading profile:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-2xl text-gray-900">Loading profile...</div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
        <div className="text-center bg-white p-8 rounded-lg shadow-lg max-w-md">
          <h1 className="text-2xl font-bold mb-4 text-gray-900">Profile Not Found</h1>
          <p className="text-gray-600 mb-6">This profile doesn't exist or has been removed.</p>
          <Link 
            href="/" 
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 font-semibold inline-block"
          >
            Go Home
          </Link>
        </div>
      </div>
    )
  }

  const memberSince = new Date(profile.created_at).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long'
  })

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white shadow-md border-b-4 border-blue-600">
        <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="text-blue-600 hover:text-blue-800 font-medium mb-2 inline-block"
          >
            ← Back
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Profile</h1>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Profile Card */}
        <div className="bg-white rounded-lg shadow-lg p-6 md:p-8 mb-6">
          <div className="mb-6">
            <h2 className="text-3xl font-bold text-gray-900 mb-2">
              {profile.full_name || 'User'}
            </h2>
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

          {/* Stats (no credits or email) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="bg-green-50 p-4 rounded-lg">
              <h3 className="text-sm font-semibold text-green-900 mb-1">Events Attended</h3>
              <p className="text-2xl font-bold text-green-700">{attendedCount}</p>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg">
              <h3 className="text-sm font-semibold text-purple-900 mb-1">Member Since</h3>
              <p className="text-lg font-bold text-purple-700">{memberSince}</p>
            </div>
          </div>
        </div>

        {/* Attended Events */}
        {attendedEvents.length > 0 && (
          <div className="bg-white rounded-lg shadow-lg p-6 md:p-8">
            <h3 className="text-2xl font-bold text-gray-900 mb-6">Events Attended</h3>
            <div className="space-y-4">
              {attendedEvents.map((event) => (
                <div
                  key={event.id}
                  className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-bold text-lg text-gray-900 mb-1">{event.title}</h4>
                      <p className="text-sm text-gray-600">
                        📅 {new Date(event.date).toLocaleString()}
                      </p>
                      <p className="text-sm text-gray-600">📍 {event.location}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        Attended: {new Date(event.booked_at).toLocaleDateString()}
                      </p>
                    </div>
                    <Link
                      href={`/event-public/${event.id}`}
                      className="text-blue-600 hover:text-blue-800 font-medium text-sm"
                    >
                      View Event →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {attendedEvents.length === 0 && (
          <div className="bg-white rounded-lg shadow-lg p-6 md:p-8 text-center text-gray-500">
            <p className="text-lg">No events attended yet</p>
          </div>
        )}
      </div>
    </div>
  )
}
