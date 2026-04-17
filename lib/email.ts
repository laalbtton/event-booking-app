/**
 * Email Service using Resend
 * 
 * This service handles sending transactional emails for:
 * - Booking confirmations
 * - Booking cancellations
 * - Waitlist promotions
 * - Waitlist position changes
 * - Event updates
 * - Event reminders
 */

type EmailAttachment = {
  filename: string
  content: string
  contentType?: string
}

type EmailData = {
  to: string
  subject: string
  html: string
  attachments?: EmailAttachment[]
}

/**
 * Send an email using Resend API
 */
export async function sendEmail({ to, subject, html, attachments }: EmailData): Promise<boolean> {
  const resendApiKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@laalbutton.com'

  if (!resendApiKey) {
    console.error('RESEND_API_KEY is not set. Email not sent.')
    return false
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [to],
        subject,
        html,
        ...(attachments?.length
          ? {
              attachments: attachments.map((a) => ({
                filename: a.filename,
                content: a.content,
              })),
            }
          : {}),
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('Failed to send email:', error)
      return false
    }

    return true
  } catch (error) {
    console.error('Error sending email:', error)
    return false
  }
}

/**
 * Email template for booking confirmation
 */
export function getBookingConfirmationEmail(data: {
  userName: string
  eventTitle: string
  eventDate: string
  eventLocation: string
  creditsUsed: number
  bookingId: string
  eventUrl: string
}): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0;">🎉 Booking Confirmed!</h1>
        </div>
        
        <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb;">
          <p style="font-size: 16px; margin-bottom: 20px;">Hi ${data.userName},</p>
          
          <p style="font-size: 16px; margin-bottom: 20px;">
            Great news! Your booking for <strong>${data.eventTitle}</strong> has been confirmed.
          </p>
          
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981;">
            <h2 style="margin-top: 0; color: #111827;">Event Details</h2>
            <p style="margin: 10px 0;"><strong>📅 Date & Time:</strong> ${data.eventDate}</p>
            <p style="margin: 10px 0;"><strong>📍 Location:</strong> ${data.eventLocation}</p>
            <p style="margin: 10px 0;"><strong>💳 Credits Used:</strong> ${data.creditsUsed}</p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${data.eventUrl}" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
              View Event Details
            </a>
          </div>
          
          <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
            We look forward to seeing you at the event!
          </p>
          
          <p style="font-size: 14px; color: #6b7280; margin-top: 20px;">
            If you need to cancel, you can do so from your dashboard. Refund policies apply based on the cancellation window.
          </p>
        </div>
        
        <div style="text-align: center; margin-top: 20px; color: #9ca3af; font-size: 12px;">
          <p>© 2025 One Mic Stand. All rights reserved.</p>
        </div>
      </body>
    </html>
  `
}

/**
 * Email template for waitlist promotion
 */
export function getWaitlistPromotionEmail(data: {
  userName: string
  eventTitle: string
  eventDate: string
  eventLocation: string
  eventUrl: string
}): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0;">🎉 You're In!</h1>
        </div>
        
        <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb;">
          <p style="font-size: 16px; margin-bottom: 20px;">Hi ${data.userName},</p>
          
          <p style="font-size: 16px; margin-bottom: 20px;">
            <strong>Great news!</strong> A spot has opened up and you've been promoted from the waitlist to confirmed for <strong>${data.eventTitle}</strong>!
          </p>
          
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
            <h2 style="margin-top: 0; color: #111827;">Event Details</h2>
            <p style="margin: 10px 0;"><strong>📅 Date & Time:</strong> ${data.eventDate}</p>
            <p style="margin: 10px 0;"><strong>📍 Location:</strong> ${data.eventLocation}</p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${data.eventUrl}" style="background: #f59e0b; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
              View Event Details
            </a>
          </div>
          
          <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
            We're excited to have you join us! See you at the event.
          </p>
        </div>
        
        <div style="text-align: center; margin-top: 20px; color: #9ca3af; font-size: 12px;">
          <p>© 2025 One Mic Stand. All rights reserved.</p>
        </div>
      </body>
    </html>
  `
}

