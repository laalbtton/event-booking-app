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

import { formatDigestEventDatePartsEastern } from '@/lib/dateUtils'

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

export function getHostCancellationEmail(data: {
  userName: string
  eventTitle: string
  eventDate: string
  creditsRefunded: number
  hostNote: string | null
  eventUrl: string
}): string {
  const noteSection = data.hostNote
    ? `
      <div style="background:#fef9c3;border-left:4px solid #eab308;border-radius:0 8px 8px 0;padding:16px 20px;margin:0 0 24px 0;">
        <p style="margin:0 0 6px 0;font-size:13px;font-weight:600;color:#854d0e;text-transform:uppercase;letter-spacing:.05em;">Note from the host</p>
        <p style="margin:0;font-size:15px;color:#713f12;line-height:1.7;white-space:pre-line;">${data.hostNote}</p>
      </div>`
    : ''

  const refundSection = data.creditsRefunded > 0
    ? `<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:16px 20px;margin:0 0 24px 0;">
        <p style="margin:0;font-size:15px;color:#166534;">
          💳 <strong>${data.creditsRefunded} credit${data.creditsRefunded !== 1 ? 's' : ''}</strong> have been returned to your account.
        </p>
      </div>`
    : ''

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;">
  <div style="background:linear-gradient(135deg,#ef4444 0%,#dc2626 100%);padding:30px;text-align:center;border-radius:10px 10px 0 0;">
    <h1 style="color:white;margin:0;font-size:24px;">Spot Removed</h1>
  </div>
  <div style="background:#f9fafb;padding:30px;border-radius:0 0 10px 10px;border:1px solid #e5e7eb;">
    <p style="font-size:16px;margin-bottom:20px;">Hi ${data.userName},</p>
    <p style="font-size:16px;margin-bottom:24px;">
      Your spot at <strong>${data.eventTitle}</strong> on ${data.eventDate} has been removed by the host.
    </p>
    ${noteSection}
    ${refundSection}
    <div style="text-align:center;margin-top:24px;">
      <a href="${data.eventUrl}" style="display:inline-block;background:#1d4ed8;color:white;padding:12px 28px;text-decoration:none;border-radius:8px;font-weight:bold;font-size:15px;">
        View Event
      </a>
    </div>
    <p style="font-size:14px;color:#6b7280;margin-top:30px;">
      We hope to see you at future events!
    </p>
  </div>
  <div style="text-align:center;margin-top:20px;color:#9ca3af;font-size:12px;">
    <p>© 2025 One Mic Stand. All rights reserved.</p>
  </div>
</body>
</html>`
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
// Colour palette mirrors the public /events page (zinc/stone dark + yellow-400)
// #09090b = zinc-950 (page bg)   #18181b = zinc-900 (card bg)
// #27272a = zinc-800              #3f3f46 = zinc-700 (border)
// #f5f5f4 = stone-100 (text)     #a8a29e = stone-400 (meta)
// #fbbf24 = yellow-400 (accent)

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
    /** Event poster URL — shown as the card image when present */
    posterUrl: string | null
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

  /** Build one dark event card (table-based for email-client compatibility) */
  function eventCard(ev: DigestCommunitySection['events'][number], siteUrl: string): string {
    const eventUrl = `${siteUrl}/events/${ev.slug ?? ev.id}`
    const { dateLine: date, timeLine: time } = formatDigestEventDatePartsEastern(ev.date)
    const venue = ev.venueName ?? ev.location ?? 'Venue TBA'

    const imageBlock = ev.posterUrl
      ? `<a href="${eventUrl}" style="display:block; text-decoration:none;">
           <img src="${ev.posterUrl}" alt="${ev.title}" width="560"
                style="display:block; width:100%; max-height:280px; object-fit:cover;
                       border-radius:10px 10px 0 0; background:#27272a;" />
         </a>`
      : `<div style="background:#27272a; border-radius:10px 10px 0 0; padding:32px;
                     text-align:center; font-size:32px;">🎤</div>`

    return `
      <div style="margin:0 0 20px 0; border-radius:10px; border:1px solid #3f3f46;
                  background:#18181b; overflow:hidden;">
        ${imageBlock}
        <div style="padding:18px 20px 20px;">
          <a href="${eventUrl}"
             style="display:block; font-size:17px; font-weight:700; color:#f5f5f4;
                    text-decoration:none; line-height:1.35; margin-bottom:10px;">
            ${ev.title}
          </a>
          <table cellpadding="0" cellspacing="0" style="width:100%; border-collapse:collapse;">
            <tr>
              <td style="font-size:13px; color:#a8a29e; padding:3px 0; vertical-align:top; width:18px;">📅</td>
              <td style="font-size:13px; color:#a8a29e; padding:3px 0;">${date} &nbsp;·&nbsp; ${time} ET</td>
            </tr>
            <tr>
              <td style="font-size:13px; color:#a8a29e; padding:3px 0; vertical-align:top;">📍</td>
              <td style="font-size:13px; color:#a8a29e; padding:3px 0;">${venue}</td>
            </tr>
          </table>
          <div style="margin-top:16px;">
            <a href="${eventUrl}"
               style="display:inline-block; background:#fbbf24; color:#09090b;
                      font-size:13px; font-weight:700; padding:9px 20px;
                      border-radius:7px; text-decoration:none; letter-spacing:0.01em;">
              View event →
            </a>
          </div>
        </div>
      </div>`
  }

  const communityBlocks = data.sections.map((section) => `
    <div style="margin:0 0 32px 0;">
      <h2 style="font-size:15px; font-weight:700; color:#fbbf24; margin:0 0 16px 0;
                 text-transform:uppercase; letter-spacing:0.08em; border-bottom:1px solid #3f3f46;
                 padding-bottom:8px;">
        ${section.communityName}
      </h2>
      ${section.events.map((ev) => eventCard(ev, data.siteUrl)).join('')}
    </div>`).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>What's on this week</title>
