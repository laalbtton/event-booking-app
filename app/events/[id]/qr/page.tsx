'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { QRCodeSVG } from 'qrcode.react'
import Link from 'next/link'

export default function EventQRCodePage() {
  const params = useParams()
  const router = useRouter()
  const eventId = params.id as string

  const [event, setEvent] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [userRole, setUserRole] = useState<string | null>(null)

  useEffect(() => {
    checkAccess()
  }, [])

  async function checkAccess() {
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      router.push('/login')
      return
    }

    // Check user role
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (error || !profile) {
      router.push('/dashboard')
      return
    }

    // Only event_creator and admin can access this page
    if (profile.role !== 'event_creator' && profile.role !== 'admin') {
      router.push('/dashboard')
      return
    }

    setUserRole(profile.role)

    // Load event and verify access
    const { data: eventData, error: eventError } = await supabase
      .from('events')
      .select('*')
      .eq('id', eventId)
      .single()

    if (eventError) {
      router.push('/events/manage')
      return
    }

    // Event creators can only access their own events
    if (profile.role === 'event_creator' && eventData.created_by !== user.id) {
      router.push('/events/manage')
      return
    }

    setEvent(eventData)
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-2xl">Loading...</div>
      </div>
    )
  }

  if (!event) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-2xl">Event not found</div>
      </div>
    )
  }

  const [publicUrl, setPublicUrl] = useState('')

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setPublicUrl(`${window.location.origin}/event-public/${eventId}`)
    }
  }, [eventId])

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="flex justify-between items-center mb-6">
            <Link
              href="/events/manage"
              className="text-blue-600 hover:text-blue-800 font-medium"
            >
              ← Back to Events
            </Link>
          </div>

          <h1 className="text-3xl font-bold mb-6 text-gray-900">Event QR Code</h1>
          
          <div className="text-center mb-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-900">{event.title}</h2>
            {publicUrl && (
              <>
                <div className="flex justify-center mb-4">
                  <div className="bg-white p-4 rounded-lg border-2 border-gray-200">
                    <QRCodeSVG value={publicUrl} size={256} />
                  </div>
                </div>
                <p className="text-sm text-gray-600 mb-2">Scan this QR code to view the event</p>
                <p className="text-xs text-gray-500 break-all">{publicUrl}</p>
              </>
            )}
          </div>

          {publicUrl && (
            <div className="flex gap-4 justify-center">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(publicUrl)
                  alert('URL copied to clipboard!')
                }}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 font-medium"
              >
                Copy URL
              </button>
              <Link
                href={`/event-public/${eventId}`}
                target="_blank"
                className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 font-medium"
              >
                View Public Page
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
