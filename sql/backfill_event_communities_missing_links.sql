-- Backfill: active events that have NO rows in event_communities yet.
-- Links each event to up to 3 communities the creator belongs to — ANY membership role
-- (member, event_creator, co_admin, admin). Previously only elevated roles were included,
-- so creators who were plain "member" in a community got no rows.
--
-- Ordering: admin → co_admin → event_creator → member, then joined_at ascending.
-- First link gets is_primary = true.
--
-- Run in Supabase SQL Editor after reviewing. Safe to re-run only while affected events still
-- have zero event_communities rows (NOT EXISTS guard).
--
-- If an event already has community rows but none are approved, run the ensure API as the
-- creator or use the optional UPDATE block at the bottom of this file.

WITH ranked AS (
  SELECT
    e.id AS event_id,
    e.created_by,
    cm.community_id,
    ROW_NUMBER() OVER (
      PARTITION BY e.id
      ORDER BY
        CASE cm.role
          WHEN 'admin' THEN 0
          WHEN 'co_admin' THEN 1
          WHEN 'event_creator' THEN 2
          WHEN 'member' THEN 3
          ELSE 4
        END,
        cm.joined_at ASC
    ) AS rn
  FROM public.events e
  INNER JOIN public.community_members cm ON cm.user_id = e.created_by
  WHERE e.status = 'active'
    AND e.created_by IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.event_communities ec WHERE ec.event_id = e.id)
)
INSERT INTO public.event_communities (
  event_id,
  community_id,
  is_primary,
  status,
  submitted_at,
  reviewed_at,
  submitted_by,
  reviewed_by,
  expires_at
)
SELECT
  r.event_id,
  r.community_id,
  (r.rn = 1),
  'approved',
  now(),
  now(),
  r.created_by,
  r.created_by,
  NULL
FROM ranked r
WHERE r.rn <= 3;

-- OPTIONAL: approve existing pending links for live events (use if submission workflow is off
-- and rows stayed pending). Comment out if you rely on community admin approval.
-- UPDATE public.event_communities ec
-- SET status = 'approved', reviewed_at = now(), expires_at = NULL
-- FROM public.events e
-- WHERE ec.event_id = e.id AND e.status = 'active' AND ec.status = 'pending';
