'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import NavigationTabs from '@/components/NavigationTabs'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    checkAdmin()
  }, [])

  async function checkAdmin() {
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      router.push('/login')
      return
    }

    // Check user role - only admins can access admin panel
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      // Fallback: check admin_users table for backward compatibility
      const { data: adminData } = await supabase
        .from('admin_users')
        .select('*')
        .eq('user_id', user.id)
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


  if (loading) {
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
              href="/admin/events"
              className={`font-medium transition-colors ${
                pathname === '/admin/events'
                  ? 'text-purple-600 border-b-2 border-purple-600 pb-1'
                  : 'text-gray-700 hover:text-gray-900'
              }`}
            >
              Events
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