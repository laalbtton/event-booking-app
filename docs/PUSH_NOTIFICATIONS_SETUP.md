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

## 6) Native iOS (TestFlight / App Store)

Android already uses FCM via `google-services.json`. iPhone push uses the same backend, but Capacitor only gives an **APNs** token unless the iOS project is wired to Firebase.

The TestFlight timeout ("Google Play Services") happened because `AppDelegate.swift` never forwarded Apple's device token to Capacitor, so JavaScript waited 20 seconds and showed the Android error.

### One-time Firebase + Apple setup

1. Firebase Console → project `onemicstand-1829b` → **Add app** → iOS.
2. Bundle ID: `com.laalbutton.app`.
3. Download `GoogleService-Info.plist` and put it in `ios/App/App/` (same folder as `AppDelegate.swift`).
4. In Xcode, add that plist to the **App** target (Copy Bundle Resources).
5. Apple Developer → Keys → create an **APNs Auth Key** (`.p8`).
6. Firebase Console → Project settings → Cloud Messaging → Apple app configuration → upload the `.p8` (Key ID + Team ID).
7. On a Mac: `cd ios/App && pod install`, then archive a new TestFlight build.

Without steps 3–4, iPhone registration fails with a message about the missing plist. Without steps 5–6, registration can succeed but notifications never arrive.

If Settings → Push shows “Token saved” but the test send reports 0 sent, open Firebase Console → Project settings → Cloud Messaging and confirm an APNs Authentication Key is uploaded for the iOS app. TestFlight uses Production APNs; a Sandbox-only key will fail every send.