/**
 * Email template for booking cancellation
 */
export function getBookingCancellationEmail(data: {
  userName: string
  eventTitle: string
  eventDate: string
  creditsRefunded: number
  refundStatus: string
}): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0;">Booking Cancelled</h1>
        </div>
        
        <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb;">
          <p style="font-size: 16px; margin-bottom: 20px;">Hi ${data.userName},</p>
          
          <p style="font-size: 16px; margin-bottom: 20px;">
            Your booking for <strong>${data.eventTitle}</strong> on ${data.eventDate} has been cancelled.
          </p>
          
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ef4444;">
            <h2 style="margin-top: 0; color: #111827;">Refund Information</h2>
            <p style="margin: 10px 0;"><strong>💳 Credits Refunded:</strong> ${data.creditsRefunded}</p>
            <p style="margin: 10px 0;"><strong>📋 Status:</strong> ${data.refundStatus}</p>
          </div>
          
          <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
            Your credits have been returned to your account. You can use them to book other events.
          </p>
          
          <p style="font-size: 14px; color: #6b7280; margin-top: 20px;">
            We're sorry to see you go, but we hope to see you at future events!
          </p>
        </div>
        
        <div style="text-align: center; margin-top: 20px; color: #9ca3af; font-size: 12px;">
          <p>© 2025 One Mic Stand. All rights reserved.</p>
        </div>
      </body>
    </html>
  `
}

export function getCreditPurchaseEmail(data: {
  userName: string
  creditsAdded: number
  newBalance: number
  amountPaid: number
}): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #2563eb 0%, #7c3aed 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0;">Credits Added</h1>
        </div>
        
        <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb;">
          <p style="font-size: 16px; margin-bottom: 20px;">Hi ${data.userName},</p>
          
          <p style="font-size: 16px; margin-bottom: 20px;">
            Your purchase was successful. We added <strong>${data.creditsAdded}</strong> credits to your account.
          </p>
          
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2563eb;">
            <h2 style="margin-top: 0; color: #111827;">Purchase Summary</h2>
            <p style="margin: 10px 0;"><strong>Amount paid:</strong> $${data.amountPaid.toFixed(2)} CAD</p>
            <p style="margin: 10px 0;"><strong>Credits added:</strong> ${data.creditsAdded}</p>
            <p style="margin: 10px 0;"><strong>New balance:</strong> ${data.newBalance} credits</p>
          </div>
          
          <p style="font-size: 14px; color: #6b7280; margin-top: 20px;">
            Thanks for supporting One Mic Stand. See you at the next show!
          </p>
        </div>
        
        <div style="text-align: center; margin-top: 20px; color: #9ca3af; font-size: 12px;">
          <p>© 2025 One Mic Stand. All rights reserved.</p>
        </div>
      </body>
    </html>
  `
}

/**
 * Email template for event cancellation
 */
