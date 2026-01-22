'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/lib/supabase'
import { formatDateTime } from '@/lib/dateUtils'
import Link from 'next/link'
import NavigationTabs from '@/components/NavigationTabs'

type RoleChangeRequest = {
  id: string
  status: 'pending' | 'approved' | 'rejected'
  message: string | null
  admin_notes: string | null
  created_at: string
}

export default function ApplyEventCreatorPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [existingRequest, setExistingRequest] = useState<RoleChangeRequest | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    checkAccess()
  }, [])

  async function checkAccess() {
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      router.push('/login')
      return
    }

    // Load profile
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (profileError) {
      router.push('/dashboard')
      return
    }

    setProfile(profileData)

    // Check if user already has event creator or admin role
    if (profileData.role === 'event_creator' || profileData.role === 'admin') {
      router.push('/dashboard')
      return
    }

    // Check for existing request
    const { data: requestData, error: requestError } = await supabase
      .from('role_change_requests')
      .select('*')
      .eq('user_id', user.id)
      .eq('requested_role', 'event_creator')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!requestError && requestData) {
      setExistingRequest(requestData)
    }

    setLoading(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return

    setSubmitting(true)
    setError('')

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { error: insertError } = await supabase
        .from('role_change_requests')
        .insert({
          user_id: user.id,
          requested_role: 'event_creator',
          from_role: profile.role,
          message: message || null,
          status: 'pending'
        })

      if (insertError) throw insertError

      alert('Application submitted successfully! An admin will review your request shortly.')
      router.push('/dashboard')
    } catch (error: any) {
      console.error('Error submitting application:', error)
      setError(error.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-2xl">Loading...</div>
      </div>
    )
  }

  if (existingRequest && existingRequest.status === 'pending') {
    return (
      <div className="min-h-screen bg-gray-50 pb-20">
        <div className="max-w-3xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
          <Link
            href="/dashboard"
            className="text-blue-600 hover:text-blue-800 font-medium mb-6 inline-block"
          >
            ← Back to Dashboard
          </Link>

          <div className="bg-white rounded-lg shadow-lg p-8">
            <div className="text-center mb-6">
              <div className="text-yellow-600 text-6xl mb-4">⏳</div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Application Pending</h1>
              <p className="text-gray-600">
                Your request to become an Event Creator is currently under review.
              </p>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-yellow-800">
                <strong>Submitted:</strong> {formatDateTime(existingRequest.created_at)}
              </p>
              {existingRequest.message && (
                <div className="mt-2">
                  <p className="text-sm font-medium text-yellow-900">Your Message:</p>
                  <p className="text-sm text-yellow-800 mt-1">{existingRequest.message}</p>
                </div>
              )}
            </div>

            <div className="text-center">
              <Link
                href="/dashboard"
                className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 font-medium inline-block"
              >
                Back to Dashboard
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (existingRequest && existingRequest.status === 'approved') {
    return (
      <div className="min-h-screen bg-gray-50 pb-20">
        <div className="max-w-3xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
          <Link
            href="/dashboard"
            className="text-blue-600 hover:text-blue-800 font-medium mb-6 inline-block"
          >
            ← Back to Dashboard
          </Link>

          <div className="bg-white rounded-lg shadow-lg p-8">
            <div className="text-center mb-6">
              <div className="text-green-600 text-6xl mb-4">✓</div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Application Approved!</h1>
              <p className="text-gray-600">
                Your request has been approved. You now have Event Creator privileges.
              </p>
            </div>

            <div className="text-center">
              <Link
                href="/events/manage"
                className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 font-medium inline-block mr-4"
              >
                Go to Event Management
              </Link>
              <Link
                href="/dashboard"
                className="bg-gray-300 text-gray-700 px-6 py-3 rounded-lg hover:bg-gray-400 font-medium inline-block"
              >
                Back to Dashboard
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (existingRequest && existingRequest.status === 'rejected') {
    return (
      <div className="min-h-screen bg-gray-50 pb-20">
        <div className="max-w-3xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
          <Link
            href="/dashboard"
            className="text-blue-600 hover:text-blue-800 font-medium mb-6 inline-block"
          >
            ← Back to Dashboard
          </Link>

          <div className="bg-white rounded-lg shadow-lg p-8">
            <div className="text-center mb-6">
              <div className="text-red-600 text-6xl mb-4">✗</div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Application Rejected</h1>
              <p className="text-gray-600">
                Your previous request to become an Event Creator was rejected.
              </p>
            </div>

            {existingRequest.admin_notes && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                <p className="text-sm font-medium text-red-900">Admin Notes:</p>
                <p className="text-sm text-red-800 mt-1">{existingRequest.admin_notes}</p>
              </div>
            )}

            <div className="text-center">
              <Link
                href="/dashboard"
                className="bg-gray-300 text-gray-700 px-6 py-3 rounded-lg hover:bg-gray-400 font-medium inline-block"
              >
                Back to Dashboard
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="max-w-3xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <Link
          href="/dashboard"
          className="text-blue-600 hover:text-blue-800 font-medium mb-6 inline-block"
        >
          ← Back to Dashboard
        </Link>

        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Apply to Become an Event Creator</h1>
          <p className="text-gray-600 mb-6">
            Event Creators can create and manage their own events. Fill out the form below to request Event Creator privileges.
          </p>

          {error && (
            <div className="bg-red-100 border border-red-400 text-red-800 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Why would you like to become an Event Creator? (Optional)
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Tell us about your plans for creating events..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows={6}
              />
              <p className="text-xs text-gray-500 mt-1">
                This information will help admins review your application.
              </p>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800">
                <strong>What you'll be able to do:</strong>
              </p>
              <ul className="list-disc list-inside text-sm text-blue-700 mt-2 space-y-1">
                <li>Create and manage your own events</li>
                <li>Set event themes, dates, and registration times</li>
                <li>Manage attendee lists and mark attendance</li>
                <li>Generate QR codes for your events</li>
                <li>Designate hosts for your events</li>
              </ul>
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 font-medium"
              >
                {submitting ? 'Submitting...' : 'Submit Application'}
              </button>
              <Link
                href="/dashboard"
                className="flex-1 bg-gray-300 text-gray-700 px-6 py-3 rounded-lg hover:bg-gray-400 font-medium text-center"
              >
                Cancel
              </Link>
            </div>
          </form>
        </div>
        <NavigationTabs />
      </div>
    </div>
  )
}
