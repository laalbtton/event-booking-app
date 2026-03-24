'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-background py-6 sm:py-8 px-4 pb-20">
      <div className="max-w-2xl mx-auto">
        <Card className="shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-2xl sm:text-3xl font-bold tracking-tight">Contact Us</CardTitle>
            <CardDescription className="text-base mt-1">
              Have questions or need help? We're here for you!
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2.5">
              <h3 className="font-semibold text-base tracking-tight">Email</h3>
              <a href="mailto:events@laalbutton.com" className="text-primary hover:underline text-base font-medium transition-colors">
                events@laalbutton.com
              </a>
            </div>

            <Separator className="my-6" />

            <div className="space-y-2.5">
              <h3 className="font-semibold text-base tracking-tight">Response Time</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">Within 48 hours</p>
            </div>

            <Separator className="my-6" />

            <div className="space-y-3">
              <h3 className="font-semibold text-base tracking-tight">Common Questions</h3>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-2 leading-relaxed pl-1">
                <li>How do I book an event? → Browse events and click "Book Event"</li>
                <li>How do credits work? → Each event costs credits (usually 5)</li>
                <li>How do I buy credits? → Contact us via email for now</li>
                <li>Can I get a refund? → Yes, the refund policy is in the event details</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
</div>
  )
}