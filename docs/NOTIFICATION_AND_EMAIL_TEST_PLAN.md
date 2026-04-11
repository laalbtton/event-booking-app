# Notification and email testing plan

This document lists how the app produces **in-app notifications** (Supabase `notifications` table + `/notifications` UI), **web push** (VAPID / service worker), and **email** (Resend via `lib/email.ts`). Use the checklists during QA; check items when verified in an environment that matches production (env vars, cron, RLS).

---

## 1. Prerequisites

- [ ] `RESEND_API_KEY` set; sender domain verified in Resend.
- [ ] `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` set (`docs/PUSH_NOTIFICATIONS_SETUP.md`).
- [ ] Supabase migrations applied: notifications, push, registration alerts, etc.
- [ ] Vercel **crons** enabled (`vercel.json`): `/api/send-reminders` (daily 09:00 UTC), `/api/check-registration-opens` (daily 08:00 UTC), `/api/poster-autopost/worker` (daily 10:00 UTC).
- [ ] If `CRON_SECRET` is set, cron routes require `Authorization: Bearer <CRON_SECRET>` (see §6).
- [ ] Test users: performer, audience, event host/creator, community admin, platform admin; at least one user with push enabled and category prefs on (`Settings → Notifications`).
- [ ] **Note:** `/api/send-email` accepts `POST` with `to`, `subject`, `html` and does **not** require auth. Treat as sensitive in production (rate limits, monitoring, abuse review).

---

## 2. Channels at a glance

| Channel | Where it appears | Primary code |
|--------|-------------------|--------------|
| In-app | `/notifications`, bell count (`NavigationTabs`), Supabase realtime on `notifications` | `lib/notifications.ts`, various API routes, `app/dashboard/page.tsx` (waitlist) |
| Web push | OS/browser notification via `public/sw.js` | `lib/server/push.ts` (`sendPushToUser`, `sendPushToAllUsers`) |
| Email | User inbox (Resend) | `lib/email.ts` (`sendEmail` + HTML builders), `lib/emailService.ts` (calls `/api/send-email`) |
| Toasts | In-page (Sonner); **not** persisted | `GlobalAlertsProvider`, many `toast.*` calls |

---

## 3. In-app notifications (`notifications` table)

Each row: `type`, `title`, `message`, optional `related_booking_id` / `related_event_id`.  
**Verify:** row appears, `/notifications` shows it, unread count updates (realtime or refresh).  
**DB:** `notifications.type` must satisfy the table `CHECK` (see `sql/notifications_migration.sql`). If a route uses a non-allowed type, inserts may fail—watch API logs.

### 3.1 Booking / waitlist / dashboard (client-driven)

