create or replace function automation.schedule_production_plan_whatsapp_jobs(
  app_url text,
  automation_secret text,
  morning_schedule text default '30 0 * * *',
  evening_schedule text default null
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

  if exists (
    select 1
    from cron.job
    where jobname = 'production-plan-whatsapp-morning'
  ) then
    perform cron.unschedule('production-plan-whatsapp-morning');
  end if;

  if exists (
    select 1
    from cron.job
    where jobname = 'production-plan-whatsapp-evening'
  ) then
    perform cron.unschedule('production-plan-whatsapp-evening');
  end if;

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

  if coalesce(evening_schedule, '') <> '' then
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
  end if;
end;
$$;

create or replace function automation.unschedule_production_plan_whatsapp_jobs()
returns void
language plpgsql
as $$
begin
  if exists (
    select 1
    from cron.job
    where jobname = 'production-plan-whatsapp-morning'
  ) then
    perform cron.unschedule('production-plan-whatsapp-morning');
  end if;

  if exists (
    select 1
    from cron.job
    where jobname = 'production-plan-whatsapp-evening'
  ) then
    perform cron.unschedule('production-plan-whatsapp-evening');
  end if;
end;
$$;
