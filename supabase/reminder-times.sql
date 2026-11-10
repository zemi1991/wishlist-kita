-- Masa peringatan & peringatan awal (dijalankan selepas notifications.sql)
alter table public.items add column if not exists at_time text;      -- HH:MM, kosong = 9:00 pagi
alter table public.items add column if not exists early_min int;     -- minit sebelum; kosong = tiada
update public.items set early_min = 1440 where cat = $q$ingat$q$ and early_min is null;

drop table if exists public.reminder_log;
create table public.reminder_log (
  item_id uuid not null,
  alert_at timestamptz not null,
  primary key (item_id, alert_at)
);
alter table public.reminder_log enable row level security;

-- Semak setiap 5 minit
select cron.alter_job(job_id := (select jobid from cron.job where jobname = $n$wishlist-reminders$n$), schedule := $s$*/5 * * * *$s$);
