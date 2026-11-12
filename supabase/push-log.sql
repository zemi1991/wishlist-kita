-- Log setiap percubaan hantar notifikasi (untuk siasatan; hanya pelayan boleh akses)
create table if not exists public.push_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  email text,
  host text,
  status int,
  error text,
  title text
);
alter table public.push_log enable row level security;
-- Kunci untuk hantar notifikasi ujian (hanya pelayan boleh baca)
insert into public.app_keys (id, public_key, private_key)
values (2, $t$test-key$t$, replace(gen_random_uuid()::text, $d$-$d$, $d$$d$))
on conflict (id) do nothing;