export function getEventCancelledEmail(data: {
  userName: string
  eventTitle: string
  eventDate: string
  creditsRefunded: number
  eventUrl: string
}): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0;">Event Cancelled</h1>
        </div>
        
        <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb;">
          <p style="font-size: 16px; margin-bottom: 20px;">Hi ${data.userName},</p>
          
          <p style="font-size: 16px; margin-bottom: 20px;">
            Unfortunately, <strong>${data.eventTitle}</strong> scheduled for ${data.eventDate} has been cancelled.
          </p>
          
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ef4444;">
            <h2 style="margin-top: 0; color: #111827;">Refund Information</h2>
            <p style="margin: 10px 0;"><strong>💳 Credits Refunded:</strong> ${data.creditsRefunded}</p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${data.eventUrl}" style="background: #ef4444; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
              View Event
            </a>
          </div>
          
          <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
            Your credits have been returned to your account. You can use them to book other events.
          </p>
        </div>
        
        <div style="text-align: center; margin-top: 20px; color: #9ca3af; font-size: 12px;">
          <p>© 2025 One Mic Stand. All rights reserved.</p>
        </div>
      </body>
    </html>
  `
}

/**
 * Email template for waitlist position change
 */
export function getWaitlistPositionEmail(data: {
  userName: string
  eventTitle: string
  position: number
  previousPosition?: number
  eventUrl: string
}): string {
  const improved = data.previousPosition && data.position < data.previousPosition
  const title = improved ? '🎉 Waitlist Position Improved!' : 'Waitlist Position Update'
  const gradient = improved 
    ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
    : 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)'

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: ${gradient}; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0;">${title}</h1>
        </div>
        
        <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb;">
          <p style="font-size: 16px; margin-bottom: 20px;">Hi ${data.userName},</p>
          
          <p style="font-size: 16px; margin-bottom: 20px;">
            Your waitlist position for <strong>${data.eventTitle}</strong> has been updated.
          </p>
          
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid ${improved ? '#10b981' : '#6366f1'};">
            <h2 style="margin-top: 0; color: #111827;">Your Position</h2>
            ${data.previousPosition ? (
              `<p style="margin: 10px 0; font-size: 18px;">
                <strong>#${data.previousPosition}</strong> → <strong style="color: ${improved ? '#10b981' : '#6366f1'};">#${data.position}</strong>
              </p>`
            ) : (
              `<p style="margin: 10px 0; font-size: 18px;">
                <strong style="color: #6366f1;">#${data.position}</strong>
              </p>`
            )}
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${data.eventUrl}" style="background: ${improved ? '#10b981' : '#6366f1'}; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
              View Event
            </a>
          </div>
          
          <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
            ${improved 
              ? 'You\'re getting closer! We\'ll notify you if a spot opens up.'
              : 'We\'ll notify you as soon as a spot becomes available.'
            }
          </p>
        </div>
        
        <div style="text-align: center; margin-top: 20px; color: #9ca3af; font-size: 12px;">
          <p>© 2025 One Mic Stand. All rights reserved.</p>
        </div>
      </body>
    </html>
  `
}

/**
 * Email template for event reminder
 */
export function getEventReminderEmail(data: {
  userName: string
  eventTitle: string
  eventDate: string
  eventLocation: string
  timeUntilEvent: string
  eventUrl: string
}): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0;">📅 Event Reminder</h1>
        </div>
        
        <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb;">
          <p style="font-size: 16px; margin-bottom: 20px;">Hi ${data.userName},</p>
          
          <p style="font-size: 16px; margin-bottom: 20px;">
            This is a friendly reminder that you have an upcoming event: <strong>${data.eventTitle}</strong>
          </p>
          
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #667eea;">
            <h2 style="margin-top: 0; color: #111827;">Event Details</h2>
            <p style="margin: 10px 0;"><strong>📅 Date & Time:</strong> ${data.eventDate}</p>
            <p style="margin: 10px 0;"><strong>📍 Location:</strong> ${data.eventLocation}</p>
            <p style="margin: 10px 0;"><strong>⏰ Time Until Event:</strong> ${data.timeUntilEvent}</p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${data.eventUrl}" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
              View Event Details
            </a>
          </div>
          
          <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
            We look forward to seeing you there!
          </p>
          
          <p style="font-size: 14px; color: #6b7280; margin-top: 20px;">
            If you can no longer attend, please cancel your booking from your dashboard to free up your spot.
          </p>
        </div>
        
        <div style="text-align: center; margin-top: 20px; color: #9ca3af; font-size: 12px;">
          <p>© 2025 One Mic Stand. All rights reserved.</p>
        </div>
      </body>
    </html>
  `
}

/**
 * Registration Opening Notification Email Template
 */
export function getRegistrationOpeningEmail(data: {
  userName: string
  eventTitle: string
  eventDate: string
  eventLocation: string
  eventUrl: string
}): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0;">🎉 Registration Now Open!</h1>
        </div>
        
        <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb;">
          <p style="font-size: 16px; margin-bottom: 20px;">Hi ${data.userName},</p>
          
          <p style="font-size: 16px; margin-bottom: 20px;">
            Great news! Registration for <strong>${data.eventTitle}</strong> is now open!
          </p>
          
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
            <h2 style="margin-top: 0; color: #111827;">Event Details</h2>
            <p style="margin: 10px 0;"><strong>📅 Date & Time:</strong> ${data.eventDate}</p>
            <p style="margin: 10px 0;"><strong>📍 Location:</strong> ${data.eventLocation}</p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${data.eventUrl}" style="background: #f59e0b; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
              Book Now
            </a>
          </div>
          
          <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
            Don't miss out! Spots may be limited, so book your spot now.
          </p>
        </div>
        
        <div style="text-align: center; margin-top: 20px; color: #9ca3af; font-size: 12px;">
          <p>© 2025 One Mic Stand. All rights reserved.</p>
        </div>
      </body>
    </html>
  `
}

