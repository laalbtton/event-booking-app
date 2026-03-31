'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { QRCodeSVG } from 'qrcode.react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { toast } from 'sonner'

export default function EventQRCodePage() {
  const params = useParams()
  const router = useRouter()
  const eventId = params.id as string

  const [event, setEvent] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [publicUrl, setPublicUrl] = useState('')

  useEffect(() => {
    checkAccess()
  }, [])

  useEffect(() => {
    if (typeof window !== 'undefined' && eventId) {
      setPublicUrl(`${window.location.origin}/events/${eventId}`)
    }
  }, [eventId])

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

  function handleDownloadQr() {
    const svg = document.querySelector('#event-qr svg') as SVGElement | null
    if (!svg) {
      toast.error('QR code not ready yet')
      return
    }
    const serializer = new XMLSerializer()
    const source = serializer.serializeToString(svg)
    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    const safeTitle = String(event?.title || 'event')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
    link.download = `${safeTitle || 'event'}-qr.svg`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="flex items-center gap-2 mb-6">
            <Link
              href="/events/manage"
              className="text-blue-600 hover:text-blue-800 p-1 -ml-1 rounded hover:bg-gray-100"
              aria-label="Back to Events"
            >
              <ChevronLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-3xl font-bold text-gray-900">QR Code</h1>
          </div>
          
          <div className="text-center mb-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-900">{event.title}</h2>
            {publicUrl && (
              <>
                <div className="flex justify-center mb-4">
                  <div id="event-qr" className="bg-white p-4 rounded-lg border-2 border-gray-200">
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
                  toast.success('URL copied to clipboard!')
                }}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 font-medium"
              >
                Copy URL
              </button>
              <button
                onClick={handleDownloadQr}
                className="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 font-medium"
              >
                Download QR
              </button>
              <Link
                href={`/events/${eventId}`}
                target="_blank"
                className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 font-medium"
              >
                View Public Page
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Navigation */}
</div>
  )
}
