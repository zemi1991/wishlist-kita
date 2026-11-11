-- Belum dibaca: siapa yang dah buka setiap item
alter table public.items add column if not exists seen_by text[] not null default $d${}$d$;
-- Item sedia ada dikira dah dibaca oleh semua ahli
update public.items set seen_by = (select array_agg(email) from public.members) where cardinality(seen_by) = 0;

-- Notifikasi segera bila item baru dikongsi
create or replace function public.notify_new_item() returns trigger
language plpgsql security definer set search_path = public as $f$
begin
  perform net.http_post(
    url := $u$https://ggdhadswkfxtobkwticn.supabase.co/functions/v1/send-reminders$u$,
    headers := jsonb_build_object($k$Content-Type$k$, $k$application/json$k$, $k$Authorization$k$, $k$Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdnZGhhZHN3a2Z4dG9ia3d0aWNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQyNTg5NDMsImV4cCI6MjEwOTgzNDk0M30.yo0Zj733nnhO_bUNWxcIbat9UQ1Ca7XP_ViudxACD9I$k$),
    body := jsonb_build_object($k$new_item$k$, new.id)
  );
  return new;
end $f$;
drop trigger if exists items_notify_new on public.items;
create trigger items_notify_new after insert on public.items
  for each row execute function public.notify_new_item();
