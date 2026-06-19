import { supabase } from './supabase'

export type NotificationType = 
  | 'waitlist_promoted'
  | 'waitlist_position_changed'
  | 'waitlist_position_improved'
  | 'booking_confirmed'
  | 'booking_cancelled'
  | 'event_updated'
  | 'event_reminder'
  | 'host_poster_reminder_5d'
  | 'host_poster_reminder_24h'
  | 'general'
  | 'profile_review_received'

/**
 * Creates a notification for a user
 */
export async function createNotification(
  userId: string,
  type: NotificationType,
  title: string,
  message: string,
  relatedBookingId?: string | null,
  relatedEventId?: string | null
): Promise<string | null> {
  try {
    // Use the database function to create notification (bypasses RLS)
    const { data, error } = await supabase.rpc('create_notification', {
      p_user_id: userId,
      p_type: type,
      p_title: title,
      p_message: message,
      p_related_booking_id: relatedBookingId || null,
      p_related_event_id: relatedEventId || null,
    })

    if (error) {
      console.error('Error creating notification:', error)
      // Fallback: try direct insert (will work if RLS allows)
      const { data: insertData, error: insertError } = await supabase
        .from('notifications')
        .insert({
          user_id: userId,
          type,
          title,
          message,
          related_booking_id: relatedBookingId || null,
          related_event_id: relatedEventId || null,
        })
        .select('id')
        .single()

      if (insertError) {
        console.error('Error with fallback notification insert:', insertError)
        return null
      }

      return insertData?.id || null
    }

    return data || null
  } catch (error) {
    console.error('Exception creating notification:', error)
    return null
  }
}
