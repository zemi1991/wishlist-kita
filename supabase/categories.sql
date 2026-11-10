-- Kategori sendiri (selain Makan, Beli, Jalan, Idea, Ingat)
create table if not exists public.categories (
  id text primary key,
  label text not null,
  color text not null,
  extra text,                 -- place / price / kosong
  created_at timestamptz not null default now()
);
alter table public.categories enable row level security;
drop policy if exists categories_all on public.categories;
create policy categories_all on public.categories
  for all to authenticated using (public.is_member()) with check (public.is_member());

do $x$ begin
  alter publication supabase_realtime add table public.categories;
exception when duplicate_object then null; end $x$;
