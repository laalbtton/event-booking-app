/**
 * Email Service - High-level functions for sending booking-related emails
 * This integrates with the notification system and booking flow
 * 
 * Note: These functions are called from client components, so they use API routes
 */

import { supabase } from './supabase'
import { formatDateTimeEastern } from './dateUtils'
import {
  getBookingConfirmationEmail,
  getWaitlistPromotionEmail,
  getBookingCancellationEmail,
  getWaitlistPositionEmail,
  getEventReminderEmail,
  getEventCancelledEmail,
} from './email'
import { buildEventUrl, getSiteUrl } from './server/emailUrl'

/**
 * Send booking confirmation email
 */
export async function sendBookingConfirmationEmail(
  userId: string,
  bookingId: string,
  eventId: string
): Promise<boolean> {
  try {
    // Fetch user and event data
    const { data: profile } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('id', userId)
      .single()

    const { data: booking } = await supabase
      .from('bookings')
      .select(`
        credits_used,
        events (
          id,
          title,
          date,
          location
        )
      `)
      .eq('id', bookingId)
      .single()

    if (!profile || !booking || !booking.events) {
      console.error('Missing data for booking confirmation email')
      return false
    }

    const event = booking.events as any
    const eventUrl = buildEventUrl(eventId) ?? `${getSiteUrl()}/events/${eventId}`

    const html = getBookingConfirmationEmail({
      userName: profile.full_name || 'there',
      eventTitle: event.title,
      eventDate: formatDateTimeEastern(event.date),
      eventLocation: event.location || 'TBD',
      creditsUsed: booking.credits_used,
      bookingId,
      eventUrl,
    })

    // Call API route to send email
    const response = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: profile.email,
        subject: `Booking Confirmed: ${event.title}`,
        html,
      }),
    })

    return response.ok
  } catch (error) {
    console.error('Error sending booking confirmation email:', error)
    return false
  }
}

/**
 * Send waitlist promotion email
 */
export async function sendWaitlistPromotionEmail(
  userId: string,
  eventId: string
): Promise<boolean> {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('id', userId)
      .single()

    const { data: event } = await supabase
      .from('events')
      .select('id, title, date, location')
      .eq('id', eventId)
      .single()

    if (!profile || !event) {
      console.error('Missing data for waitlist promotion email')
      return false
    }

    const eventUrl = buildEventUrl(eventId) ?? `${getSiteUrl()}/events/${eventId}`

    const html = getWaitlistPromotionEmail({
      userName: profile.full_name || 'there',
      eventTitle: event.title,
      eventDate: formatDateTimeEastern(event.date),
      eventLocation: event.location || 'TBD',
      eventUrl,
    })

    // Call API route to send email
    const response = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: profile.email,
        subject: `🎉 You're In! Confirmed for ${event.title}`,
        html,
      }),
    })

    return response.ok
  } catch (error) {
    console.error('Error sending waitlist promotion email:', error)
    return false
  }
}

/**
 * Send booking cancellation email
 */
export async function sendBookingCancellationEmail(
  userId: string,
  eventTitle: string,
  eventDate: string,
  creditsRefunded: number,
  refundStatus: string
): Promise<boolean> {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('id', userId)
      .single()

    if (!profile) {
      console.error('Missing profile for cancellation email')
      return false
    }

    const html = getBookingCancellationEmail({
      userName: profile.full_name || 'there',
      eventTitle,
      eventDate,
      creditsRefunded,
      refundStatus,
    })

    // Call API route to send email
    const response = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: profile.email,
        subject: `Booking Cancelled: ${eventTitle}`,
        html,
      }),
    })

    return response.ok
  } catch (error) {
    console.error('Error sending cancellation email:', error)
    return false
  }
}

/**
 * Send event cancellation email
 */
export async function sendEventCancelledEmail(
  userId: string,
  eventTitle: string,
  eventDate: string,
  creditsRefunded: number,
  eventId: string
): Promise<boolean> {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('id', userId)
      .single()

    if (!profile) {
      console.error('Missing profile for event cancellation email')
      return false
    }

    const eventUrl = buildEventUrl(eventId) ?? `${getSiteUrl()}/events/${eventId}`

    const html = getEventCancelledEmail({
      userName: profile.full_name || 'there',
      eventTitle,
      eventDate,
      creditsRefunded,
      eventUrl,
    })

    const response = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: profile.email,
        subject: `Event Cancelled: ${eventTitle}`,
        html,
      }),
    })

    return response.ok
  } catch (error) {
    console.error('Error sending event cancellation email:', error)
    return false
  }
}

/**
 * Send waitlist position change email
 */
export async function sendWaitlistPositionEmail(
  userId: string,
  eventId: string,
  position: number,
  previousPosition?: number
): Promise<boolean> {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('id', userId)
      .single()

    const { data: event } = await supabase
      .from('events')
      .select('id, title')
      .eq('id', eventId)
      .single()

    if (!profile || !event) {
      console.error('Missing data for waitlist position email')
      return false
    }

    const eventUrl = buildEventUrl(eventId) ?? `${getSiteUrl()}/events/${eventId}`

    const html = getWaitlistPositionEmail({
      userName: profile.full_name || 'there',
      eventTitle: event.title,
      position,
      previousPosition,
      eventUrl,
    })

    const subject = previousPosition && position < previousPosition
      ? `🎉 Waitlist Position Improved for ${event.title}`
      : `Waitlist Position Update for ${event.title}`

    // Call API route to send email
    const response = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: profile.email,
        subject,
        html,
      }),
    })

    return response.ok
  } catch (error) {
    console.error('Error sending waitlist position email:', error)
    return false
  }
}

/**
 * Send event reminder email
 */
export async function sendEventReminderEmail(
  userId: string,
  bookingId: string,
  eventId: string,
  timeUntilEvent: string
): Promise<boolean> {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('id', userId)
      .single()

    const { data: booking } = await supabase
      .from('bookings')
      .select(`
        events (
          id,
          title,
          date,
          location
        )
      `)
      .eq('id', bookingId)
      .single()

    if (!profile || !booking || !booking.events) {
      console.error('Missing data for event reminder email')
      return false
    }

    const event = booking.events as any
    const eventUrl = buildEventUrl(eventId) ?? `${getSiteUrl()}/events/${eventId}`

    const html = getEventReminderEmail({
      userName: profile.full_name || 'there',
      eventTitle: event.title,
      eventDate: formatDateTimeEastern(event.date),
      eventLocation: event.location || 'TBD',
      timeUntilEvent,
      eventUrl,
    })

    // Call API route to send email
    const response = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: profile.email,
        subject: `📅 Reminder: ${event.title} is coming up!`,
        html,
      }),
    })

    return response.ok
  } catch (error) {
    console.error('Error sending event reminder email:', error)
    return false
  }
}