</head>
<body style="margin:0; padding:0; background:#09090b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#09090b; min-height:100vh;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%;">

          <!-- Header -->
          <tr>
            <td style="padding:0 0 28px 0; text-align:center;">
              <p style="margin:0 0 12px 0; font-size:12px; letter-spacing:2px; text-transform:uppercase;
                         color:#78716c; font-weight:600;">One Mic Stand</p>
              <h1 style="margin:0; font-size:30px; font-weight:800; color:#f5f5f4; line-height:1.2;">
                What&rsquo;s on this week 🎤
              </h1>
              <p style="margin:10px 0 0 0; font-size:14px; color:#a8a29e;">
                ${totalEvents} upcoming show${totalEvents !== 1 ? 's' : ''} across your communities
              </p>
              <p style="margin:8px 0 0 0; font-size:12px; color:#78716c;">
                Event times are in Eastern Time (US and Canada).
              </p>
            </td>
          </tr>

          <!-- Divider -->
          <tr><td style="border-top:1px solid #3f3f46; padding:0 0 28px 0;"></td></tr>

          <!-- Greeting + intro -->
          <tr>
            <td style="padding:0 0 28px 0;">
              <p style="margin:0 0 12px 0; font-size:16px; color:#f5f5f4;">Hi ${data.userName},</p>
              <p style="margin:0; font-size:15px; color:#a8a29e; line-height:1.7;">${data.intro}</p>
            </td>
          </tr>

          <!-- Event sections -->
          <tr>
            <td style="padding:0 0 8px 0;">
              ${communityBlocks}
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding:12px 0 32px 0; text-align:center;">
              <a href="${data.siteUrl}/events"
                 style="display:inline-block; background:#fbbf24; color:#09090b;
                        font-size:15px; font-weight:700; padding:14px 36px;
                        border-radius:9px; text-decoration:none; letter-spacing:0.01em;">
                Browse All Events →
              </a>
            </td>
          </tr>

          <!-- Divider -->
          <tr><td style="border-top:1px solid #3f3f46; padding:0 0 20px 0;"></td></tr>

          <!-- Footer note -->
          <tr>
            <td style="padding:0 0 24px 0;">
              <p style="margin:0; font-size:14px; color:#78716c; line-height:1.7;">${data.footer}</p>
            </td>
          </tr>

          <!-- Legal footer -->
          <tr>
            <td style="text-align:center;">
              <p style="margin:0; font-size:12px; color:#52525b;">© 2025 One Mic Stand. All rights reserved.</p>
              <p style="margin:4px 0 0 0; font-size:12px; color:#52525b;">
                You received this because you are a member of at least one community on One Mic Stand.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

