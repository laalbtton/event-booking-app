'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

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
      // First, get all requests
      const { data: requestsData, error: requestsError } = await supabase
        .from('role_change_requests')
        .select('*')
        .order('created_at', { ascending: false })

      if (requestsError) throw requestsError

      // Then, get user profiles for each request
      const userIds = [...new Set((requestsData || []).map((r: any) => r.user_id))]
      
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds)

      if (profilesError) throw profilesError

      // Combine the data
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

      // Update request status
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

      // If approved, update user role
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
    return <div className="text-center py-8">Loading requests...</div>
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-bold text-gray-900">Role Change Requests</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg font-medium ${
              filter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter('pending')}
            className={`px-4 py-2 rounded-lg font-medium ${
              filter === 'pending' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'
            }`}
          >
            Pending ({requests.filter(r => r.status === 'pending').length})
          </button>
          <button
            onClick={() => setFilter('approved')}
            className={`px-4 py-2 rounded-lg font-medium ${
              filter === 'approved' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'
            }`}
          >
            Approved
          </button>
          <button
            onClick={() => setFilter('rejected')}
            className={`px-4 py-2 rounded-lg font-medium ${
              filter === 'rejected' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'
            }`}
          >
            Rejected
          </button>
        </div>
      </div>

      {/* Requests Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {filteredRequests.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No requests found
          </div>
        ) : (
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
                    <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">
                      {request.from_role}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                      {request.requested_role}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-500 max-w-xs truncate">
                      {request.message || 'No message'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {request.status === 'pending' && (
                      <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
                        Pending
                      </span>
                    )}
                    {request.status === 'approved' && (
                      <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                        Approved
                      </span>
                    )}
                    {request.status === 'rejected' && (
                      <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
                        Rejected
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(request.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    {request.status === 'pending' && (
                      <button
                        onClick={() => setSelectedRequest(request)}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        Review
                      </button>
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
        )}
      </div>

      {/* Review Modal */}
      {selectedRequest && selectedRequest.status === 'pending' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6">
            <h3 className="text-xl font-bold mb-4 text-gray-900">Review Role Change Request</h3>
            
            <div className="mb-4 space-y-3">
              <div>
                <p className="text-sm font-medium text-gray-700">User:</p>
                <p className="text-lg">{selectedRequest.profiles.full_name || 'N/A'} ({selectedRequest.profiles.email})</p>
              </div>
              <div className="flex gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-700">From Role:</p>
                  <span className="px-3 py-1 text-sm font-semibold rounded-full bg-gray-100 text-gray-800">
                    {selectedRequest.from_role}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700">Requested Role:</p>
                  <span className="px-3 py-1 text-sm font-semibold rounded-full bg-blue-100 text-blue-800">
                    {selectedRequest.requested_role}
                  </span>
                </div>
              </div>
              {selectedRequest.message && (
                <div>
                  <p className="text-sm font-medium text-gray-700">User Message:</p>
                  <p className="text-gray-600 bg-gray-50 p-3 rounded-lg">{selectedRequest.message}</p>
                </div>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                // Will be handled by buttons
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Admin Notes (optional)
                </label>
                <textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Add notes about this decision..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={3}
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => handleReviewRequest(selectedRequest.id, 'approved')}
                  disabled={submitting}
                  className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400 font-medium"
                >
                  {submitting ? 'Processing...' : 'Approve'}
                </button>
                <button
                  type="button"
                  onClick={() => handleReviewRequest(selectedRequest.id, 'rejected')}
                  disabled={submitting}
                  className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:bg-gray-400 font-medium"
                >
                  {submitting ? 'Processing...' : 'Reject'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedRequest(null)
                    setAdminNotes('')
                  }}
                  className="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-400 font-medium"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
