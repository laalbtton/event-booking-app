'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabase'
import { signOutAndCleanup } from '@/lib/authClient'
import { toast } from 'sonner'

const CONFIRM_TEXT = 'DELETE'

export function DeleteAccountForm() {
  const router = useRouter()
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleDeleteAccount() {
    if (confirm.trim().toUpperCase() !== CONFIRM_TEXT) {
      toast.error(`Type ${CONFIRM_TEXT} to confirm`)
      return
    }

    setLoading(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) {
        toast.error('Please sign in again, then try deleting your account.')
        return
      }

      const res = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error((body as { error?: string }).error || 'Could not delete account')
        return
      }

      await signOutAndCleanup()
      toast.success('Your account has been deleted')
      router.replace('/')
    } catch {
      toast.error('Could not delete your account. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground leading-relaxed">
        This permanently deletes your One Mic Stand account and associated app data
        (profile, bookings, push tokens, and community memberships). Payment records
        required by law may be kept. This cannot be undone.
      </p>
      <div className="space-y-2">
        <Label htmlFor="delete-account-confirm">
          Type <span className="font-mono font-semibold">{CONFIRM_TEXT}</span> to confirm
        </Label>
        <Input
          id="delete-account-confirm"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder={CONFIRM_TEXT}
          autoComplete="off"
        />
      </div>
      <Button
        variant="destructive"
        className="w-full"
        disabled={loading || confirm.trim().toUpperCase() !== CONFIRM_TEXT}
        onClick={() => void handleDeleteAccount()}
      >
        {loading ? 'Deleting…' : 'Permanently delete my account'}
      </Button>
    </div>
  )
}
