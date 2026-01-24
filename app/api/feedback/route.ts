import { NextRequest, NextResponse } from 'next/server'
import { sendEmail } from '@/lib/email'

type FeedbackPayload = {
  email?: string
  rating?: number | null
  message: string
  path?: string
  userId?: string | null
  userRole?: string | null
  userAgent?: string
}

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as FeedbackPayload

    if (!payload.message || !payload.message.trim()) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    const ratingText = payload.rating ? `${payload.rating}/5` : 'N/A'
    const emailText = payload.email || 'N/A'
    const pathText = payload.path || 'N/A'
    const userIdText = payload.userId || 'N/A'
    const roleText = payload.userRole || 'N/A'
    const userAgentText = payload.userAgent || 'N/A'

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111; max-width: 600px; margin: 0 auto;">
        <h2 style="margin-bottom: 12px;">New Alpha Feedback</h2>
        <p><strong>Message:</strong></p>
        <p style="white-space: pre-wrap; background: #f9fafb; padding: 12px; border-radius: 6px; border: 1px solid #e5e7eb;">${payload.message}</p>
        <hr style="margin: 20px 0; border: none; border-top: 1px solid #e5e7eb;" />
        <p><strong>Rating:</strong> ${ratingText}</p>
        <p><strong>Email:</strong> ${emailText}</p>
        <p><strong>Path:</strong> ${pathText}</p>
        <p><strong>User ID:</strong> ${userIdText}</p>
        <p><strong>Role:</strong> ${roleText}</p>
        <p><strong>User Agent:</strong> ${userAgentText}</p>
      </div>
    `

    const emailSent = await sendEmail({
      to: 'events.laalbutton@gmail.com',
      subject: 'Alpha Feedback - Laal Button',
      html,
    })

    if (!emailSent) {
      return NextResponse.json({ error: 'Failed to send feedback' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error in feedback API:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
