-- Jenis browser/telefon bagi setiap langganan (untuk siasat notifikasi)
alter table public.push_subs add column if not exists ua text;