// ── Weekly digest – Resend Broadcast version ─────────────────────────────────
// This template is rendered once and sent as a single Broadcast to the full
// Resend segment.  It uses Resend's triple-mustache merge tags for
// personalisation so every recipient sees their own first name.

export type DigestEvent = DigestCommunitySection['events'][number]

export function getBroadcastWeeklyDigestEmail(data: {
  events: DigestEvent[]
  siteUrl: string
}): string {
  const { events, siteUrl } = data
  const totalEvents = events.length

  function eventCard(ev: DigestEvent): string {
    const eventUrl = `${siteUrl}/events/${ev.slug ?? ev.id}`
    const { dateLine: date, timeLine: time } = formatDigestEventDatePartsEastern(ev.date)
    const venue = ev.venueName ?? ev.location ?? 'Venue TBA'

    const imageBlock = ev.posterUrl
      ? `<a href="${eventUrl}" style="display:block; text-decoration:none;">
           <img src="${ev.posterUrl}" alt="${ev.title}" width="560"
                style="display:block; width:100%; max-height:280px; object-fit:cover;
                       border-radius:10px 10px 0 0; background:#27272a;" />
         </a>`
      : `<div style="background:#27272a; border-radius:10px 10px 0 0; padding:32px;
                     text-align:center; font-size:32px;">🎤</div>`

    return `
      <div style="margin:0 0 20px 0; border-radius:10px; border:1px solid #3f3f46;
                  background:#18181b; overflow:hidden;">
        ${imageBlock}
        <div style="padding:18px 20px 20px;">
          <a href="${eventUrl}"
             style="display:block; font-size:17px; font-weight:700; color:#f5f5f4;
                    text-decoration:none; line-height:1.35; margin-bottom:10px;">
            ${ev.title}
          </a>
          <table cellpadding="0" cellspacing="0" style="width:100%; border-collapse:collapse;">
            <tr>
              <td style="font-size:13px; color:#a8a29e; padding:3px 0; vertical-align:top; width:18px;">📅</td>
              <td style="font-size:13px; color:#a8a29e; padding:3px 0;">${date} &nbsp;·&nbsp; ${time} ET</td>
            </tr>
            <tr>
              <td style="font-size:13px; color:#a8a29e; padding:3px 0; vertical-align:top;">📍</td>
              <td style="font-size:13px; color:#a8a29e; padding:3px 0;">${venue}</td>
            </tr>
          </table>
          <div style="margin-top:16px;">
            <a href="${eventUrl}"
               style="display:inline-block; background:#fbbf24; color:#09090b;
                      font-size:13px; font-weight:700; padding:9px 20px;
                      border-radius:7px; text-decoration:none; letter-spacing:0.01em;">
              View event →
            </a>
          </div>
        </div>
      </div>`
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>What's on this week</title>
</head>
<body style="margin:0; padding:0; background:#09090b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#09090b; min-height:100vh;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%;">

          <!-- Header -->
          <tr>
            <td style="padding:0 0 28px 0; text-align:center;">
              <p style="margin:0 0 12px 0; font-size:12px; letter-spacing:2px; text-transform:uppercase;
                         color:#78716c; font-weight:600;">One Mic Stand</p>
              <h1 style="margin:0; font-size:30px; font-weight:800; color:#f5f5f4; line-height:1.2;">
                What&rsquo;s on this week 🎤
              </h1>
              <p style="margin:10px 0 0 0; font-size:14px; color:#a8a29e;">
                ${totalEvents} upcoming show${totalEvents !== 1 ? 's' : ''} in the community
              </p>
              <p style="margin:8px 0 0 0; font-size:12px; color:#78716c;">
                Event times are in Eastern Time (US and Canada).
              </p>
            </td>
          </tr>

          <!-- Divider -->
          <tr><td style="border-top:1px solid #3f3f46; padding:0 0 28px 0;"></td></tr>

          <!-- Greeting -->
          <tr>
            <td style="padding:0 0 28px 0;">
              <p style="margin:0 0 12px 0; font-size:16px; color:#f5f5f4;">Hi {{{contact.first_name|there}}},</p>
              <p style="margin:0; font-size:15px; color:#a8a29e; line-height:1.7;">
                Here&rsquo;s what&rsquo;s coming up on One Mic Stand. Grab your spot before it fills up!
              </p>
            </td>
          </tr>

          <!-- Event cards -->
          <tr>
            <td style="padding:0 0 8px 0;">
              ${events.map(eventCard).join('')}
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding:12px 0 32px 0; text-align:center;">
              <a href="${siteUrl}/dashboard"
                 style="display:inline-block; background:#fbbf24; color:#09090b;
                        font-size:15px; font-weight:700; padding:14px 36px;
                        border-radius:9px; text-decoration:none; letter-spacing:0.01em;">
                Browse All Events →
              </a>
            </td>
          </tr>

          <!-- Divider -->
          <tr><td style="border-top:1px solid #3f3f46; padding:0 0 20px 0;"></td></tr>

          <!-- Footer -->
          <tr>
            <td style="padding:0 0 24px 0; text-align:center;">
              <p style="margin:0; font-size:12px; color:#52525b;">© 2025 One Mic Stand. All rights reserved.</p>
              <p style="margin:6px 0 0 0; font-size:12px; color:#52525b;">
                You received this because you signed up for One Mic Stand.<br>
                <a href="{{{RESEND_UNSUBSCRIBE_URL}}}"
                   style="color:#78716c; text-decoration:underline;">Unsubscribe</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

// ── Ticket purchase confirmation ─────────────────────────────────────────────

export function getTicketPurchaseEmail(data: {
  buyerName: string
  eventTitle: string
  eventDate: string
  venueName: string | null
  quantity: number
  unitPriceCents: number
  totalCents: number
  eventUrl: string
}): string {
  const total = (data.totalCents / 100).toFixed(2)
  const unit = (data.unitPriceCents / 100).toFixed(2)
  return `
    <!DOCTYPE html><html>
      <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background: #f3f4f6;">
        <div style="background: linear-gradient(135deg, #2563eb 0%, #7c3aed 100%); padding: 32px 30px; text-align: center; border-radius: 12px 12px 0 0;">
          <p style="color: rgba(255,255,255,0.8); font-size: 13px; margin: 0 0 6px 0; letter-spacing: 1px; text-transform: uppercase;">One Mic Stand</p>
          <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 700;">🎟️ You're going to the show!</h1>
        </div>
        <div style="background: #ffffff; padding: 28px 30px; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb; border-top: none;">
          <p style="font-size: 16px; margin: 0 0 16px 0;">Hi ${data.buyerName || 'there'},</p>
          <p style="font-size: 15px; color: #374151; margin: 0 0 24px 0; line-height: 1.7;">
            Your tickets are confirmed. We can't wait to see you at the show!
          </p>
          <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px; padding: 20px 24px; margin: 0 0 24px 0;">
            <h2 style="font-size: 20px; font-weight: 700; color: #1f2937; margin: 0 0 12px 0;">${data.eventTitle}</h2>
            <div style="font-size: 14px; color: #374151; margin-bottom: 6px;">📅 ${data.eventDate}</div>
            ${data.venueName ? `<div style="font-size: 14px; color: #374151; margin-bottom: 20px;">📍 ${data.venueName}</div>` : ''}
            <div style="border-top: 1px solid #bfdbfe; padding-top: 16px; margin-top: 16px;">
              <p style="margin: 6px 0; font-size: 14px;"><strong>Tickets:</strong> ${data.quantity} × $${unit} CAD</p>
              <p style="margin: 6px 0; font-size: 14px;"><strong>Total paid:</strong> $${total} CAD</p>
            </div>
            <div style="text-align: center; margin-top: 20px;">
              <a href="${data.eventUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 15px;">View Event Details →</a>
            </div>
          </div>
          <p style="font-size: 14px; color: #6b7280; margin: 0;">
            Please bring this email or your payment confirmation to the event. See you there! 🎤
          </p>
        </div>
        <div style="text-align: center; margin-top: 20px; color: #9ca3af; font-size: 12px;">
          <p style="margin: 0;">© 2025 One Mic Stand. All rights reserved.</p>
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

/**
 * Email template for "you received a new profile review"
 */
export function getNewReviewReceivedEmail(data: {
  rateeName: string
  reviewerName: string | null   // null when anonymous
  rating: number
  comment: string | null
  profileUrl: string
}): string {
  const stars = '★'.repeat(data.rating) + '☆'.repeat(5 - data.rating)
  const fromLine = data.reviewerName
    ? `<strong>${data.reviewerName}</strong> left you a review`
    : 'Someone left you an anonymous review'
  const commentBlock = data.comment
    ? `<div style="background:#f9fafb;border-left:4px solid #f59e0b;padding:16px 20px;border-radius:0 8px 8px 0;margin:20px 0;">
        <p style="font-size:15px;color:#374151;margin:0;line-height:1.7;font-style:italic;">"${data.comment}"</p>
       </div>`
    : ''

  return `<!DOCTYPE html><html>
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
  <body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;background:#f3f4f6;">
    <div style="background:linear-gradient(135deg,#f59e0b 0%,#d97706 100%);padding:32px 30px;text-align:center;border-radius:12px 12px 0 0;">
      <p style="color:rgba(255,255,255,0.8);font-size:13px;margin:0 0 6px 0;letter-spacing:1px;text-transform:uppercase;">One Mic Stand</p>
      <h1 style="color:white;margin:0;font-size:24px;font-weight:700;">New Review ⭐</h1>
    </div>
    <div style="background:#ffffff;padding:28px 30px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:none;">
      <p style="font-size:16px;margin:0 0 8px 0;">Hi ${data.rateeName},</p>
      <p style="font-size:15px;color:#374151;margin:0 0 20px 0;">${fromLine} on your profile.</p>
      <div style="text-align:center;font-size:28px;letter-spacing:4px;color:#f59e0b;margin:0 0 4px 0;">${stars}</div>
      <p style="text-align:center;font-size:13px;color:#6b7280;margin:0 0 20px 0;">${data.rating} out of 5</p>
      ${commentBlock}
      <div style="text-align:center;margin:28px 0 8px 0;">
        <a href="${data.profileUrl}" style="display:inline-block;background:#f59e0b;color:#1f2937;padding:12px 28px;text-decoration:none;border-radius:8px;font-weight:bold;font-size:15px;">View Your Profile →</a>
      </div>
    </div>
    <div style="text-align:center;margin-top:20px;color:#9ca3af;font-size:12px;">
      <p style="margin:0;">© 2025 One Mic Stand. All rights reserved.</p>
    </div>
  </body>
</html>`
}
