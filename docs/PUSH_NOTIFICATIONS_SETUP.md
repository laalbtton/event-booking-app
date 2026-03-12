# PWA Push Notifications Setup

This app uses Web Push (VAPID) with:
- Next.js API routes
- Supabase tables (`push_subscriptions`, `push_notification_prefs`)
- `public/sw.js` service worker

## 1) Generate VAPID keys (one-time)

Run locally:

```bash
npx web-push generate-vapid-keys
```

Copy the generated values.

## 2) Configure environment variables

Add these in `.env.local` and in Vercel project settings:

```bash
NEXT_PUBLIC_VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:you@yourdomain.com
```

After adding to Vercel, redeploy.

## 3) Apply database migration

Run `push_notifications_migration.sql` in Supabase SQL editor.

This creates:
- `push_subscriptions`: active browser/device subscriptions
- `push_notification_prefs`: pre-prompt + deny/snooze state per user

## 4) Test in browser and installed PWA

1. Sign in and book an event.
2. Confirm the custom pre-prompt appears (not native prompt directly).
3. Tap `Not now` and confirm no native prompt opens.
4. Tap `Enable notifications` and allow browser permission.
5. Trigger test push from app by enabling notifications from profile.

## 5) Android-specific checks

- App info -> Notifications -> allowed
- Disable aggressive battery restrictions for browser/PWA app during testing
- Ensure app is opened from installed icon, not only browser tab

## Behavior rules implemented

- No prompt on app load/login.
- Prompt shown contextually after booking success.
- Pre-prompt includes `Enable notifications` and `Not now`.
- `Not now` snoozes prompt for 7 days.
- If native browser permission is denied, app does not auto-prompt again.
