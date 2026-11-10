create table if not exists public.members (
  email text primary key,
  name text not null
);

drop table if exists public.items;
create table public.items (
  id uuid primary key default gen_random_uuid(),
  cat text not null,
  title text not null,
  url text,
  note text,
  place text,
  price text,
  date date,
  done boolean not null default false,
  fav boolean not null default false,
  by_email text default auth.email(),
  created_at timestamptz not null default now()
);

alter table public.members enable row level security;
alter table public.items enable row level security;

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members where lower(email) = lower(auth.email()));
$$;

drop policy if exists members_read on public.members;
create policy members_read on public.members
  for select to authenticated using (public.is_member());

drop policy if exists items_all on public.items;
create policy items_all on public.items
  for all to authenticated using (public.is_member()) with check (public.is_member());

alter publication supabase_realtime add table public.items;
