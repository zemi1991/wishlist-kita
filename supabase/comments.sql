-- Komen pada setiap item
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  body text not null,
  by_email text not null default auth.email(),
  created_at timestamptz not null default now()
);
create index if not exists comments_item_idx on public.comments(item_id);
alter table public.comments enable row level security;
drop policy if exists comments_read on public.comments;
create policy comments_read on public.comments for select to authenticated using (public.is_member());
drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments for insert to authenticated
  with check (public.is_member() and lower(by_email) = lower(auth.email()));
drop policy if exists comments_delete_own on public.comments;
create policy comments_delete_own on public.comments for delete to authenticated
  using (public.is_member() and lower(by_email) = lower(auth.email()));
do $x$ begin
  alter publication supabase_realtime add table public.comments;
exception when duplicate_object then null; end $x$;

-- Bila setiap ahli kali terakhir baca komen pada item (email -> masa)
alter table public.items add column if not exists cmt_seen jsonb not null default $d${}$d$::jsonb;

-- Notifikasi segera bila ada komen baru
create or replace function public.notify_new_comment() returns trigger
language plpgsql security definer set search_path = public as $f$
begin
  perform net.http_post(
    url := $u$https://ggdhadswkfxtobkwticn.supabase.co/functions/v1/send-reminders$u$,
    headers := jsonb_build_object($k$Content-Type$k$, $k$application/json$k$, $k$Authorization$k$, $k$Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdnZGhhZHN3a2Z4dG9ia3d0aWNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQyNTg5NDMsImV4cCI6MjEwOTgzNDk0M30.yo0Zj733nnhO_bUNWxcIbat9UQ1Ca7XP_ViudxACD9I$k$),
    body := jsonb_build_object($k$new_comment$k$, new.id),
    timeout_milliseconds := 30000
  );
  return new;
end $f$;
drop trigger if exists comments_notify_new on public.comments;
create trigger comments_notify_new after insert on public.comments
  for each row execute function public.notify_new_comment();
