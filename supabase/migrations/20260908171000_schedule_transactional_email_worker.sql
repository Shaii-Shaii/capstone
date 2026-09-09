begin;

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists supabase_vault with schema vault;

create or replace function public.dispatch_donivra_email_outbox()
returns bigint
language plpgsql
security definer
set search_path = public, extensions, net, vault, pg_temp
as $$
declare
  project_url text;
  service_key text;
  request_id bigint;
begin
  select decrypted_secret into project_url
  from vault.decrypted_secrets
  where name = 'donivra_project_url'
  order by created_at desc
  limit 1;

  select decrypted_secret into service_key
  from vault.decrypted_secrets
  where name = 'donivra_service_role_key'
  order by created_at desc
  limit 1;

  if nullif(btrim(project_url), '') is null
     or nullif(btrim(service_key), '') is null then
    return null;
  end if;

  select net.http_post(
    url := rtrim(project_url, '/') || '/functions/v1/send-donivra-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', service_key,
      'Authorization', 'Bearer ' || service_key
    ),
    body := jsonb_build_object('processPending', true, 'limit', 20),
    timeout_milliseconds := 30000
  ) into request_id;

  return request_id;
end;
$$;

revoke all on function public.dispatch_donivra_email_outbox()
from public, anon, authenticated;
grant execute on function public.dispatch_donivra_email_outbox()
to service_role;

do $$
declare
  existing_job record;
begin
  for existing_job in
    select jobid from cron.job where jobname = 'donivra-transactional-email-worker'
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;
  perform cron.schedule(
    'donivra-transactional-email-worker',
    '* * * * *',
    'select public.dispatch_donivra_email_outbox();'
  );

  for existing_job in
    select jobid from cron.job where jobname = 'donivra-event-email-reminders'
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;
  perform cron.schedule(
    'donivra-event-email-reminders',
    '*/15 * * * *',
    'select public.enqueue_due_donivra_event_reminders();'
  );
end;
$$;

comment on function public.dispatch_donivra_email_outbox()
is 'Asynchronously invokes the centralized email Edge Function using project URL and service-role credentials stored in Supabase Vault.';

commit;