| # | Trigger | How to test | Expected |
|---|---------|-------------|----------|
| [ ] | Waitlist → confirmed promotion | Host/admin confirms waitlisted user **or** capacity frees; booking row updates while user has **Dashboard** open (realtime), or user opens app after update | `createNotification` `waitlist_promoted`; optional `/api/push/notify-self` + `sendWaitlistPromotionEmail` (see §5) |
| [ ] | Waitlist position improved (#↓) | Same booking stream; position moves up by slot logic | `waitlist_position_improved` + email if moved up by ≥3 positions |
| [ ] | Waitlist position changed (other cases) | Position worsens or initial assignment | `waitlist_position_changed` or “Added to Waitlist” copy |
| [ ] | Waitlist promotion (push path) | As first row; user has push + session | POST `/api/push/notify-self` with `type: waitlist_promoted` |

### 3.2 Registration opening alerts

| # | Trigger | How to test | Expected |
|---|---------|-------------|----------|
| [ ] | `registration_alerts` fired | User sets “notify when registration opens” on an event; move `registration_opens_at` into the past (or wait); hit **`GET /api/check-registration-opens`** (with cron auth if configured) | In-app `general` “Registration Now Open”; email + per-user push (`new_events` category) for that user; `registration_alerts.notified = true` |

### 3.3 Event reminders (cron + duplicate guard)

| # | Trigger | How to test | Expected |
|---|---------|-------------|----------|
| [ ] | ~24h reminder | Confirmed booking for event **23–25h** ahead; run **`GET /api/send-reminders`** | `event_reminder` notification; email via `sendEventReminderEmail`; push `event_reminders` |
| [ ] | ~1h reminder (if implemented in route) | Same route; booking in ~1h window per route logic | Same channels per `app/api/send-reminders/route.ts` |
| [ ] | No duplicate | Run cron twice quickly for same booking | Second run skips (checks recent `notifications` for same booking + type) |

### 3.4 Host / attendance (web UI)

| # | Trigger | How to test | Expected |
|---|---------|-------------|----------|
| [ ] | Host assigned / removed | Event attendance UI: assign or change host (`app/events/[id]/attendance/page.tsx`) | `general` for new host (“Assigned as event host”) and previous host (“Host role updated”) |

### 3.5 Invites (booked shows)

| # | Trigger | How to test | Expected |
|---|---------|-------------|----------|
| [ ] | Performer invite | Host/creator sends invite via **`POST /api/invites/send`** (app UI) | In-app “Event Invite”; push `booking_updates` |

### 3.6 Event cancel (organizer)

| # | Trigger | How to test | Expected |
|---|---------|-------------|----------|
| [ ] | Event cancelled | Cancel event via app flow hitting **`/api/cancel-event`** | Each affected booking user: `general` “Event cancelled” + **email** `getEventCancelledEmail` |

### 3.7 Audience deposit returned (attendance)

| # | Trigger | How to test | Expected |
|---|---------|-------------|----------|
| [ ] | Marked attended (audience deposit) | Host marks audience attended when policy refunds deposit: **`/api/update-attendance`** | `general` “Deposit returned” with credit copy |

### 3.8 No-show penalties

| # | Trigger | How to test | Expected |
|---|---------|-------------|----------|
| [ ] | Penalty processed | Run **`POST /api/events/process-no-show-penalties`** (or wait job); booking in scope | `create_notification` per route logic (verify title/message in UI) |

### 3.9 Venues

| # | Trigger | How to test | Expected |
|---|---------|-------------|----------|
| [ ] | Venue request submitted | User submits venue request **`/api/venues/request`** | Notification to admins (per route) |
| [ ] | Venue approved / rejected | Admin **`/api/venues/[id]/review`** approve or reject | Requester notified (`venue_approved` / `venue_rejected` **types**—confirm DB allows these or migration updated) |

### 3.10 Communities / events (admin & flows)

| # | Trigger | How to test | Expected |
|---|---------|-------------|----------|
| [ ] | Community creation request | Submit **`/api/communities/create-request`** | Admins notified (RPC) |
| [ ] | Event creator request | Member **`/api/communities/[id]/event-creator-request`** | Community admins notified |
| [ ] | Review event creator | **`/api/communities/[id]/review-event-creator`** approve/deny | Notifications to requester (and possibly admins—per route) |
| [ ] | Event submission review | **`/api/communities/[id]/review-event-submission`** | Submitter notified |
| [ ] | Submit event to community | **`/api/communities/[id]/submit-event`** when pending approval | Community admins notified |
| [ ] | Event manage (pending) | Creating/updating event in manage UI may notify community admins (`app/events/manage/page.tsx`) | In-app per RPC |
| [ ] | Platform event review | **`/api/events/[id]/review`** approve / reject | Creator notified; **approve** may also trigger **new-event push** (`/api/events/notify-new`)—see §4 |
| [ ] | Admin community creation review | **`/api/admin/communities/review-creation`** | Requester (and others per route) notified |
| [ ] | Community shutdown | **`/api/admin/communities/shutdown`** | Members/admins notified per route |

### 3.11 Event creator application (platform)

| # | Trigger | How to test | Expected |
|---|---------|-------------|----------|
| [ ] | Apply to be event creator | **`/api/apply-event-creator`** | Admins get in-app notification |

### 3.12 Poster auto-post worker (cron)

| # | Trigger | How to test | Expected |
|---|---------|-------------|----------|
| [ ] | Auto-post success | Job succeeds in **`/api/poster-autopost/worker`** | Organizer + hosts: `general` success messages |
| [ ] | Auto-post failure (terminal) | Job fails after retries or invalid IG account | Organizer + hosts: `general` failure messages |

---

## 4. Web push–only or push-heavy paths

Push does **not** always create an in-app row. Category filters: `booking_updates`, `event_reminders`, `new_events` (`push_notification_prefs`).

| # | Trigger | Category | How to test |
|---|---------|----------|-------------|
| [ ] | **New event broadcast** | `new_events` | Publish/approve event; UI calls **`POST /api/events/notify-new`** (admin events page, manage page, or post-review). Subscribed users get push. |
| [ ] | **Thursday SoCap ~75% full** | `new_events` | Confirm performer booking on qualifying Thursday SoCap event until confirmed count crosses 75% of `max_attendees` (`/api/bookings/create`). One-time per event (`thursday_socap_75_push_sent_at`). |
| [ ] | **Thursday SoCap registration open** | `new_events` | After registration opens for qualifying event, **`/api/check-registration-opens`** sends **broadcast** push once (`thursday_socap_open_push_sent_at`). |
| [ ] | **Registration open (alert user)** | `new_events` | Same cron: per-user push to users with `registration_alerts` (see §3.2). |
| [ ] | **Event chat message** | `booking_updates` | Chat enabled; non-muted participant sends **`POST /api/events/[id]/chat/send`**. Recipients get push only (uses `event_chat_notification_prefs`). |
| [ ] | **Event invite** | `booking_updates` | See §3.5 (in-app + push). |
| [ ] | **24h / 1h reminder** | `event_reminders` | See §3.3. |
| [ ] | **Waitlist promoted (self)** | via `/api/push/notify-self` | Dashboard realtime path; user must be online with token. |
| [ ] | **Admin push broadcast** | configurable | Super-admin **`/settings/push-broadcast`** → **`POST /api/admin/push-broadcast`**. |
| [ ] | **Self test push** | — | Authenticated **`POST /api/push/test`** or **`POST /api/push/notify-self`**. |
| [ ] | **Thursday SoCap test push (admin)** | `new_events` | **`POST /api/push/test-thursday-socap`** (admin-only); exercises SoCap-style broadcast without booking/cron. |
| [ ] | **Pref off** | any | Disable category in **Settings → Notifications**; repeat a push trigger | Expect skip (`skipped: true` / no delivery). |

---

## 5. Email: all known sends

All emails ultimately go through **`sendEmail`** in `lib/email.ts` (Resend). Some builders live in `lib/email.ts`; client-triggered flows use **`lib/emailService.ts`**, which **`POST`s `/api/send-email`** (relative URL—works from browser; from **server** cron, confirm behavior in your deployment).

### 5.1 Triggered from the web app (user session / browser)

| # | Template / flow | Entry point | Verify |
|---|-----------------|-------------|--------|
| [ ] | Booking confirmation | After successful book: `app/events/[id]/page.tsx`, `app/dashboard/page.tsx` → `sendBookingConfirmationEmail` | Inbox subject “Booking Confirmed: …” |
| [ ] | Waitlist promotion | Dashboard realtime → `sendWaitlistPromotionEmail` | Promotion email |
| [ ] | Waitlist position (large jump) | Dashboard realtime → `sendWaitlistPositionEmail` | Position email |
| [ ] | Event reminder | Cron `send-reminders` → `sendEventReminderEmail` → `/api/send-email` | “Reminder: … is coming up!” |
| [ ] | Feedback | Navigation feedback → **`POST /api/feedback`** | To `events.laalbutton@gmail.com`, subject “Alpha Feedback - One Mic Stand” |

### 5.2 Server-only (API / webhook, direct `sendEmail`)

| # | Flow | Route / file | Verify |
|---|------|--------------|--------|
| [ ] | Registration opening | `GET /api/check-registration-opens` | `getRegistrationOpeningEmail` |
| [ ] | Event cancelled (organizer) | `POST /api/cancel-event` | `getEventCancelledEmail` |
| [ ] | Credit purchase | Stripe **`/api/stripe/webhook`** | `getCreditPurchaseEmail` |
| [ ] | Admin credits report | **`POST /api/admin/event-credits-report/email`** | Report email to configured recipient |

### 5.3 Implemented but **no call sites** in repo (verify intent / remove / wire)

| # | Function | Note |
|---|----------|------|
| [ ] | `sendBookingCancellationEmail` (`lib/emailService.ts`) | **Not** called from `/api/bookings/cancel`; user cancel path has **no** booking-cancellation email today. |
| [ ] | `sendEventCancelledEmail` (`lib/emailService.ts`) | **Not** used; organizer cancel uses `getEventCancelledEmail` + `sendEmail` in **`cancel-event`** directly. |

### 5.4 Email checklist (cross-cutting)

- [ ] Resend dashboard shows delivered messages for each template above.
- [ ] Links in HTML use `NEXT_PUBLIC_APP_URL` (or default domain) correctly.
- [ ] Unsubscribe / compliance: not implemented in-repo; document separately if required.

---

## 6. Cron and manual invocation

| Route | Schedule | Auth | Test |
|-------|----------|------|------|
| `GET /api/send-reminders` | Daily 09:00 UTC | If `CRON_SECRET` set: `Authorization: Bearer <secret>` | Manual GET with secret; adjust booking/event time windows |
| `GET /api/check-registration-opens` | Daily 08:00 UTC | Same | Manual GET; inspect `processed` JSON |
| `GET /api/poster-autopost/worker` | Daily 10:00 UTC | Check route for auth | Requires queued jobs in DB |

---

## 7. Regression matrix (quick)

| Area | In-app | Push | Email |
|------|--------|------|-------|
| Book confirm | — | Contextual (enable flow) | Yes |
| Waitlist promoted | Yes | Yes (`/api/push/notify-self`) | Yes |
| Waitlist position change | Yes | — | Only if moved up ≥3 spots |
| Registration open alert | Yes | Yes | Yes |
| 24h (and 1h) reminder | Yes | Yes | Yes |
| New event broadcast | — | Yes | — |
| Chat message | — | Yes (unless muted) | — |
| Event invite | Yes | Yes | — |
| Event cancel (organizer) | Yes | — | Yes |
| Poster auto-post worker | Yes | — | — |

---

## 8. Suggested test order

1. **Email smoke:** feedback form → inbox to team address.  
2. **Book flow:** confirm booking → confirmation email.  
3. **In-app + realtime:** open `/notifications`; trigger a `create_notification` path (e.g. invite or admin notification).  
4. **Push:** enable push in settings; run **`POST /api/push/test`**; then trigger invite or chat.  
5. **Cron:** staging with `CRON_SECRET`; run `send-reminders` and `check-registration-opens` with crafted data.  
6. **Edge:** push prefs off; muted chat; duplicate reminder window.

---

*Generated from repository survey (API routes, `lib/notifications.ts`, `lib/server/push.ts`, `lib/email.ts`, `lib/emailService.ts`, `vercel.json`). Update this doc when new routes are added.*
