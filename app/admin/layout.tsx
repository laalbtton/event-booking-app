'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuthBootstrap } from '@/components/providers/auth-bootstrap-provider'
import Link from 'next/link'
import NavigationTabs from '@/components/NavigationTabs'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const { authResolved, user } = useAuthBootstrap()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (!authResolved) return
    if (!user) {
      setLoading(false)
      router.push('/login')
      return
    }
    setLoading(true)
    void checkAdmin(user.id)
  }, [authResolved, user, router])

  async function checkAdmin(userId: string) {
    // Check user role - only admins can access admin panel
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single()

    if (profileError || !profile) {
      // Fallback: check admin_users table for backward compatibility
      const { data: adminData } = await supabase
        .from('admin_users')
        .select('*')
        .eq('user_id', userId)
        .single()

      if (!adminData) {
        router.push('/dashboard')
        return
      }
    } else if (profile.role !== 'admin') {
      router.push('/dashboard')
      return
    }

    setIsAdmin(true)
    setLoading(false)
  }


  if (!authResolved || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-2xl">Loading...</div>
      </div>
    )
  }

  if (!isAdmin) {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Admin Sub-Navigation */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8 py-4">
            <Link
              href="/admin"
              className={`font-medium transition-colors ${
                pathname === '/admin'
                  ? 'text-purple-600 border-b-2 border-purple-600 pb-1'
                  : 'text-gray-700 hover:text-gray-900'
              }`}
            >
              Users
            </Link>
            <Link
              href="/admin/venues"
              className={`font-medium transition-colors ${
                pathname === '/admin/venues'
                  ? 'text-purple-600 border-b-2 border-purple-600 pb-1'
                  : 'text-gray-700 hover:text-gray-900'
              }`}
            >
              Venues
            </Link>
            <Link
              href="/admin/bookings"
              className={`font-medium transition-colors ${
                pathname === '/admin/bookings'
                  ? 'text-purple-600 border-b-2 border-purple-600 pb-1'
                  : 'text-gray-700 hover:text-gray-900'
              }`}
            >
              Bookings
            </Link>
            <Link
              href="/admin/transactions"
              className={`font-medium transition-colors ${
                pathname === '/admin/transactions'
                  ? 'text-purple-600 border-b-2 border-purple-600 pb-1'
                  : 'text-gray-700 hover:text-gray-900'
              }`}
            >
              Transactions
            </Link>
            <Link
              href="/admin/requests"
              className={`font-medium transition-colors ${
                pathname === '/admin/requests'
                  ? 'text-purple-600 border-b-2 border-purple-600 pb-1'
                  : 'text-gray-700 hover:text-gray-900'
              }`}
            >
              Requests
            </Link>
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </div>

      {/* Bottom Navigation */}
      <NavigationTabs />
    </div>
  )
}