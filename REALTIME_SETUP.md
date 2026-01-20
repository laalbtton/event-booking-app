# Real-time Updates Setup

## Enable Real-time in Supabase

For real-time notifications to work, you need to enable real-time replication for the `bookings` and `notifications` tables in Supabase:

1. Go to your Supabase Dashboard
2. Navigate to **Database** → **Replication**
3. Find the `bookings` table and toggle **Enable Replication** to ON
4. Find the `notifications` table and toggle **Enable Replication** to ON
5. Save the changes

Alternatively, you can run this SQL in the Supabase SQL Editor:

```sql
-- Enable real-time replication for bookings table
ALTER PUBLICATION supabase_realtime ADD TABLE bookings;

-- Enable real-time replication for notifications table
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
```

## How It Works

- When a booking is updated (e.g., waitlist position changes or status changes from waitlist to confirmed), Supabase sends a real-time event
- The dashboard listens for these events via a Supabase channel subscription
- When changes are detected, a notification is created in the database and stored in the `notifications` table
- The navigation bar shows a bell icon with a badge indicating the number of unread notifications
- Users can click the bell icon to view all their notifications on the `/notifications` page
- The unread count updates in real-time as new notifications are created

## Notifications

Users will receive notifications for:
- ✅ Waitlist position improvements (e.g., moved from #3 to #1)
- ℹ️ Waitlist position changes
- 🎉 Promotion from waitlist to confirmed status
- Other booking-related updates

Notifications are stored in the database and can be viewed at any time on the notifications page. Users can mark notifications as read or delete them.
