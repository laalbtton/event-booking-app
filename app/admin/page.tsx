'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useIsMobile } from '@/hooks/useMediaQuery'
import { SettingsListRow } from '@/components/SettingsListRow'
import { Card, CardContent } from '@/components/ui/card'
import { Users, Building2, CalendarCheck, CreditCard, FileText, Globe, Mail } from 'lucide-react'

export default function AdminPage() {
  const router = useRouter()
  const isMobile = useIsMobile()

  useEffect(() => {
    if (!isMobile) {
      router.replace('/admin/users')
    }
  }, [isMobile, router])

  if (!isMobile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-2xl">Redirecting...</div>
      </div>
    )
  }

  return (
    <div>
      <Card className="shadow-sm overflow-hidden">
        <CardContent className="p-0 divide-y divide-border">
          <div className="px-4 pt-2 pb-1">
            <SettingsListRow href="/admin/users" icon={Users} title="Users" description="Manage users and invite links" />
          </div>
          <div className="px-4 py-1">
            <SettingsListRow href="/admin/venues" icon={Building2} title="Venues" description="Manage venues" />
          </div>
          <div className="px-4 py-1">
            <SettingsListRow href="/admin/bookings" icon={CalendarCheck} title="Bookings" description="View bookings" />
          </div>
          <div className="px-4 py-1">
            <SettingsListRow href="/admin/transactions" icon={CreditCard} title="Transactions" description="Credits and reports" />
          </div>
          <div className="px-4 py-1">
            <SettingsListRow href="/admin/requests" icon={FileText} title="Requests" description="Event creator requests" />
          </div>
          <div className="px-4 py-1">
            <SettingsListRow href="/admin/communities" icon={Globe} title="Communities" description="Manage communities" />
          </div>
          <div className="px-4 py-1 pb-2">
            <SettingsListRow href="/admin/resend-tools" icon={Mail} title="Resend Tools" description="Backfill audience & send digest" />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
