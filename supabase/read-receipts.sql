-- Resit baca: bila setiap ahli buka item (email -> masa)
alter table public.items add column if not exists seen_at jsonb not null default $d${}$d$::jsonb;
