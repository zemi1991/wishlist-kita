-- Notifikasi peringatan. Tiada tanda petik biasa supaya selamat disalin di telefon.

create table if not exists public.push_subs (
  endpoint text primary key,
  p256dh text not null,
  auth text not null,
  email text default auth.email(),
  created_at timestamptz not null default now()
);
alter table public.push_subs enable row level security;
drop policy if exists push_subs_all on public.push_subs;
create policy push_subs_all on public.push_subs
  for all to authenticated using (public.is_member()) with check (public.is_member());

-- Rekod notifikasi yang dah dihantar (hanya fungsi pelayan boleh akses)
create table if not exists public.reminder_log (
  item_id uuid not null,
  kind text not null,
  day date not null,
  primary key (item_id, kind, day)
);
alter table public.reminder_log enable row level security;

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Setiap hari 01:00 UTC = 9:00 pagi waktu Malaysia
select cron.schedule(
  $n$wishlist-reminders$n$,
  $s$0 1 * * *$s$,
  $c$
  select net.http_post(
    url := $u$https://ggdhadswkfxtobkwticn.supabase.co/functions/v1/send-reminders$u$,
    headers := jsonb_build_object(
      $k$Content-Type$k$, $k$application/json$k$,
      $k$Authorization$k$, $k$Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdnZGhhZHN3a2Z4dG9ia3d0aWNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQyNTg5NDMsImV4cCI6MjEwOTgzNDk0M30.yo0Zj733nnhO_bUNWxcIbat9UQ1Ca7XP_ViudxACD9I$k$
    ),
    body := $b${}$b$::jsonb
  );
  $c$
);
