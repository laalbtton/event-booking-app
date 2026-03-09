'use client'

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ChevronLeft } from 'lucide-react'

export default function RedeemableCreditsPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:py-10">
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">How Redeemable Credits Work</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Ticketed open mic events can include redeemable credits that you can use at participating venues.
          </p>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">1) Join a ticketed event</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Some events show a redeemable credits indicator. Buy a ticket for those events to unlock venue redemption value.
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">2) Receive redeemable value</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Each eligible event can assign redeemable credits (for example, 5 credits) to your attendance.
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">3) Redeem at the venue</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Venue staff can validate and redeem your credits during the event window.
            </CardContent>
          </Card>
        </div>

        <div className="mt-6 flex gap-2">
          <Button asChild variant="outline">
            <Link href="/credits">View credits history</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
