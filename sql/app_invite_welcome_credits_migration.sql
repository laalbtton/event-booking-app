CREATE TABLE IF NOT EXISTS public.app_invite_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  welcome_credits INTEGER NOT NULL CHECK (welcome_credits > 0),
  expires_at TIMESTAMPTZ NOT NULL,
  max_uses INTEGER CHECK (max_uses IS NULL OR max_uses > 0),
  uses INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_invite_links_created_by ON public.app_invite_links(created_by);
CREATE INDEX IF NOT EXISTS idx_app_invite_links_expires_at ON public.app_invite_links(expires_at);

CREATE TABLE IF NOT EXISTS public.app_invite_credit_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_link_id UUID NOT NULL REFERENCES public.app_invite_links(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  credits_granted INTEGER NOT NULL CHECK (credits_granted > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(invite_link_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_app_invite_credit_grants_user_id ON public.app_invite_credit_grants(user_id);
CREATE INDEX IF NOT EXISTS idx_app_invite_credit_grants_invite_link_id ON public.app_invite_credit_grants(invite_link_id);

ALTER TABLE public.credit_transactions
ADD COLUMN IF NOT EXISTS credit_source TEXT;

ALTER TABLE public.credit_transactions
ADD COLUMN IF NOT EXISTS source_reason TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'credit_transactions_credit_source_check'
  ) THEN
    ALTER TABLE public.credit_transactions
    ADD CONSTRAINT credit_transactions_credit_source_check
    CHECK (credit_source IS NULL OR credit_source IN ('purchase', 'cash', 'in_kind'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_credit_transactions_credit_source
  ON public.credit_transactions(credit_source);
