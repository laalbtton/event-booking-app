-- Debug why an event might not appear on the dashboard for a given user.
-- Replace the UUID literals below (KEEP the quotes) with your event id and the performer's user id.

-- 1) Event basics (must be active for dashboard loadData)
SELECT id, title, status, event_type, date, end_time, created_at
FROM public.events
WHERE id = '00000000-0000-0000-0000-000000000000'::uuid;

-- 2) Community links (dashboard requires status = 'approved' for at least one community the user is in)
SELECT ec.id, ec.community_id, ec.is_primary, ec.status, c.name AS community_name
FROM public.event_communities ec
LEFT JOIN public.communities c ON c.id = ec.community_id
WHERE ec.event_id = '00000000-0000-0000-0000-000000000000'::uuid;

-- 3) Is the viewer in any community that has an approved link for this event?
SELECT cm.community_id, cm.role, c.name
FROM public.community_members cm
JOIN public.communities c ON c.id = cm.community_id
WHERE cm.user_id = '00000000-0000-0000-0000-000000000000'::uuid
  AND cm.community_id IN (
    SELECT ec.community_id
    FROM public.event_communities ec
    WHERE ec.event_id = '00000000-0000-0000-0000-000000000000'::uuid
      AND ec.status = 'approved'
  );

-- 4) “Would dashboard return this event?” — same logic as app (active + date/end_time + overlap with user communities)
WITH params AS (
  SELECT '00000000-0000-0000-0000-000000000000'::uuid AS eid,
         '00000000-0000-0000-0000-000000000000'::uuid AS uid,
         now() AS now_ts
)
SELECT
  e.id,
  e.status AS event_status,
  e.event_type,
  e.date,
  e.end_time,
  (e.status = 'active') AS passes_active,
  (
    e.date >= (SELECT now_ts FROM params)
    OR (e.end_time IS NOT NULL AND e.end_time >= (SELECT now_ts FROM params))
  ) AS passes_upcoming_time,
  EXISTS (
    SELECT 1
    FROM public.event_communities ec
    JOIN public.community_members cm ON cm.community_id = ec.community_id AND cm.user_id = (SELECT uid FROM params)
    WHERE ec.event_id = e.id
      AND ec.status = 'approved'
  ) AS user_shares_approved_community
FROM public.events e
CROSS JOIN params
WHERE e.id = (SELECT eid FROM params);

-- If query (3) returns no rows, the performer is not in any community linked to the event:
-- they must join that community (or you must add event_communities for a community they are in).
