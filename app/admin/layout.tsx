'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuthBootstrap } from '@/components/providers/auth-bootstrap-provider'
import Link from 'next/link'
import NavigationTabs from '@/components/NavigationTabs'
import { useIsMobile } from '@/hooks/useMediaQuery'
import { ChevronLeft, Users, MapPin, BookOpen, CreditCard, ClipboardList, Globe, Mail } from 'lucide-react'

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
  const isMobile = useIsMobile()

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

  const NAV_ITEMS = [
    { href: '/admin/users',            label: 'Users',           icon: Users,         exact: true },
    { href: '/admin/venues',           label: 'Venues',          icon: MapPin,        exact: true },
    { href: '/admin/bookings',         label: 'Bookings',        icon: BookOpen,      exact: true },
    { href: '/admin/transactions',     label: 'Transactions',    icon: CreditCard,    exact: false },
    { href: '/admin/requests',         label: 'Requests',        icon: ClipboardList, exact: true },
    { href: '/admin/communities',      label: 'Communities',     icon: Globe,         exact: false },
    { href: '/admin/email-templates',  label: 'Email Templates', icon: Mail,          exact: false },
  ]

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Admin Sub-Navigation — scrollable on mobile, full row on desktop */}
      <div className="bg-white shadow sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-2 sm:px-6 lg:px-8">
          {/* Back link — mobile only, above the nav strip */}
          {isMobile && (
            <div className="pt-2 px-2">
              <Link
                href={pathname === '/admin' ? '/settings' : '/settings'}
                className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-900"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Settings
              </Link>
            </div>
          )}
          <nav className="flex overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] gap-1 py-2 sm:py-0 sm:gap-0 sm:space-x-6">
            {NAV_ITEMS.map(({ href, label, icon: Icon, exact }) => {
              const active = exact ? pathname === href : pathname.startsWith(href)
              return (
                <Link
                  key={href}
                  href={href}
                  className={`
                    flex-shrink-0 inline-flex flex-col sm:flex-row items-center gap-1 sm:gap-1.5
                    px-3 py-2 sm:py-4 rounded-lg sm:rounded-none text-xs sm:text-sm font-medium
                    transition-colors whitespace-nowrap
                    ${active
                      ? 'text-purple-600 bg-purple-50 sm:bg-transparent sm:border-b-2 sm:border-purple-600'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50 sm:hover:bg-transparent'
                    }
                  `}
                >
                  <Icon className="h-4 w-4 sm:hidden" />
                  {label}
                </Link>
              )
            })}
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