-- When true (default), primary community event links are approved immediately on submit
-- so approved events show on the performer dashboard. When false, community admins
-- must approve the link via Pending links (or the event via New Events flow).
ALTER TABLE public.communities
  ADD COLUMN IF NOT EXISTS auto_approve_new_events BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.communities.auto_approve_new_events IS
  'If true, event_creator primary submissions auto-approve event_communities. If false, admins must approve the link.';
