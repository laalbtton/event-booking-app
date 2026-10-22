-- ============================================================
-- CRM: private contact list per user
-- A comedian saves people they meet and might invite to shows,
-- tags them, filters, and exports lists.
-- Run in the Supabase SQL editor (safe to re-run).
--
-- Phase 2 (not built yet, schema stays compatible):
--   contact_invites(contact_id, event_id, status, invited_at)
--   invite_lists(owner_id, name, filter_json) + invite_list_shares
--   The invite_status column below is the "latest status" summary;
--   per-event history will live in contact_invites later.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── Normalization helpers (immutable so they can back indexes) ──
-- Digits only, with a leading + when the source had one. 10-digit North
-- American numbers become +1XXXXXXXXXX so "(416) 555-0100" and
-- "+1 416 555 0100" collide.
CREATE OR REPLACE FUNCTION public.crm_normalize_phone(raw TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN raw IS NULL OR btrim(raw) = '' THEN NULL
    ELSE (
      WITH d AS (
        SELECT regexp_replace(raw, '[^0-9]', '', 'g') AS digits,
               left(btrim(raw), 1) = '+' AS has_plus
      )
      SELECT CASE
        WHEN digits = '' THEN NULL
        WHEN has_plus THEN '+' || digits
        WHEN length(digits) = 10 THEN '+1' || digits
        WHEN length(digits) = 11 AND left(digits, 1) = '1' THEN '+' || digits
        ELSE '+' || digits
      END
      FROM d
    )
  END
$$;

-- Lowercase handle, no @, no instagram.com URL, no trailing slash/query.
CREATE OR REPLACE FUNCTION public.crm_normalize_instagram(raw TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(
    regexp_replace(
      regexp_replace(
        lower(btrim(raw)),
        '^(https?://)?(www\.)?instagram\.com/', ''
      ),
      '^@|[/?#].*$', '', 'g'
    ),
    ''
  )
$$;

-- ── contacts ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (btrim(name) <> ''),
  email TEXT,
  phone TEXT,
  -- Stored already normalized (app + trigger both enforce it).
  instagram TEXT,
  city TEXT,
  notes TEXT,
  how_met TEXT,
  invite_status TEXT NOT NULL DEFAULT 'not_invited'
    CHECK (invite_status IN ('not_invited', 'invited', 'attended', 'declined')),
  ok_to_contact BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT contacts_has_contact_method CHECK (
    NULLIF(btrim(email), '') IS NOT NULL
    OR NULLIF(btrim(phone), '') IS NOT NULL
    OR NULLIF(btrim(instagram), '') IS NOT NULL
  )
);

-- Normalize before write so uniqueness is meaningful regardless of caller.
CREATE OR REPLACE FUNCTION public.crm_contacts_normalize()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.name := btrim(NEW.name);
  NEW.email := NULLIF(lower(btrim(NEW.email)), '');
  NEW.phone := NULLIF(btrim(NEW.phone), '');
  NEW.instagram := public.crm_normalize_instagram(NEW.instagram);
  NEW.city := NULLIF(btrim(NEW.city), '');
  NEW.notes := NULLIF(btrim(NEW.notes), '');
  NEW.how_met := NULLIF(btrim(NEW.how_met), '');
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contacts_normalize ON public.contacts;
CREATE TRIGGER contacts_normalize
  BEFORE INSERT OR UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.crm_contacts_normalize();

-- One row per person per owner, matched on any contact method.
CREATE UNIQUE INDEX IF NOT EXISTS contacts_owner_email_unique
  ON public.contacts (owner_id, lower(email))
  WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS contacts_owner_phone_unique
  ON public.contacts (owner_id, public.crm_normalize_phone(phone))
  WHERE phone IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS contacts_owner_instagram_unique
  ON public.contacts (owner_id, instagram)
  WHERE instagram IS NOT NULL;

CREATE INDEX IF NOT EXISTS contacts_owner_created_idx
  ON public.contacts (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS contacts_owner_city_idx
  ON public.contacts (owner_id, lower(city));
CREATE INDEX IF NOT EXISTS contacts_owner_status_idx
  ON public.contacts (owner_id, invite_status);
-- Fuzzy search over name / email / instagram / notes.
CREATE INDEX IF NOT EXISTS contacts_search_trgm_idx
  ON public.contacts USING GIN (
    (coalesce(name, '') || ' ' || coalesce(email, '') || ' ' || coalesce(instagram, '') || ' ' || coalesce(notes, '')) gin_trgm_ops
  );

-- ── tags ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (btrim(name) <> ''),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS tags_owner_name_unique
  ON public.tags (owner_id, lower(name));
CREATE INDEX IF NOT EXISTS tags_owner_idx ON public.tags (owner_id);

-- ── contact_tags ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.contact_tags (
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  PRIMARY KEY (contact_id, tag_id)
);

CREATE INDEX IF NOT EXISTS contact_tags_tag_idx ON public.contact_tags (tag_id);

-- ── Row Level Security ──────────────────────────────────────
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contacts: owner all" ON public.contacts;
CREATE POLICY "contacts: owner all" ON public.contacts
  FOR ALL
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "tags: owner all" ON public.tags;
CREATE POLICY "tags: owner all" ON public.tags
  FOR ALL
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- contact_tags has no owner column; ownership comes from the contact row.
DROP POLICY IF EXISTS "contact_tags: owner all" ON public.contact_tags;
CREATE POLICY "contact_tags: owner all" ON public.contact_tags
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = contact_id AND c.owner_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = contact_id AND c.owner_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.tags t WHERE t.id = tag_id AND t.owner_id = auth.uid())
  );

-- ── Tag maintenance helpers ─────────────────────────────────
-- Merge every contact on `source_tag_id` into `target_tag_id`, then drop the
-- source. Both must belong to the caller (RLS still applies inside).
CREATE OR REPLACE FUNCTION public.crm_merge_tags(source_tag_id UUID, target_tag_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  moved INTEGER;
BEGIN
  IF source_tag_id = target_tag_id THEN
    RETURN 0;
  END IF;
  INSERT INTO public.contact_tags (contact_id, tag_id)
  SELECT contact_id, target_tag_id
  FROM public.contact_tags
  WHERE tag_id = source_tag_id
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS moved = ROW_COUNT;
  DELETE FROM public.tags WHERE id = source_tag_id;
  RETURN moved;
END;
$$;

COMMENT ON TABLE public.contacts IS 'Private CRM: people a user met and may invite to shows. RLS owner_id = auth.uid().';
COMMENT ON COLUMN public.contacts.instagram IS 'Normalized handle: lowercase, no @, no URL.';
COMMENT ON COLUMN public.contacts.invite_status IS 'Latest invite outcome summary; per-event history is Phase 2.';
