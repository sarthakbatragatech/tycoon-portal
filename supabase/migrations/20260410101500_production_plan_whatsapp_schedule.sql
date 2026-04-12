create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

create schema if not exists automation;

create table if not exists automation.production_plan_whatsapp_runs (
  id uuid primary key default gen_random_uuid(),
  slot text not null check (slot in ('morning', 'evening', 'manual')),
  status text not null check (status in ('sent', 'failed', 'dry_run')),
  recipient text,
  image_url text,
  message_id text,
  request_payload jsonb,
  response_payload jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists production_plan_whatsapp_runs_created_at_idx
  on automation.production_plan_whatsapp_runs (created_at desc);

create or replace function automation.schedule_production_plan_whatsapp_jobs(
  app_url text,
  automation_secret text,
  morning_schedule text default '30 3 * * *',
  evening_schedule text default '30 12 * * *'
)
returns void
language plpgsql
as $$
declare
  normalized_app_url text := rtrim(coalesce(app_url, ''), '/');
  endpoint_url text;
  auth_headers text;
begin
  if normalized_app_url = '' then
    raise exception 'app_url is required';
  end if;

  if coalesce(automation_secret, '') = '' then
    raise exception 'automation_secret is required';
  end if;

  endpoint_url := normalized_app_url || '/api/internal/production-plan-whatsapp';
  auth_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || automation_secret
  )::text;

  perform cron.schedule(
    'production-plan-whatsapp-morning',
    morning_schedule,
    format(
      $command$
        select net.http_post(
          url:=%L,
          headers:=%L::jsonb,
          body:=%L::jsonb,
          timeout_milliseconds:=30000
        );
      $command$,
      endpoint_url,
      auth_headers,
      '{"slot":"morning"}'
    )
  );

  perform cron.schedule(
    'production-plan-whatsapp-evening',
    evening_schedule,
    format(
      $command$
        select net.http_post(
          url:=%L,
          headers:=%L::jsonb,
          body:=%L::jsonb,
          timeout_milliseconds:=30000
        );
      $command$,
      endpoint_url,
      auth_headers,
      '{"slot":"evening"}'
    )
  );
end;
$$;

create or replace function automation.unschedule_production_plan_whatsapp_jobs()
returns void
language plpgsql
as $$
begin
  perform cron.unschedule('production-plan-whatsapp-morning');
  perform cron.unschedule('production-plan-whatsapp-evening');
exception
  when sqlstate '22023' then
    null;
end;
$$;
