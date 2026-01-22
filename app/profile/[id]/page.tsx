'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { PublicProfile } from '@/lib/supabase'
import { formatDateTime } from '@/lib/dateUtils'
import Link from 'next/link'

type UpcomingEvent = {
  id: string
  title: string
  date: string
  location: string
  booked_at: string
  status: string
  waitlist_position: number | null
}

export default function PublicProfilePage() {
  const params = useParams()
  const profileId = params.id as string

  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [upcomingEvents, setUpcomingEvents] = useState<UpcomingEvent[]>([])
  const [upcomingCount, setUpcomingCount] = useState(0)
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
      setProfile(profileData as PublicProfile)

      // Load upcoming events (confirmed/waitlist bookings for future events)
      const now = new Date().toISOString()
      const { data: bookingsData, error: bookingsError } = await supabase
        .from('bookings')
        .select(`
          id,
          status,
          waitlist_position,
          booked_at,
          events (
            id,
            title,
            date,
            location
          )
        `)
        .eq('user_id', profileId)
        .in('status', ['confirmed', 'waitlist'])
        .order('booked_at', { ascending: true })

      if (bookingsError) throw bookingsError
      
      // Filter to only future events
      const events = (bookingsData || [])
        .filter((b: any) => new Date(b.events.date) > new Date(now))
        .map((b: any) => ({
          id: b.events.id,
          title: b.events.title,
          date: b.events.date,
          location: b.events.location,
          booked_at: b.booked_at,
          status: b.status,
          waitlist_position: b.waitlist_position
        }))
      setUpcomingEvents(events)

      // Get upcoming count
      setUpcomingCount(events.length)

      // Load attended events count
      const { count: attendedCount, error: attendedError } = await supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', profileId)
        .eq('attendance_status', 'attended')

      if (!attendedError && attendedCount !== null) {
        setAttendedCount(attendedCount)
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

  // Generate initials from name
  function getInitials(name: string | null | undefined): string {
    if (!name) return '?'
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    }
    return name.substring(0, 2).toUpperCase()
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      {/* Header with subtle gradient */}
      <div className="bg-white/80 backdrop-blur-sm border-b border-gray-200/50 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="text-gray-600 hover:text-blue-600 text-sm font-medium inline-flex items-center gap-1 transition-colors"
          >
            ← Back
          </Link>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Profile Header with Image - Enhanced with gradient accent */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200/50 p-6 md:p-8 mb-6 relative overflow-hidden">
          {/* Subtle gradient accent bar */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500"></div>
          <div className="flex items-start gap-6">
            {/* Profile Picture */}
            <div className="flex-shrink-0">
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-3xl font-bold border-4 border-white shadow-lg">
                {getInitials(profile.full_name)}
              </div>
            </div>

            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-900 mb-4">
                {profile.full_name || 'User'}
              </h1>

              {/* Stats - Horizontal with Icons - Enhanced colors */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 pt-4 border-t border-gray-200">
                <div className="flex items-center gap-3 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-3 sm:flex-1 min-w-0">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md flex-shrink-0">
                    <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-blue-700">Upcoming</p>
                    <p className="text-lg sm:text-xl font-bold text-blue-900">{upcomingCount}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl p-3 sm:flex-1 min-w-0">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md flex-shrink-0">
                    <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-emerald-700">Attended</p>
                    <p className="text-lg sm:text-xl font-bold text-emerald-900">{attendedCount}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bio Section - Enhanced with subtle color */}
        {profile.bio && (
          <div className="bg-gradient-to-br from-white to-indigo-50/30 rounded-xl shadow-md border border-indigo-100 p-6 md:p-8 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1 h-6 bg-gradient-to-b from-indigo-500 to-purple-500 rounded-full"></div>
              <h2 className="text-lg font-semibold text-gray-900">About</h2>
            </div>
            <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">{profile.bio}</p>
          </div>
        )}

        {/* Social Links - Enhanced with color */}
        {(profile.website_link || profile.instagram_link || profile.youtube_link || profile.twitter_link) && (
          <div className="bg-gradient-to-br from-white to-pink-50/30 rounded-xl shadow-md border border-pink-100 p-6 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1 h-6 bg-gradient-to-b from-pink-500 to-rose-500 rounded-full"></div>
              <h2 className="text-lg font-semibold text-gray-900">Connect</h2>
            </div>
            <div className="flex flex-wrap gap-3">
              {profile.website_link && (
                <a
                  href={profile.website_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 px-4 py-2 rounded-lg hover:bg-blue-100 font-medium text-sm transition-colors"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4.083 9h1.946c.089-1.546.383-2.97.837-4.118A6.004 6.004 0 004.083 9zM10 2a8 8 0 100 16 8 8 0 000-16zm0 2c-.076 0-.232.032-.465.262-.238.234-.497.623-.737 1.182-.389.907-.673 2.142-.766 3.556h3.936c-.093-1.414-.377-2.649-.766-3.556-.24-.56-.5-.948-.737-1.182C10.232 4.032 10.076 4 10 4zm3.971 5c-.089-1.546-.383-2.97-.837-4.118A6.004 6.004 0 0115.917 9h-1.946zm-2.003 2H8.032c.093 1.414.377 2.649.766 3.556.24.56.5.948.737 1.182.233.23.389.262.465.262.076 0 .232-.032.465-.262.238-.234.498-.623.737-1.182.389-.907.673-2.142.766-3.556zm1.166 4.118c.454-1.147.748-2.572.837-4.118h1.946a6.004 6.004 0 01-2.783 4.118zm-6.268 0C6.412 13.97 6.118 12.546 6.03 11H4.083a6.004 6.004 0 002.783 4.118z" clipRule="evenodd" />
                  </svg>
                  Website
                </a>
              )}
              {profile.instagram_link && (
                <a
                  href={profile.instagram_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 bg-pink-50 text-pink-700 px-4 py-2 rounded-lg hover:bg-pink-100 font-medium text-sm transition-colors"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                  </svg>
                  Instagram
                </a>
              )}
              {profile.youtube_link && (
                <a
                  href={profile.youtube_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 bg-red-50 text-red-700 px-4 py-2 rounded-lg hover:bg-red-100 font-medium text-sm transition-colors"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                  </svg>
                  YouTube
                </a>
              )}
              {profile.twitter_link && (
                <a
                  href={profile.twitter_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 bg-sky-50 text-sky-700 px-4 py-2 rounded-lg hover:bg-sky-100 font-medium text-sm transition-colors"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/>
                  </svg>
                  Twitter
                </a>
              )}
            </div>
          </div>
        )}

        {/* Upcoming Events - Clickable Cards with Enhanced Hover */}
        {upcomingEvents.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1 h-6 bg-gradient-to-b from-violet-500 to-purple-500 rounded-full"></div>
              <h2 className="text-xl font-bold text-gray-900">Upcoming Events</h2>
            </div>
            {upcomingEvents.map((event, index) => (
              <Link
                key={event.id}
                href={`/event-public/${event.id}`}
                className={`group block rounded-xl border-2 border-gray-200 p-5 hover:border-violet-400 hover:shadow-xl transition-all duration-300 cursor-pointer ${
                  index % 2 === 0 
                    ? 'bg-white hover:bg-gradient-to-br hover:from-violet-50/50 hover:to-purple-50/30' 
                    : 'bg-gradient-to-br from-blue-50/30 to-indigo-50/20 hover:from-violet-50/50 hover:to-purple-50/30'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h3 className="font-bold text-gray-900 mb-2 group-hover:text-blue-700 transition-colors">{event.title}</h3>
                    <div className="space-y-1.5">
                      <p className="text-sm text-gray-700 flex items-center gap-2">
                        <div className="w-5 h-5 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
                          <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <span className="font-medium">{formatDateTime(event.date)}</span>
                      </p>
                      <p className="text-sm text-gray-700 flex items-center gap-2">
                        <div className="w-5 h-5 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center flex-shrink-0">
                          <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        </div>
                        <span className="font-medium">{event.location}</span>
                      </p>
                    </div>
                    {event.status === 'waitlist' && (
                      <span className="inline-flex items-center gap-1 bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-xs font-semibold border border-yellow-300 mt-3">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                        </svg>
                        Waitlist #{event.waitlist_position}
                      </span>
                    )}
                  </div>
                  <div className="flex-shrink-0 ml-4 flex items-center">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 group-hover:from-violet-500 group-hover:to-purple-600 flex items-center justify-center transition-all duration-300 shadow-sm group-hover:shadow-md">
                      <svg className="w-5 h-5 text-gray-400 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {upcomingEvents.length === 0 && (
          <div className="bg-white/60 backdrop-blur-sm rounded-xl border border-gray-200/50 p-6 text-center text-gray-500">
            <p className="text-sm">No upcoming events</p>
          </div>
        )}
      </div>
    </div>
  )
}
