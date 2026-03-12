# Role-Based System Implementation

## Overview

The application now supports a role-based access control system with three distinct user roles:

1. **Performer** - Default role for users who attend events to perform
2. **Event Creator** - Users who can create and manage events (can also attend events)
3. **Admin** - Full administrative access (can manage users, credits, and all events)

## Database Changes

### Migration Required

Run the following SQL in your Supabase SQL editor (already included in `database_migrations.sql`):

```sql
-- Add role column to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'performer' CHECK (role IN ('performer', 'event_creator', 'admin'));

-- Update existing admins
UPDATE profiles
SET role = 'admin'
WHERE id IN (SELECT user_id FROM admin_users);

-- Create index for role queries
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);

-- Add created_by column to events table
ALTER TABLE events
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_events_created_by ON events(created_by);
```

## Role Permissions

### Performer
- ✅ View and book events
- ✅ View own profile
- ✅ View public profiles
- ❌ Create events
- ❌ Manage events
- ❌ Access admin panel

### Event Creator
- ✅ All Performer permissions
- ✅ Create events
- ✅ Manage own events (edit, delete, view attendance, generate QR codes)
- ✅ Set event hosts
- ✅ Mark attendance for own events
- ❌ Access admin panel
- ❌ Manage other users' events

### Admin
- ✅ All Event Creator permissions
- ✅ Access admin panel
- ✅ Manage all events (not just own)
- ✅ Manage users (add credits, view all users)
- ✅ View all bookings
- ✅ Manage any event's attendance

## New Pages and Routes

### Apply for Event Creator (`/apply-event-creator`)
- Accessible to: Performers only
- Features:
  - Form to request Event Creator status
  - Optional message explaining why they want to become an Event Creator
  - Shows status of existing requests (pending/approved/rejected)
  - If approved, automatically redirects to Event Management

### Admin Role Requests (`/admin/requests`)
- Accessible to: Admins only
- Features:
  - View all role change requests
  - Filter by status (all, pending, approved, rejected)
  - Approve or reject requests
  - Add admin notes when reviewing
  - Automatically updates user role when approved

### Event Management (`/events/manage`)

### Event Management (`/events/manage`)
- Accessible to: Event Creators and Admins
- Features:
  - View own events (event creators) or all events (admins)
  - Create new events
  - Edit event details
  - Delete events
  - Copy public links
  - Generate QR codes
  - Manage attendance

### Event QR Code (`/events/[id]/qr`)
- Accessible to: Event Creators (own events) and Admins (all events)
- Features:
  - Generate QR code for event public page
  - Copy public URL
  - View public page

### Event Attendance (`/events/[id]/attendance`)
- Accessible to: Event Creators (own events) and Admins (all events)
- Features:
  - View confirmed bookings
  - Mark attendance status (attended, no show, reset)
  - Set event host
  - View attendance statistics

## Navigation Updates

### Dashboard
- **Event Management** link appears for Event Creators and Admins
- **Admin Panel** link appears only for Admins

### Admin Panel
- Only accessible to users with `role = 'admin'`
- Event Creators are redirected to dashboard if they try to access

### Login Redirect
- **Admins** → `/admin`
- **Event Creators & Performers** → `/dashboard`

## Backward Compatibility

The system maintains backward compatibility with the existing `admin_users` table:
- If a user's role is not set in the `profiles` table, the system checks `admin_users` table
- Existing admins in `admin_users` are automatically assigned `role = 'admin'` during migration

## Setting User Roles

### Method 1: Admin Panel (Recommended)

Admins can manage user roles directly from the Admin Panel:

1. Go to **Admin Panel** → **Users**
2. Find the user in the table
3. Use the dropdown in the **Role** column to change their role
4. Changes take effect immediately

### Method 2: Role Change Requests (Self-Service)

Users can apply to become Event Creators:

1. **User applies** at `/apply-event-creator`
   - Users with `role = 'performer'` see an "Apply Now" button on their dashboard
   - They can submit an optional message explaining why they want to become an Event Creator

2. **Admin reviews** at **Admin Panel** → **Role Requests**
   - Admins see all pending requests
   - They can approve or reject with optional admin notes
   - When approved, the user's role is automatically updated to `event_creator`

3. **User sees status** on their dashboard:
   - **Pending**: Yellow banner showing application is under review
   - **Approved**: User automatically gets Event Creator privileges
   - **Rejected**: Red banner with option to reapply

### Method 3: Direct Database Update (Advanced)

To set a user's role directly via SQL:

```sql
-- Set user as event creator
UPDATE profiles
SET role = 'event_creator'
WHERE id = 'user-uuid-here';

-- Set user as admin
UPDATE profiles
SET role = 'admin'
WHERE id = 'user-uuid-here';

-- Set user as performer (default)
UPDATE profiles
SET role = 'performer'
WHERE id = 'user-uuid-here';
```

## TypeScript Types

The `Profile` type in `lib/supabase.ts` now includes:
```typescript
export type UserRole = 'performer' | 'event_creator' | 'admin'

export type Profile = {
  // ... other fields
  role: UserRole
}
```

The `Event` type now includes:
```typescript
export type Event = {
  // ... other fields
  created_by: string | null
}
```

## Security Notes

1. **Event Access Control**: Event creators can only edit/delete/manage events they created (`created_by = user.id`)
2. **Admin Override**: Admins can manage all events regardless of `created_by`
3. **Role Verification**: All protected routes verify user role before allowing access
4. **Database Constraints**: The `role` column has a CHECK constraint to ensure only valid roles are stored

## Testing Checklist

- [ ] Run database migration
- [ ] Test performer user can view/book events but cannot create
- [ ] Test event creator can create and manage own events
- [ ] Test event creator cannot access admin panel
- [ ] Test event creator cannot manage other users' events
- [ ] Test admin can access admin panel
- [ ] Test admin can manage all events
- [ ] Test login redirects work correctly for each role
- [ ] Test dashboard navigation links appear correctly
