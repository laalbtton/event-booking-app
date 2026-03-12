-- ============================================
-- Poster storage bucket + object policies
-- ============================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'event-posters',
  'event-posters',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.try_parse_uuid(text)
RETURNS UUID
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN $1::uuid;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.storage_event_id_from_path(path TEXT)
RETURNS UUID
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT public.try_parse_uuid(split_part(path, '/', 1));
$$;

DROP POLICY IF EXISTS "event_posters_select" ON storage.objects;
CREATE POLICY "event_posters_select"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'event-posters'
  AND (
    EXISTS (
      SELECT 1
      FROM public.bookings b
      WHERE b.event_id = public.storage_event_id_from_path(name)
        AND b.user_id = auth.uid()
        AND b.status IN ('confirmed', 'waitlist')
    )
    OR EXISTS (
      SELECT 1
      FROM public.events e
      WHERE e.id = public.storage_event_id_from_path(name)
        AND (e.created_by = auth.uid() OR e.host_user_id = auth.uid())
    )
    OR EXISTS (SELECT 1 FROM public.admin_users au WHERE au.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  )
);

DROP POLICY IF EXISTS "event_posters_insert" ON storage.objects;
CREATE POLICY "event_posters_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'event-posters'
  AND EXISTS (
    SELECT 1
    FROM public.events e
    WHERE e.id = public.storage_event_id_from_path(name)
      AND (
        e.created_by = auth.uid()
        OR e.host_user_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.admin_users au WHERE au.user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
      )
  )
);

DROP POLICY IF EXISTS "event_posters_update" ON storage.objects;
CREATE POLICY "event_posters_update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'event-posters'
  AND EXISTS (
    SELECT 1
    FROM public.events e
    WHERE e.id = public.storage_event_id_from_path(name)
      AND (
        e.created_by = auth.uid()
        OR e.host_user_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.admin_users au WHERE au.user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
      )
  )
)
WITH CHECK (
  bucket_id = 'event-posters'
  AND EXISTS (
    SELECT 1
    FROM public.events e
    WHERE e.id = public.storage_event_id_from_path(name)
      AND (
        e.created_by = auth.uid()
        OR e.host_user_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.admin_users au WHERE au.user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
      )
  )
);

DROP POLICY IF EXISTS "event_posters_delete" ON storage.objects;
CREATE POLICY "event_posters_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'event-posters'
  AND EXISTS (
    SELECT 1
    FROM public.events e
    WHERE e.id = public.storage_event_id_from_path(name)
      AND (
        e.created_by = auth.uid()
        OR e.host_user_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.admin_users au WHERE au.user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
      )
  )
);
