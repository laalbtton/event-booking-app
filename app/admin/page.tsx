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
import { cn } from '@/lib/utils'

export default function AdminUsersPage() {
  const [users, setUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null)
  const [creditAmount, setCreditAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    loadUsers()
  }, [])

  async function loadUsers() {
    setLoading(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })

    if (!error && data) {
      setUsers(data)
    }
    setLoading(false)
  }

  async function handleAddCredits(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedUser) return

    setSubmitting(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const amount = parseInt(creditAmount)

      // Get current credits
      const { data: currentProfile, error: fetchError } = await supabase
        .from('profiles')
        .select('credits')
        .eq('id', selectedUser.id)
        .single()

      if (fetchError) throw fetchError

      // Update credits
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          credits: currentProfile.credits + amount,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedUser.id)

      if (updateError) throw updateError

      // Log transaction
      const { error: transactionError } = await supabase
        .from('credit_transactions')
        .insert({
          user_id: selectedUser.id,
          amount: amount,
          transaction_type: 'manual_add',
          notes: notes || `Manual credit adjustment by admin`,
          created_by: user.id
        })

      if (transactionError) throw transactionError

      alert('Credits added successfully!')
      loadUsers()
      setSelectedUser(null)
      setCreditAmount('')
      setNotes('')
    } catch (error: any) {
      console.error('Error adding credits:', error)
      alert('Error: ' + error.message)
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
                            const newRole = e.target.value as 'performer' | 'event_creator' | 'admin'
                            const { error } = await supabase
                              .from('profiles')
                              .update({ role: newRole, updated_at: new Date().toISOString() })
                              .eq('id', user.id)
                            
                            if (error) throw error
                            loadUsers()
                          } catch (error: any) {
                            alert('Error updating role: ' + error.message)
                          }
                        }}
                        className="text-sm border border-input bg-background rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        <option value="performer">Performer</option>
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
