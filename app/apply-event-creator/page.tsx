'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/lib/supabase'
import { formatDateTime } from '@/lib/dateUtils'
import Link from 'next/link'
import NavigationTabs from '@/components/NavigationTabs'
import { ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

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
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Not authenticated')

      const res = await fetch('/api/apply-event-creator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ message: message || null }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to submit application')

      alert('Application submitted successfully! An admin will review your request shortly.')
      router.push('/dashboard')
    } catch (err: unknown) {
      console.error('Error submitting application:', err)
      setError(err instanceof Error ? err.message : 'Failed to submit')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (existingRequest && existingRequest.status === 'pending') {
    return (
      <div className="min-h-screen bg-background pb-20">
        <div className="max-w-3xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 mb-6">
            <Link href="/dashboard" className="p-1 -ml-1 rounded hover:bg-muted" aria-label="Back to Dashboard">
              <ChevronLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-xl font-bold">Apply for Event Creator</h1>
          </div>

          <Card>
            <CardHeader className="text-center">
              <div className="text-6xl mb-4">⏳</div>
              <CardTitle className="text-2xl md:text-3xl">Application Pending</CardTitle>
              <CardDescription>
                Your request to become an Event Creator is currently under review.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <Card className="border-yellow-200 bg-yellow-50/50">
                <CardContent className="pt-6">
                  <p className="text-sm text-yellow-800 mb-2">
                    <strong>Submitted:</strong> {formatDateTime(existingRequest.created_at)}
                  </p>
                  {existingRequest.message && (
                    <div className="mt-2">
                      <p className="text-sm font-medium text-yellow-900">Your Message:</p>
                      <p className="text-sm text-yellow-800 mt-1">{existingRequest.message}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="flex justify-center">
                <Button asChild>
                  <Link href="/dashboard">Back to Dashboard</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
        <NavigationTabs />
      </div>
    )
  }

  if (existingRequest && existingRequest.status === 'approved') {
    return (
      <div className="min-h-screen bg-background pb-20">
        <div className="max-w-3xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 mb-6">
            <Link href="/dashboard" className="p-1 -ml-1 rounded hover:bg-muted" aria-label="Back to Dashboard">
              <ChevronLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-xl font-bold">Apply for Event Creator</h1>
          </div>

          <Card>
            <CardHeader className="text-center">
              <div className="text-6xl mb-4">✓</div>
              <CardTitle className="text-2xl md:text-3xl">Application Approved!</CardTitle>
              <CardDescription>
                Your request has been approved. You now have Event Creator privileges.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button asChild className="bg-green-600 hover:bg-green-700">
                  <Link href="/events/manage">Go to Event Management</Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/dashboard">Back to Dashboard</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
        <NavigationTabs />
      </div>
    )
  }

  if (existingRequest && existingRequest.status === 'rejected') {
    return (
      <div className="min-h-screen bg-background pb-20">
        <div className="max-w-3xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 mb-6">
            <Link href="/dashboard" className="p-1 -ml-1 rounded hover:bg-muted" aria-label="Back to Dashboard">
              <ChevronLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-xl font-bold">Apply for Event Creator</h1>
          </div>

          <Card>
            <CardHeader className="text-center">
              <div className="text-6xl mb-4">✗</div>
              <CardTitle className="text-2xl md:text-3xl">Application Rejected</CardTitle>
              <CardDescription>
                Your previous request to become an Event Creator was rejected.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {existingRequest.admin_notes && (
                <Card className="border-red-200 bg-red-50/50">
                  <CardContent className="pt-6">
                    <p className="text-sm font-medium text-red-900">Admin Notes:</p>
                    <p className="text-sm text-red-800 mt-1">{existingRequest.admin_notes}</p>
                  </CardContent>
                </Card>
              )}

              <div className="flex justify-center">
                <Button variant="outline" asChild>
                  <Link href="/dashboard">Back to Dashboard</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
        <NavigationTabs />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="max-w-3xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 mb-6">
          <Link href="/dashboard" className="p-1 -ml-1 rounded hover:bg-muted" aria-label="Back to Dashboard">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-xl font-bold">Apply for Event Creator</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-2xl md:text-3xl">Apply to Become an Event Creator</CardTitle>
            <CardDescription>
              Event Creators can create and manage their own events. Fill out the form below to request Event Creator privileges.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {error && (
              <Card className="border-destructive bg-destructive/15">
                <CardContent className="pt-6">
                  <p className="text-sm text-destructive">{error}</p>
                </CardContent>
              </Card>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="message">
                  Why would you like to become an Event Creator? (Optional)
                </Label>
                <Textarea
                  id="message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Tell us about your plans for creating events..."
                  rows={6}
                />
                <p className="text-xs text-muted-foreground">
                  This information will help admins review your application.
                </p>
              </div>

              <Card className="border-yellow-400/30 bg-yellow-400/10">
                <CardContent className="pt-6">
                  <p className="text-sm font-medium text-yellow-700 dark:text-yellow-400 mb-2">
                    What you'll be able to do:
                  </p>
                  <ul className="list-disc list-inside text-sm text-stone-700 dark:text-stone-300 space-y-1">
                    <li>Create and manage your own events</li>
                    <li>Set event themes, dates, and registration times</li>
                    <li>Manage attendee lists and mark attendance</li>
                    <li>Generate QR codes for your events</li>
                    <li>Designate hosts for your events</li>
                  </ul>
                </CardContent>
              </Card>

              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  type="submit"
                  disabled={submitting}
                  className="flex-1"
                >
                  {submitting ? 'Submitting...' : 'Submit Application'}
                </Button>
                <Button variant="outline" asChild className="flex-1">
                  <Link href="/dashboard">Cancel</Link>
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
        <NavigationTabs />
      </div>
    </div>
  )
}
