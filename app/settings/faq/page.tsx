'use client'

import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChevronLeft } from 'lucide-react'

export default function SettingsFaqPage() {
  return (
    <div className="min-h-screen bg-background pb-20">
<div className="max-w-4xl mx-auto px-4 py-6 sm:py-8 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 mb-6">
          <Link href="/settings" className="p-1 -ml-1 rounded hover:bg-muted shrink-0" aria-label="Back to Settings">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-2xl font-bold">FAQ</h1>
        </div>
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl">FAQ</CardTitle>
            <CardDescription>Frequently asked questions about credits and events.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium">Redeemable Credits</p>
              <p className="text-sm text-muted-foreground mt-1">
                Attend events free with Redeemable Credits.{' '}
                <Link href="/redeemable-credits" className="underline underline-offset-2 font-medium text-foreground">
                  How this works
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
