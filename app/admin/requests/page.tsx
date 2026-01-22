'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/dateUtils'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

type RoleChangeRequest = {
  id: string
  user_id: string
  requested_role: string
  from_role: string
  status: 'pending' | 'approved' | 'rejected'
  message: string | null
  admin_notes: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  profiles: {
    id: string
    full_name: string | null
    email: string
  }
}

export default function AdminRequestsPage() {
  const [requests, setRequests] = useState<RoleChangeRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all')
  const [selectedRequest, setSelectedRequest] = useState<RoleChangeRequest | null>(null)
  const [adminNotes, setAdminNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    loadRequests()
  }, [])

  async function loadRequests() {
    setLoading(true)
    try {
      const { data: requestsData, error: requestsError } = await supabase
        .from('role_change_requests')
        .select('*')
        .order('created_at', { ascending: false })

      if (requestsError) throw requestsError

      const userIds = [...new Set((requestsData || []).map((r: any) => r.user_id))]
      
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds)

      if (profilesError) throw profilesError

      const profilesMap = new Map((profilesData || []).map((p: any) => [p.id, p]))
      
      const transformedData = (requestsData || []).map((request: any) => ({
        ...request,
        profiles: profilesMap.get(request.user_id) || { id: request.user_id, full_name: null, email: null }
      }))
      
      setRequests(transformedData as any)
    } catch (error: any) {
      console.error('Error loading requests:', error)
      alert('Error loading requests: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleReviewRequest(requestId: string, status: 'approved' | 'rejected') {
    if (!selectedRequest) return

    setSubmitting(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { error: updateError } = await supabase
        .from('role_change_requests')
        .update({
          status,
          admin_notes: adminNotes || null,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString()
        })
        .eq('id', requestId)

      if (updateError) throw updateError

      if (status === 'approved') {
        const { error: roleError } = await supabase
          .from('profiles')
          .update({
            role: selectedRequest.requested_role,
            updated_at: new Date().toISOString()
          })
          .eq('id', selectedRequest.user_id)

        if (roleError) throw roleError
      }

      alert(`Request ${status === 'approved' ? 'approved' : 'rejected'} successfully!`)
      setSelectedRequest(null)
      setAdminNotes('')
      loadRequests()
    } catch (error: any) {
      console.error('Error reviewing request:', error)
      alert('Error: ' + error.message)
    } finally {
      setSubmitting(false)
    }
  }

  const filteredRequests = filter === 'all'
    ? requests
    : requests.filter(r => r.status === filter)

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
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-bold text-gray-900">Role Change Requests</h2>
        <div className="flex gap-2">
          <Button
            variant={filter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('all')}
          >
            All
          </Button>
          <Button
            variant={filter === 'pending' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('pending')}
          >
            Pending ({requests.filter(r => r.status === 'pending').length})
          </Button>
          <Button
            variant={filter === 'approved' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('approved')}
          >
            Approved
          </Button>
          <Button
            variant={filter === 'rejected' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('rejected')}
          >
            Rejected
          </Button>
        </div>
      </div>

      {/* Requests Table */}
      <Card>
        <CardContent className="p-0">
          {filteredRequests.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No requests found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      User
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Current Role
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Requested Role
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Message
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Requested
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredRequests.map((request) => (
                    <tr key={request.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {request.profiles.full_name || 'N/A'}
                        </div>
                        <div className="text-sm text-gray-500">{request.profiles.email}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge variant="secondary">{request.from_role}</Badge>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge variant="default">{request.requested_role}</Badge>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-500 max-w-xs truncate">
                          {request.message || 'No message'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge
                          variant={
                            request.status === 'pending'
                              ? 'outline'
                              : request.status === 'approved'
                              ? 'default'
                              : 'destructive'
                          }
                          className={cn(
                            request.status === 'pending' && 'bg-yellow-100 text-yellow-800',
                            request.status === 'approved' && 'bg-green-100 text-green-800',
                            request.status === 'rejected' && 'bg-red-100 text-red-800'
                          )}
                        >
                          {request.status}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(request.created_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        {request.status === 'pending' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedRequest(request)}
                          >
                            Review
                          </Button>
                        )}
                        {request.status !== 'pending' && request.admin_notes && (
                          <div className="text-xs text-gray-500">
                            Notes: {request.admin_notes}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Review Dialog */}
      <Dialog open={!!selectedRequest && selectedRequest.status === 'pending'} onOpenChange={(open) => {
        if (!open) {
          setSelectedRequest(null)
          setAdminNotes('')
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review Role Change Request</DialogTitle>
            <DialogDescription>Review and approve or reject this role change request</DialogDescription>
          </DialogHeader>
          
          <div className="mb-4 space-y-3">
            <div>
              <p className="text-sm font-medium text-gray-700">User:</p>
              <p className="text-lg">{selectedRequest?.profiles.full_name || 'N/A'} ({selectedRequest?.profiles.email})</p>
            </div>
            <div className="flex gap-4">
              <div>
                <p className="text-sm font-medium text-gray-700">From Role:</p>
                <Badge variant="secondary">{selectedRequest?.from_role}</Badge>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700">Requested Role:</p>
                <Badge variant="default">{selectedRequest?.requested_role}</Badge>
              </div>
            </div>
            {selectedRequest?.message && (
              <div>
                <p className="text-sm font-medium text-gray-700">User Message:</p>
                <p className="text-gray-600 bg-muted p-3 rounded-lg">{selectedRequest.message}</p>
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault()
            }}
            className="space-y-4"
          >
            <div>
              <Label htmlFor="admin-notes">Admin Notes (optional)</Label>
              <Textarea
                id="admin-notes"
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                placeholder="Add notes about this decision..."
                rows={3}
              />
            </div>

            <div className="flex gap-3">
              <Button
                type="button"
                onClick={() => selectedRequest && handleReviewRequest(selectedRequest.id, 'approved')}
                disabled={submitting}
                className="flex-1"
              >
                {submitting ? 'Processing...' : 'Approve'}
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => selectedRequest && handleReviewRequest(selectedRequest.id, 'rejected')}
                disabled={submitting}
                className="flex-1"
              >
                {submitting ? 'Processing...' : 'Reject'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setSelectedRequest(null)
                  setAdminNotes('')
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
