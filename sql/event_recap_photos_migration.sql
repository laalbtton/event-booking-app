-- ============================================
-- Post-event recap photos → Instagram carousel
-- Apply this in the Supabase SQL editor before using the feature.
-- ============================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'event-recap-photos',
  'event-recap-photos',
  true,
  8388608,
  ARRAY['image/jpeg', 'image/png']
)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS recap_caption TEXT;

ALTER TABLE public.social_post_jobs
ADD COLUMN IF NOT EXISTS job_type TEXT NOT NULL DEFAULT 'poster';

ALTER TABLE public.social_post_jobs
DROP CONSTRAINT IF EXISTS social_post_jobs_job_type_check;

ALTER TABLE public.social_post_jobs
ADD CONSTRAINT social_post_jobs_job_type_check
CHECK (job_type IN ('poster', 'recap_carousel'));

ALTER TABLE public.social_post_jobs
ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.event_recap_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  public_url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'posting', 'posted', 'deleted', 'failed')),
  posted_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS event_recap_photos_event_status_idx
  ON public.event_recap_photos(event_id, status, sort_order, created_at);

CREATE INDEX IF NOT EXISTS event_recap_photos_status_idx
  ON public.event_recap_photos(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_recap_photos TO authenticated;
GRANT ALL ON public.event_recap_photos TO service_role;

DROP TRIGGER IF EXISTS event_recap_photos_set_updated_at ON public.event_recap_photos;
CREATE TRIGGER event_recap_photos_set_updated_at
BEFORE UPDATE ON public.event_recap_photos
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at_timestamp();

ALTER TABLE public.event_recap_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "event_recap_photos_select_scope" ON public.event_recap_photos;
CREATE POLICY "event_recap_photos_select_scope"
ON public.event_recap_photos
FOR SELECT
TO authenticated
USING (
  status <> 'deleted'
  AND (
    auth.uid() = uploaded_by
    OR EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.event_id = event_recap_photos.event_id
        AND b.user_id = auth.uid()
        AND b.status = 'confirmed'
    )
    OR EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_recap_photos.event_id
        AND (e.created_by = auth.uid() OR e.host_user_id = auth.uid())
    )
    OR EXISTS (SELECT 1 FROM public.admin_users au WHERE au.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  )
);

DROP POLICY IF EXISTS "event_recap_photos_insert_scope" ON public.event_recap_photos;
CREATE POLICY "event_recap_photos_insert_scope"
ON public.event_recap_photos
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = uploaded_by
  AND (
    EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.event_id = event_recap_photos.event_id
        AND b.user_id = auth.uid()
        AND b.status = 'confirmed'
    )
    OR EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_recap_photos.event_id
        AND (e.created_by = auth.uid() OR e.host_user_id = auth.uid())
    )
    OR EXISTS (SELECT 1 FROM public.admin_users au WHERE au.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  )
);

DROP POLICY IF EXISTS "event_recap_photos_update_scope" ON public.event_recap_photos;
CREATE POLICY "event_recap_photos_update_scope"
ON public.event_recap_photos
FOR UPDATE
TO authenticated
USING (
  auth.uid() = uploaded_by
  OR EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = event_recap_photos.event_id
      AND (e.created_by = auth.uid() OR e.host_user_id = auth.uid())
  )
  OR EXISTS (SELECT 1 FROM public.admin_users au WHERE au.user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
)
WITH CHECK (
  auth.uid() = uploaded_by
  OR EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = event_recap_photos.event_id
      AND (e.created_by = auth.uid() OR e.host_user_id = auth.uid())
  )
  OR EXISTS (SELECT 1 FROM public.admin_users au WHERE au.user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);

DROP POLICY IF EXISTS "event_recap_photos_delete_scope" ON public.event_recap_photos;
CREATE POLICY "event_recap_photos_delete_scope"
ON public.event_recap_photos
FOR DELETE
TO authenticated
USING (
  auth.uid() = uploaded_by
  OR EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = event_recap_photos.event_id
      AND (e.created_by = auth.uid() OR e.host_user_id = auth.uid())
  )
  OR EXISTS (SELECT 1 FROM public.admin_users au WHERE au.user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);

DROP POLICY IF EXISTS "event_recap_photos_storage_select" ON storage.objects;
CREATE POLICY "event_recap_photos_storage_select"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'event-recap-photos');

DROP POLICY IF EXISTS "event_recap_photos_storage_insert" ON storage.objects;
CREATE POLICY "event_recap_photos_storage_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'event-recap-photos'
  AND (
    EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.event_id = public.storage_event_id_from_path(name)
        AND b.user_id = auth.uid()
        AND b.status = 'confirmed'
    )
    OR EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = public.storage_event_id_from_path(name)
        AND (e.created_by = auth.uid() OR e.host_user_id = auth.uid())
    )
    OR EXISTS (SELECT 1 FROM public.admin_users au WHERE au.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  )
);

DROP POLICY IF EXISTS "event_recap_photos_storage_delete" ON storage.objects;
CREATE POLICY "event_recap_photos_storage_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'event-recap-photos'
  AND (
    owner = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.event_recap_photos p
      WHERE p.storage_path = name AND p.uploaded_by = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = public.storage_event_id_from_path(name)
        AND (e.created_by = auth.uid() OR e.host_user_id = auth.uid())
    )
    OR EXISTS (SELECT 1 FROM public.admin_users au WHERE au.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  )
);
