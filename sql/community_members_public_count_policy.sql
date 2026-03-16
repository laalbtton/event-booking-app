-- Allow anonymous (public) users to read community_members for counting purposes.
-- The existing "community_members_select_authenticated" policy only allows
-- authenticated users, which prevents the public community pages from showing
-- correct member counts when fetched with the anon key.

CREATE POLICY "community_members_select_public"
  ON community_members FOR SELECT
  USING (true);
