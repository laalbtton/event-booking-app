# Event Reminders Setup Guide

This guide explains how to set up automated event reminders that send both in-app notifications and emails to users.

## Overview

The reminder system sends notifications and emails to users for upcoming events:
- **24-hour reminder**: Sent approximately 24 hours before the event
- **1-hour reminder**: Optional, can be enabled (currently disabled)

## How It Works

1. **Cron Job**: A scheduled job runs daily (9 AM UTC) to check for events happening in ~24 hours
2. **Reminder Detection**: Finds all confirmed bookings for events within the reminder window
3. **Duplicate Prevention**: Checks if a reminder was already sent in the last 2 hours
4. **Dual Notification**: Sends both:
   - In-app notification (appears in `/notifications`)
   - Email notification (sent to user's email)

## Setup Instructions

### Step 1: Update Database Schema

The `event_reminder` notification type is already added to the migration file. If you haven't run the migration yet, make sure `notifications_migration.sql` includes:

```sql
type TEXT NOT NULL CHECK (type IN (..., 'event_reminder', ...))
```

### Step 2: Configure Vercel Cron Job

The `vercel.json` file is already configured with a cron job that runs daily at 9 AM UTC.

**To verify/enable:**
1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Cron Jobs**
3. You should see: `/api/send-reminders` scheduled for `0 9 * * *` (daily at 9 AM UTC)
4. If not visible, the cron will be automatically created on next deployment

**Alternative Schedule Options:**
- `0 9 * * *` - Daily at 9 AM UTC (current)
- `0 */6 * * *` - Every 6 hours
- `0 9,21 * * *` - Twice daily (9 AM and 9 PM UTC)

### Step 3: Set Up Authentication (Optional but Recommended)

To prevent unauthorized access to the reminder endpoint:

1. **Add CRON_SECRET to environment variables:**
   ```bash
   # .env.local (for testing)
   CRON_SECRET=your-secret-token-here
   ```

2. **Add to Vercel:**
   - Go to Vercel Dashboard → Settings → Environment Variables
   - Add `CRON_SECRET` with a random secure string
   - Add to Production, Preview, and Development

3. **Vercel automatically adds authorization header:**
   - Vercel cron jobs automatically include an `Authorization` header
   - The header format is: `Bearer ${CRON_SECRET}`
   - The API route checks this header

**Note:** If `CRON_SECRET` is not set, the endpoint will still work (for testing), but it's recommended for production.

### Step 4: Test the Reminder System

**Manual Testing:**

1. **Create a test event:**
   - Create an event scheduled for ~24 hours from now
   - Book the event with a test account

2. **Manually trigger the reminder endpoint:**
   ```bash
   # Using curl (replace with your URL and secret)
   curl -X GET "https://your-app.vercel.app/api/send-reminders" \
     -H "Authorization: Bearer your-cron-secret"
   ```

3. **Or test locally:**
   ```bash
   # In your terminal
   curl http://localhost:3000/api/send-reminders
   ```

4. **Check results:**
   - Check the response JSON for `remindersSent` count
   - Check your email inbox
   - Check `/notifications` page in the app

### Step 5: Enable 1-Hour Reminders (Optional)

To enable 1-hour reminders before events:

1. Open `app/api/send-reminders/route.ts`
2. Uncomment the 1-hour reminder section (lines marked with `/* ... */`)
3. The code will send reminders 1 hour before events

**Note:** This will double your email volume, so monitor your Resend usage.

## How Reminders Are Sent

### 24-Hour Reminders

- **Trigger Time**: Events happening in 23-25 hours
- **Window**: 2-hour window to avoid duplicates
- **Notification Type**: `event_reminder`
- **Email Subject**: `📅 Reminder: [Event Title] is coming up!`

### 1-Hour Reminders (if enabled)

- **Trigger Time**: Events happening in 0.8-1.2 hours (48-72 minutes)
- **Window**: 30-minute window to avoid duplicates
- **Notification Type**: `event_reminder`
- **Email Subject**: `📅 Reminder: [Event Title] is coming up!`

## Duplicate Prevention

The system prevents duplicate reminders by:
1. Checking if a notification of type `event_reminder` was created in the last 2 hours (24h reminders) or 30 minutes (1h reminders)
2. Only sending if no recent reminder exists for that booking

## Monitoring

### Check Reminder Status

1. **Vercel Cron Logs:**
   - Go to Vercel Dashboard → Your Project → **Logs**
   - Filter for "cron" or "send-reminders"
   - Check execution times and any errors

2. **Application Logs:**
   - Check the response from `/api/send-reminders`
   - Look for `remindersSent` count
   - Check `errors` array for any failures

3. **Resend Dashboard:**
   - Go to Resend Dashboard → **Logs**
   - Filter for reminder emails
   - Check delivery status

### Common Issues

**No reminders being sent:**
- Check if events are scheduled correctly (24 hours from now)
- Verify bookings have `status = 'confirmed'`
- Check cron job is running (Vercel Dashboard → Cron Jobs)
- Check API route logs for errors

**Duplicate reminders:**
- The duplicate check might not be working
- Check `notifications` table for existing reminders
- Verify the time window logic

**Reminders sent but emails not received:**
- Check Resend Dashboard → Logs
- Verify `RESEND_API_KEY` is set correctly
- Check spam folder
- Verify user email in `profiles` table

## Customization

### Change Reminder Timing

Edit `app/api/send-reminders/route.ts`:

```typescript
// For 48-hour reminders
const twoDaysFromNow = new Date(now.getTime() + 48 * 60 * 60 * 1000)

// For 12-hour reminders
const twelveHoursFromNow = new Date(now.getTime() + 12 * 60 * 60 * 1000)
```

### Customize Email Template

Edit `lib/email.ts` → `getEventReminderEmail()` function to change the email design.

### Customize Notification Message

Edit `app/api/send-reminders/route.ts` to change the notification title and message.

## Production Checklist

- [ ] Database migration run (includes `event_reminder` type)
- [ ] `vercel.json` deployed with cron configuration
- [ ] `CRON_SECRET` set in Vercel environment variables (optional but recommended)
- [ ] Test reminder sent and received successfully
- [ ] Cron job visible in Vercel Dashboard
- [ ] Monitoring set up (check logs regularly)
- [ ] Email template customized (optional)

## Support

For issues:
- **Cron Jobs**: Check Vercel Dashboard → Cron Jobs
- **API Route**: Check `app/api/send-reminders/route.ts`
- **Email**: Check `lib/email.ts` and `lib/emailService.ts`
- **Notifications**: Check `lib/notifications.ts`
