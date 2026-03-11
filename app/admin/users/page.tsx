'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/lib/supabase'
import { formatDate } from '@/lib/dateUtils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'

type AppInviteLink = {
  id: string
  token: string
  welcome_credits: number
  expires_at: string
  max_uses: number | null
  uses: number
  is_active: boolean
  created_at: string
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string>('')
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null)
  const [creditAmount, setCreditAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [creditSource, setCreditSource] = useState<'cash' | 'in_kind'>('cash')
  const [inKindReason, setInKindReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [appInvites, setAppInvites] = useState<AppInviteLink[]>([])
  const [invitesLoading, setInvitesLoading] = useState(false)
  const [inviteCreating, setInviteCreating] = useState(false)
  const [inviteCredits, setInviteCredits] = useState('5')
  const [inviteMaxUses, setInviteMaxUses] = useState('')
  const [inviteExpiresAt, setInviteExpiresAt] = useState(() => {
    const date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  })

  useEffect(() => {
    loadUsers()
    loadAppInvites()
  }, [])

  async function loadUsers() {
    setLoading(true)
    setLoadError('')
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error loading users:', error)
      setUsers([])
      setLoadError(error.message || 'Failed to load users')
      setLoading(false)
      return
    }

    setUsers(data || [])
    setLoading(false)
  }

  async function loadAppInvites() {
    setInvitesLoading(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (!accessToken) throw new Error('Not authenticated')

      const response = await fetch('/api/admin/app-invites', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Failed to load invite links')

      setAppInvites((result.links || []) as AppInviteLink[])
    } catch (error: unknown) {
      console.error('Error loading app invite links:', error)
    } finally {
      setInvitesLoading(false)
    }
  }

  async function handleCreateAppInvite(e: React.FormEvent) {
    e.preventDefault()
    setInviteCreating(true)
    try {
      const welcomeCredits = Math.floor(Number(inviteCredits))
      const maxUses = inviteMaxUses.trim() ? Math.floor(Number(inviteMaxUses)) : null
      if (!Number.isFinite(welcomeCredits) || welcomeCredits <= 0) {
        throw new Error('Welcome credits must be greater than 0')
      }
      if (maxUses !== null && (!Number.isFinite(maxUses) || maxUses <= 0)) {
        throw new Error('Max uses must be empty or greater than 0')
      }
      if (!inviteExpiresAt) {
        throw new Error('Please choose an expiry date/time')
      }

      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (!accessToken) throw new Error('Not authenticated')

      const expiresAtIso = new Date(inviteExpiresAt).toISOString()
      const response = await fetch('/api/admin/app-invites', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          welcomeCredits,
          maxUses,
          expiresAt: expiresAtIso,
        }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Failed to create invite link')

      await loadAppInvites()
      if (result.shareUrl) {
        await navigator.clipboard.writeText(result.shareUrl)
        alert('Invite link created and copied to clipboard.')
      } else {
        alert('Invite link created successfully.')
      }
    } catch (error: unknown) {
      alert(`Error creating invite link: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setInviteCreating(false)
    }
  }

  async function copyInviteUrl(token: string) {
    const url = `${window.location.origin}/welcome/${token}`
    await navigator.clipboard.writeText(url)
    alert('Invite URL copied.')
  }

  async function handleAddCredits(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedUser) return

    setSubmitting(true)

    try {
      const amount = parseInt(creditAmount)
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('Credits to add must be greater than 0')
      if (creditSource === 'in_kind' && !inKindReason.trim()) {
        throw new Error('Reason is required for in-kind credits')
      }

      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (!accessToken) throw new Error('Not authenticated')

      const response = await fetch('/api/admin/credits/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          userId: selectedUser.id,
          amount,
          creditSource,
          sourceReason: creditSource === 'in_kind' ? inKindReason.trim() : null,
          notes: notes.trim() || null,
        }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Failed to add credits')

      alert('Credits added successfully!')
      loadUsers()
      setSelectedUser(null)
      setCreditAmount('')
      setNotes('')
      setCreditSource('cash')
      setInKindReason('')
    } catch (error: unknown) {
      console.error('Error adding credits:', error)
      alert('Error: ' + (error instanceof Error ? error.message : 'Unknown'))
    } finally {
      setSubmitting(false)
    }
  }

  const filteredUsers = users.filter((user) => {
    const name = (user.full_name || '').toLowerCase()
    return name.includes(searchTerm.toLowerCase())
  })

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  return (
    <div>
      {loadError && (
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="text-sm text-red-600">{loadError}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              If this is a permission error, it's typically Supabase RLS blocking admin reads on `profiles`.
            </div>
          </CardContent>
        </Card>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div className="text-sm text-muted-foreground">
          Total Users: {users.length}
        </div>
        <div className="w-full sm:w-72">
          <Label htmlFor="user-search" className="sr-only">Search users by name</Label>
          <Input
            id="user-search"
            placeholder="Search users by name"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Users Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Credits
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Joined
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {user.full_name || 'N/A'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">{user.email}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <select
                        value={user.role || 'performer'}
                        onChange={async (e) => {
                          try {
                            const newRole = e.target.value as 'performer' | 'audience' | 'event_creator' | 'admin'
                            const { error } = await supabase
                              .from('profiles')
                              .update({ role: newRole, updated_at: new Date().toISOString() })
                              .eq('id', user.id)

                            if (error) throw error
                            loadUsers()
                          } catch (error: unknown) {
                            alert('Error updating role: ' + (error instanceof Error ? error.message : 'Unknown'))
                          }
                        }}
                        className="text-sm border border-input bg-background rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        <option value="performer">Performer</option>
                        <option value="audience">Audience</option>
                        <option value="event_creator">Event Creator</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant="secondary">{user.credits}</Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(user.created_at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedUser(user)}
                      >
                        Add Credits
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Welcome Credit Invite Links</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleCreateAppInvite} className="grid gap-3 md:grid-cols-4">
            <div>
              <Label htmlFor="inviteCredits">Welcome credits</Label>
              <Input
                id="inviteCredits"
                type="number"
                min="1"
                step="1"
                value={inviteCredits}
                onChange={(e) => setInviteCredits(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="inviteMaxUses">Max uses (optional)</Label>
              <Input
                id="inviteMaxUses"
                type="number"
                min="1"
                step="1"
                placeholder="Unlimited if blank"
                value={inviteMaxUses}
                onChange={(e) => setInviteMaxUses(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="inviteExpiresAt">Expiry date/time</Label>
              <Input
                id="inviteExpiresAt"
                type="datetime-local"
                value={inviteExpiresAt}
                onChange={(e) => setInviteExpiresAt(e.target.value)}
                required
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={inviteCreating} className="w-full">
                {inviteCreating ? 'Creating...' : 'Create Invite Link'}
              </Button>
            </div>
          </form>

          <div className="space-y-2">
            {invitesLoading ? (
              <div className="text-sm text-muted-foreground">Loading invite links...</div>
            ) : appInvites.length === 0 ? (
              <div className="text-sm text-muted-foreground">No invite links yet.</div>
            ) : (
              appInvites.map((link) => (
                <div key={link.id} className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 p-3 border rounded-md">
                  <div className="text-sm">
                    <div className="font-medium">
                      {link.welcome_credits} credits • expires {formatDate(link.expires_at)}
                    </div>
                    <div className="text-muted-foreground">
                      Uses: {link.uses}{link.max_uses ? ` / ${link.max_uses}` : ''} • Token: {link.token}
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => copyInviteUrl(link.token)}>
                    Copy URL
                  </Button>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Add Credits Dialog */}
      <Dialog open={!!selectedUser} onOpenChange={(open) => !open && setSelectedUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Credits to {selectedUser?.full_name}</DialogTitle>
            <DialogDescription>
              Add credits to this user's account
            </DialogDescription>
          </DialogHeader>

          <div className="mb-4 p-3 bg-muted rounded-lg">
            <p className="text-sm text-muted-foreground">Current Credits:</p>
            <p className="text-2xl font-bold text-blue-600">{selectedUser?.credits}</p>
          </div>

          <form onSubmit={handleAddCredits} className="space-y-4">
            <div>
              <Label htmlFor="creditAmount">Credits to Add</Label>
              <Input
                id="creditAmount"
                type="number"
                value={creditAmount}
                onChange={(e) => setCreditAmount(e.target.value)}
                placeholder="e.g., 10"
                required
                min="1"
              />
            </div>

            <div>
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g., Payment received via e-transfer"
                rows={3}
              />
            </div>

            <div>
              <Label htmlFor="creditSource">Credit Source</Label>
              <select
                id="creditSource"
                value={creditSource}
                onChange={(e) => setCreditSource(e.target.value as 'cash' | 'in_kind')}
                className="w-full px-3 py-2 border border-input bg-background rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="cash">Cash payment</option>
                <option value="in_kind">In-kind (complimentary)</option>
              </select>
            </div>

            {creditSource === 'in_kind' && (
              <div>
                <Label htmlFor="inKindReason">Reason (required for in-kind)</Label>
                <Input
                  id="inKindReason"
                  value={inKindReason}
                  onChange={(e) => setInKindReason(e.target.value)}
                  placeholder="e.g., Welcome gift for partner community"
                  required
                />
              </div>
            )}

            <div className="flex gap-3">
              <Button
                type="submit"
                disabled={submitting}
                className="flex-1"
              >
                {submitting ? 'Adding...' : 'Add Credits'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setSelectedUser(null)
                  setCreditAmount('')
                  setNotes('')
                  setCreditSource('cash')
                  setInKindReason('')
                }}
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
