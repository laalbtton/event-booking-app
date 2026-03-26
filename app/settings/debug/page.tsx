'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'
import { useAuthBootstrap } from '@/components/providers/auth-bootstrap-provider'
import { ChevronLeft } from 'lucide-react'
import { toast } from 'sonner'

export default function SettingsDebugPage() {
  const { authResolved, user } = useAuthBootstrap()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [submissionsEnabled, setSubmissionsEnabled] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!authResolved) return
    if (!user) {
      router.push('/login')
      return
    }
    void loadData(user.id)
  }, [authResolved, user, router])

  async function loadData(userId: string) {
    setLoading(true)
    try {
      const [profileResult, adminResult] = await Promise.all([
        supabase.from('profiles').select('role').eq('id', userId).maybeSingle(),
        supabase.from('admin_users').select('user_id').eq('user_id', userId).maybeSingle(),
      ])
      const canAccess = profileResult.data?.role === 'admin' || !!adminResult.data
      setIsSuperAdmin(canAccess)

      if (!canAccess) {
        router.replace('/settings')
        return
      }

      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) throw new Error('Not authenticated')

      const response = await fetch('/api/admin/debug/event-submission', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Failed to load debug settings')
      setSubmissionsEnabled(!!result.enabled)
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to load debug settings')
    } finally {
      setLoading(false)
    }
  }

  async function updateSubmissionsEnabled(enabled: boolean) {
    if (saving) return
    setSaving(true)
    const prev = submissionsEnabled
    setSubmissionsEnabled(enabled)

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) throw new Error('Not authenticated')

      const response = await fetch('/api/admin/debug/event-submission', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ enabled }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Failed to update debug setting')
      toast.success('Debug setting updated')
    } catch (error: unknown) {
      setSubmissionsEnabled(prev)
      toast.error(error instanceof Error ? error.message : 'Failed to update debug setting')
    } finally {
      setSaving(false)
    }
  }

  if (!authResolved || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-2xl">Loading...</div>
      </div>
    )
  }

  if (!isSuperAdmin) return null

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="max-w-4xl mx-auto px-4 py-6 sm:py-8 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 mb-6">
          <Link href="/settings" className="p-1 -ml-1 rounded hover:bg-muted shrink-0" aria-label="Back to Settings">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-2xl font-bold">Debug</h1>
        </div>

        <Card className="shadow-sm border-amber-200">
          <CardHeader>
            <CardTitle className="text-xl">Event Submission Controls</CardTitle>
            <CardDescription>Super-admin-only safety toggle for community approval workflow.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <p className="text-sm font-medium">Enable event submission to communities</p>
                <p className="text-xs text-muted-foreground">
                  Off by default. When off, new events are published directly and do not require community approval.
                </p>
              </div>
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={submissionsEnabled}
                onChange={(e) => updateSubmissionsEnabled(e.target.checked)}
                disabled={saving}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
