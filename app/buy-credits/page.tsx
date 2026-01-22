'use client'

import NavigationTabs from '@/components/NavigationTabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

export default function BuyCreditsPage() {
  return (
    <div className="min-h-screen bg-background py-6 sm:py-8 px-4 pb-20">
      <div className="max-w-2xl mx-auto">
        <Card className="shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-2xl sm:text-3xl font-bold tracking-tight">Buy Credits</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <Card className="border-blue-200 bg-blue-50/50 shadow-none">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold text-blue-900">During Alpha Testing</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-sm text-blue-800 leading-relaxed">
                  We're currently in testing phase. To purchase credits:
                </p>
              </CardContent>
            </Card>

            <div className="space-y-6">
              <div className="space-y-3">
                <h3 className="font-semibold text-lg sm:text-xl tracking-tight">Step 1: Send E-Transfer</h3>
                <div className="space-y-1.5">
                  <p className="text-sm text-muted-foreground leading-relaxed">Send an Interac e-Transfer to:</p>
                  <p className="text-xl sm:text-2xl font-bold text-primary tracking-tight">billing@laalbutton.com</p>
                  <p className="text-xs text-muted-foreground">
                    Amount: $1 = 1 credit (minimum $10)
                  </p>
                </div>
              </div>

              <Separator className="my-6" />

              <div className="space-y-3">
                <h3 className="font-semibold text-lg sm:text-xl tracking-tight">Step 2: Include Your Email</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  In the e-Transfer message, include the email you used to sign up.
                </p>
              </div>

              <Separator className="my-6" />

              <div className="space-y-3">
                <h3 className="font-semibold text-lg sm:text-xl tracking-tight">Step 3: Wait for Confirmation</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  We'll manually add credits to your account within 24 hours and send you a confirmation email.
                </p>
              </div>

              <Card className="border-yellow-200 bg-yellow-50/50 shadow-none mt-6">
                <CardContent className="pt-6">
                  <p className="text-sm text-yellow-800 leading-relaxed">
                    💡 <strong>Coming Soon:</strong> Instant credit purchase with automatic processing!
                  </p>
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>
      </div>
      <NavigationTabs />
    </div>
  )
}