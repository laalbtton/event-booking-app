'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type PushPermissionPrePromptProps = {
  open: boolean
  onEnable: () => void
  onNotNow: () => void
  loading?: boolean
}

export function PushPermissionPrePrompt({
  open,
  onEnable,
  onNotNow,
  loading = false,
}: PushPermissionPrePromptProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[1200] bg-black/40 px-4 py-8">
      <div className="mx-auto max-w-md">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Stay updated with event alerts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Turn on notifications to get waitlist promotions, booking updates, and event reminders.
            </p>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={onEnable} disabled={loading}>
                {loading ? 'Enabling...' : 'Enable notifications'}
              </Button>
              <Button variant="outline" className="flex-1" onClick={onNotNow} disabled={loading}>
                Not now
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

