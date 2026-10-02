-- Allow event hosts (not just creators/admins) to manage variety art type slots.

DROP POLICY IF EXISTS event_art_types_manage_by_creator_or_admin ON public.event_art_types;
CREATE POLICY event_art_types_manage_by_creator_or_admin
ON public.event_art_types
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.events e
    WHERE e.id = event_art_types.event_id
      AND (
        e.created_by = auth.uid()
        OR e.host_user_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.role = 'admin'
        )
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.events e
    WHERE e.id = event_art_types.event_id
      AND (
        e.created_by = auth.uid()
        OR e.host_user_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.role = 'admin'
        )
      )
  )
);
