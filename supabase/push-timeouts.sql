-- Beri fungsi masa sehingga 30 saat (default pg_net 5 saat terlalu pendek untuk cold start)
create or replace function public.notify_new_item() returns trigger
language plpgsql security definer set search_path = public as $f$
begin
  perform net.http_post(
    url := $u$https://ggdhadswkfxtobkwticn.supabase.co/functions/v1/send-reminders$u$,
    headers := jsonb_build_object($k$Content-Type$k$, $k$application/json$k$, $k$Authorization$k$, $k$Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdnZGhhZHN3a2Z4dG9ia3d0aWNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQyNTg5NDMsImV4cCI6MjEwOTgzNDk0M30.yo0Zj733nnhO_bUNWxcIbat9UQ1Ca7XP_ViudxACD9I$k$),
    body := jsonb_build_object($k$new_item$k$, new.id),
    timeout_milliseconds := 30000
  );
  return new;
end $f$;

select cron.alter_job(
  job_id := (select jobid from cron.job where jobname = $n$wishlist-reminders$n$),
  command := $c$
  select net.http_post(
    url := $u$https://ggdhadswkfxtobkwticn.supabase.co/functions/v1/send-reminders$u$,
    headers := jsonb_build_object($k$Content-Type$k$, $k$application/json$k$, $k$Authorization$k$, $k$Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdnZGhhZHN3a2Z4dG9ia3d0aWNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQyNTg5NDMsImV4cCI6MjEwOTgzNDk0M30.yo0Zj733nnhO_bUNWxcIbat9UQ1Ca7XP_ViudxACD9I$k$),
    body := $b${}$b$::jsonb,
    timeout_milliseconds := 30000
  );
  $c$
);
