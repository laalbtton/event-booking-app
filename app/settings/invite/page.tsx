'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { SettingsSkeleton } from '@/components/skeletons/SettingsSkeleton'

/** Invite QR lives under Promotions; keep this route as a redirect for old links. */
export default function InviteAudienceSettingsRedirect() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/promotions/invite')
  }, [router])

  return <SettingsSkeleton />
}
