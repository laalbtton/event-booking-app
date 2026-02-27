-- Push notifications storage and pre-prompt preference state.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  is_active boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_push_subscriptions_user_id on public.push_subscriptions(user_id);
create index if not exists idx_push_subscriptions_active on public.push_subscriptions(is_active);

create table if not exists public.push_notification_prefs (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  preprompt_dismissed_at timestamptz,
  preprompt_dismissed_until timestamptz,
  native_permission_denied_at timestamptz,
  last_prompted_at timestamptz,
  subscribed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;
alter table public.push_notification_prefs enable row level security;

drop policy if exists "push_subscriptions_select_own" on public.push_subscriptions;
create policy "push_subscriptions_select_own"
  on public.push_subscriptions
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "push_subscriptions_insert_own" on public.push_subscriptions;
create policy "push_subscriptions_insert_own"
  on public.push_subscriptions
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "push_subscriptions_update_own" on public.push_subscriptions;
create policy "push_subscriptions_update_own"
  on public.push_subscriptions
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "push_notification_prefs_select_own" on public.push_notification_prefs;
create policy "push_notification_prefs_select_own"
  on public.push_notification_prefs
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "push_notification_prefs_insert_own" on public.push_notification_prefs;
create policy "push_notification_prefs_insert_own"
  on public.push_notification_prefs
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "push_notification_prefs_update_own" on public.push_notification_prefs;
create policy "push_notification_prefs_update_own"
  on public.push_notification_prefs
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