/**
 * Email template for post-event feedback & venue review request.
 * Sent to all confirmed attendees and performers ~1.5 hours after event ends.
 */
export function getPostEventFeedbackEmail(data: {
  userName: string
  eventTitle: string
  eventDate: string
  venueName: string
  venueGoogleReviewUrl: string | null
  feedbackFormUrl: string
  eventUrl: string
  /** Optional custom note from the host, shown at the top of the email body */
  customNote?: string | null
}): string {
  const customNoteSection = data.customNote
    ? `
          <!-- Custom note from host -->
          <div style="background: #f0fdf4; border-left: 4px solid #22c55e; border-radius: 0 8px 8px 0; padding: 16px 20px; margin: 0 0 24px 0;">
            <p style="margin: 0; font-size: 15px; color: #166534; line-height: 1.7; white-space: pre-line;">${data.customNote}</p>
          </div>
    `
    : ''

  const venueReviewSection = data.venueGoogleReviewUrl
    ? `
          <!-- Venue review -->
          <div style="background: #fffbeb; border: 1px solid #fcd34d; border-radius: 10px; padding: 24px; margin: 24px 0;">
            <h2 style="margin: 0 0 10px 0; font-size: 18px; color: #92400e;">⭐ Support ${data.venueName}</h2>
            <p style="margin: 0 0 16px 0; font-size: 15px; color: #78350f; line-height: 1.6;">
              Venues like <strong>${data.venueName}</strong> are the backbone of live comedy and open-mic culture.
              If you enjoyed the space, a quick Google review means the world to them — it only takes a minute!
            </p>
            <div style="text-align: center;">
              <a href="${data.venueGoogleReviewUrl}"
                 style="display: inline-block; background: #f59e0b; color: white; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 15px;">
                Leave a Review on Google ⭐
              </a>
            </div>
          </div>
    `
    : ''

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background: #f3f4f6;">

        <!-- Header -->
        <div style="background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%); padding: 36px 30px; text-align: center; border-radius: 12px 12px 0 0;">
          <p style="color: rgba(255,255,255,0.8); font-size: 14px; margin: 0 0 6px 0; letter-spacing: 1px; text-transform: uppercase;">One Mic Stand</p>
          <h1 style="color: white; margin: 0; font-size: 26px; font-weight: 700;">Thanks for a great show! 🎤</h1>
          <p style="color: rgba(255,255,255,0.85); margin: 10px 0 0 0; font-size: 15px;">${data.eventTitle}</p>
        </div>

        <!-- Body -->
        <div style="background: #ffffff; padding: 32px 30px; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb; border-top: none;">
          <p style="font-size: 16px; margin: 0 0 16px 0;">Hi ${data.userName},</p>

          <p style="font-size: 15px; color: #374151; margin: 0 0 20px 0; line-height: 1.7;">
            Thank you for being part of <strong>${data.eventTitle}</strong> at <strong>${data.venueName}</strong> on ${data.eventDate}.
            We hope you had a fantastic time and made some great memories!
          </p>

          ${customNoteSection}

          <!-- Feedback section -->
          <div style="background: #f5f3ff; border: 1px solid #ddd6fe; border-radius: 10px; padding: 24px; margin: 0 0 24px 0;">
            <h2 style="margin: 0 0 10px 0; font-size: 18px; color: #4c1d95;">💬 Share Your Feedback</h2>
            <p style="margin: 0 0 8px 0; font-size: 15px; color: #5b21b6; line-height: 1.6;">
              Your feedback helps us make every event better for performers and audiences alike.
              It only takes 2 minutes — and every response genuinely matters to us.
            </p>
            <p style="margin: 0 0 18px 0; font-size: 13px; color: #7c3aed; font-style: italic;">
              🔒 Your name is <strong>completely optional</strong> in the form — feel free to respond anonymously.
            </p>
            <div style="text-align: center;">
              <a href="${data.feedbackFormUrl}"
                 style="display: inline-block; background: #7c3aed; color: white; padding: 13px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 15px;">
                Give Feedback →
              </a>
            </div>
          </div>

          ${venueReviewSection}

          <!-- View event -->
          <div style="text-align: center; margin: 28px 0 8px 0;">
            <a href="${data.eventUrl}"
               style="font-size: 13px; color: #6b7280; text-decoration: underline;">
              View event page
            </a>
          </div>

          <p style="font-size: 14px; color: #6b7280; margin: 24px 0 0 0; border-top: 1px solid #f3f4f6; padding-top: 20px; line-height: 1.7;">
            Thanks again for being part of the One Mic Stand community.
            See you at the next show! 🎭
          </p>
        </div>

        <!-- Footer -->
        <div style="text-align: center; margin-top: 20px; color: #9ca3af; font-size: 12px;">
          <p style="margin: 0;">© 2025 One Mic Stand. All rights reserved.</p>
          <p style="margin: 4px 0 0 0;">You received this because you attended or performed at one of our events.</p>
        </div>

      </body>
    </html>
  `
}

// ── Weekly community digest ──────────────────────────────────────────────────

export type DigestCommunitySection = {
  communityName: string
  communityId: string
  events: Array<{
    id: string
    slug: string | null
    title: string
    date: string
    venueName: string | null
    location: string | null
  }>
}

export function getWeeklyDigestEmail(data: {
  userName: string
  sections: DigestCommunitySection[]
  intro: string
  footer: string
  siteUrl: string
}): string {
  const totalEvents = data.sections.reduce((s, c) => s + c.events.length, 0)

  const communityBlocks = data.sections
    .map(
      (section) => `
      <div style="margin: 0 0 28px 0;">
        <h2 style="font-size: 17px; font-weight: 700; color: #1f2937; margin: 0 0 12px 0;
                   padding-bottom: 8px; border-bottom: 2px solid #7c3aed;">
          ${section.communityName}
        </h2>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
          ${section.events
            .map((ev) => {
              const eventUrl = `${data.siteUrl}/events/${ev.slug ?? ev.id}`
              const date = new Date(ev.date).toLocaleDateString('en-CA', {
                weekday: 'short', month: 'short', day: 'numeric',
              })
              const venue = ev.venueName ?? ev.location ?? 'Venue TBA'
              return `
              <tr>
                <td style="padding: 10px 0; border-bottom: 1px solid #f3f4f6; vertical-align: top;">
                  <a href="${eventUrl}" style="font-size: 15px; font-weight: 600; color: #7c3aed; text-decoration: none;">${ev.title}</a>
                  <div style="font-size: 13px; color: #6b7280; margin-top: 2px;">📅 ${date} &nbsp;·&nbsp; 📍 ${venue}</div>
                </td>
                <td style="padding: 10px 0 10px 12px; border-bottom: 1px solid #f3f4f6;
                           vertical-align: middle; text-align: right; white-space: nowrap;">
                  <a href="${eventUrl}" style="font-size: 12px; font-weight: 600; color: #7c3aed;
                     text-decoration: none; border: 1px solid #7c3aed; padding: 4px 10px; border-radius: 6px;">View →</a>
                </td>
              </tr>`
            })
            .join('')}
        </table>
      </div>`,
    )
    .join('')

  return `
    <!DOCTYPE html><html>
      <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background: #f3f4f6;">
        <div style="background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%); padding: 32px 30px; text-align: center; border-radius: 12px 12px 0 0;">
          <p style="color: rgba(255,255,255,0.8); font-size: 13px; margin: 0 0 6px 0; letter-spacing: 1px; text-transform: uppercase;">One Mic Stand</p>
          <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 700;">What's on this week 🎤</h1>
          <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0 0; font-size: 14px;">${totalEvents} upcoming show${totalEvents !== 1 ? 's' : ''} across your communities</p>
        </div>
        <div style="background: #ffffff; padding: 28px 30px; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb; border-top: none;">
          <p style="font-size: 16px; margin: 0 0 20px 0;">Hi ${data.userName},</p>
          <p style="font-size: 15px; color: #374151; margin: 0 0 24px 0; line-height: 1.7;">${data.intro}</p>
          ${communityBlocks}
          <div style="text-align: center; margin: 28px 0 8px 0;">
            <a href="${data.siteUrl}/events" style="display: inline-block; background: #7c3aed; color: white; padding: 13px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 15px;">Browse All Events →</a>
          </div>
          <p style="font-size: 14px; color: #6b7280; margin: 24px 0 0 0; border-top: 1px solid #f3f4f6; padding-top: 20px; line-height: 1.7;">${data.footer}</p>
        </div>
        <div style="text-align: center; margin-top: 20px; color: #9ca3af; font-size: 12px;">
          <p style="margin: 0;">© 2025 One Mic Stand. All rights reserved.</p>
          <p style="margin: 4px 0 0 0;">You received this because you are a member of at least one community on One Mic Stand.</p>
        </div>
      </body>
    </html>`
}

// ── 48-hour pre-event reminder ───────────────────────────────────────────────

export function getPreEventReminderEmail(data: {
  userName: string
  eventTitle: string
  eventDate: string
  eventUrl: string
  venueName: string | null
  venueAddress: string | null
  communityName: string | null
  intro: string
  footer: string
}): string {
  const venue = data.venueName ?? 'TBA'
  const address = data.venueAddress ?? ''
  const communityBadge = data.communityName
    ? `<span style="display:inline-block; background:#ede9fe; color:#6d28d9; font-size:12px; padding:2px 10px; border-radius:9999px; font-weight:600; margin-bottom:16px;">${data.communityName}</span>`
    : ''

  return `
    <!DOCTYPE html><html>
      <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background: #f3f4f6;">
        <div style="background: linear-gradient(135deg, #059669 0%, #047857 100%); padding: 32px 30px; text-align: center; border-radius: 12px 12px 0 0;">
          <p style="color: rgba(255,255,255,0.8); font-size: 13px; margin: 0 0 6px 0; letter-spacing: 1px; text-transform: uppercase;">One Mic Stand</p>
          <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 700;">Your event is in 48 hours ⏰</h1>
        </div>
        <div style="background: #ffffff; padding: 28px 30px; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb; border-top: none;">
          <p style="font-size: 16px; margin: 0 0 16px 0;">Hi ${data.userName},</p>
          <p style="font-size: 15px; color: #374151; margin: 0 0 24px 0; line-height: 1.7;">${data.intro}</p>
          <div style="background: #f5f3ff; border: 1px solid #ddd6fe; border-radius: 12px; padding: 20px 24px; margin: 0 0 24px 0;">
            ${communityBadge}
            <h2 style="font-size: 20px; font-weight: 700; color: #1f2937; margin: 0 0 12px 0;">${data.eventTitle}</h2>
            <div style="font-size: 14px; color: #374151; margin-bottom: 6px;">📅 ${data.eventDate}</div>
            <div style="font-size: 14px; color: #374151; margin-bottom: 20px;">📍 ${venue}${address ? ` — ${address}` : ''}</div>
            <div style="text-align: center;">
              <a href="${data.eventUrl}" style="display: inline-block; background: #7c3aed; color: white; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 15px;">View Event Details →</a>
            </div>
          </div>
          <p style="font-size: 14px; color: #6b7280; margin: 24px 0 0 0; border-top: 1px solid #f3f4f6; padding-top: 20px; line-height: 1.7;">${data.footer}</p>
        </div>
        <div style="text-align: center; margin-top: 20px; color: #9ca3af; font-size: 12px;">
          <p style="margin: 0;">© 2025 One Mic Stand. All rights reserved.</p>
          <p style="margin: 4px 0 0 0;">You received this because you have a confirmed registration for this event.</p>
        </div>
      </body>
    </html>`
}
