do $$
begin
  create type public.app_role as enum ('admin', 'viewer');
exception
  when duplicate_object then null;
end
$$;

create or replace function public.normalize_username(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(trim(coalesce(value, '')));
$$;

create or replace function public.internal_email_for_username(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select public.normalize_username(value) || '@portal.tycoon.local';
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.allowed_users (
  username text primary key,
  role public.app_role not null default 'viewer',
  setup_code text not null,
  auth_user_id uuid unique references auth.users (id) on delete set null,
  is_active boolean not null default true,
  setup_completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint allowed_users_normalized_username check (username = public.normalize_username(username))
);

create table if not exists public.user_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  role public.app_role not null default 'viewer',
  must_change_password boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint user_profiles_normalized_username check (username = public.normalize_username(username))
);

create index if not exists allowed_users_auth_user_id_idx on public.allowed_users (auth_user_id);
create index if not exists user_profiles_role_idx on public.user_profiles (role);

drop trigger if exists set_allowed_users_updated_at on public.allowed_users;
create trigger set_allowed_users_updated_at
before update on public.allowed_users
for each row
execute function public.touch_updated_at();

drop trigger if exists set_user_profiles_updated_at on public.user_profiles;
create trigger set_user_profiles_updated_at
before update on public.user_profiles
for each row
execute function public.touch_updated_at();

insert into public.allowed_users (username, role, setup_code, is_active)
values (
  'sarthakbatra',
  'admin',
  lower(substr(md5(random()::text || clock_timestamp()::text || 'sarthakbatra'), 1, 12)),
  true
)
on conflict (username) do update
set role = excluded.role,
    is_active = true,
    updated_at = timezone('utc', now());

insert into public.allowed_users (username, role, setup_code, is_active)
values (
  'demo',
  'viewer',
  lower(substr(md5(random()::text || clock_timestamp()::text || 'demo'), 1, 12)),
  true
)
on conflict (username) do update
set role = excluded.role,
    is_active = true,
    updated_at = timezone('utc', now());

create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select up.role::text
  from public.user_profiles up
  where up.id = auth.uid()
  limit 1;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_app_role() = 'admin', false);
$$;

create or replace function public.viewer_dispatch_orders()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() is null or public.current_app_role() is null then '[]'::jsonb
    else (
      with order_rollups as (
        select
          o.id,
          o.order_code,
          o.order_date,
          o.expected_dispatch_date,
          o.status,
          coalesce(o.remarks, '') as remarks,
          coalesce(p.name, 'Unknown customer') as party_name,
          coalesce(p.city, '') as city,
          line_data.items,
          line_data.ordered_qty,
          line_data.dispatched_qty,
          line_data.pending_qty,
          line_data.pending_lines,
          case
            when line_data.ordered_qty > 0 then round((line_data.dispatched_qty / line_data.ordered_qty) * 100)::int
            else 0
          end as fulfillment_pct
        from public.orders o
        left join public.parties p on p.id = o.party_id
        cross join lateral (
          select
            coalesce(
              jsonb_agg(
                jsonb_build_object(
                  'name', line_name,
                  'category', line_category,
                  'ordered', ordered_qty,
                  'dispatched', dispatched_qty,
                  'pending', pending_qty
                )
                order by pending_qty desc, line_name asc
              ) filter (where pending_qty > 0),
              '[]'::jsonb
            ) as items,
            coalesce(sum(ordered_qty), 0)::numeric as ordered_qty,
            coalesce(sum(dispatched_qty), 0)::numeric as dispatched_qty,
            coalesce(sum(pending_qty), 0)::numeric as pending_qty,
            count(*) filter (where pending_qty > 0) as pending_lines
          from (
            select
              coalesce(i.name, 'Unknown item') as line_name,
              coalesce(nullif(i.category, ''), 'Uncategorised') as line_category,
              coalesce(l.qty, 0)::numeric as ordered_qty,
              least(greatest(coalesce(l.dispatched_qty, 0)::numeric, 0), coalesce(l.qty, 0)::numeric) as dispatched_qty,
              greatest(
                coalesce(l.qty, 0)::numeric - least(greatest(coalesce(l.dispatched_qty, 0)::numeric, 0), coalesce(l.qty, 0)::numeric),
                0
              ) as pending_qty
            from public.order_lines l
            left join public.items i on i.id = l.item_id
            where l.order_id = o.id
          ) pending_lines
        ) line_data
        where o.status in ('submitted', 'pending', 'in_production', 'packed', 'partially_dispatched')
          and line_data.pending_qty > 0
      )
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', id,
            'order_code', order_code,
            'order_date', order_date,
            'expected_dispatch_date', expected_dispatch_date,
            'status', status,
            'remarks', remarks,
            'party_name', party_name,
            'city', city,
            'ordered_qty', ordered_qty,
            'dispatched_qty', dispatched_qty,
            'pending_qty', pending_qty,
            'pending_lines', pending_lines,
            'fulfillment_pct', fulfillment_pct,
            'items', items
          )
          order by expected_dispatch_date asc nulls last, order_date asc nulls last
        ),
        '[]'::jsonb
      )
      from order_rollups
    )
  end;
$$;

create or replace function public.viewer_order_detail(p_order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() is null or public.current_app_role() is null then null
    else (
      with order_core as (
        select
          o.id,
          o.order_code,
          o.order_date,
          o.expected_dispatch_date,
          o.status,
          coalesce(o.remarks, '') as remarks,
          coalesce(p.name, 'Unknown customer') as party_name,
          coalesce(p.city, '') as city
        from public.orders o
        left join public.parties p on p.id = o.party_id
        where o.id = p_order_id
          and o.status in ('submitted', 'pending', 'in_production', 'packed', 'partially_dispatched')
      ),
      lines_payload as (
        select
          coalesce(
            jsonb_agg(
              jsonb_build_object(
                'id', l.id,
                'item_name', coalesce(i.name, 'Unknown item'),
                'category', coalesce(nullif(i.category, ''), 'Uncategorised'),
                'qty', coalesce(l.qty, 0),
                'dispatched_qty', least(greatest(coalesce(l.dispatched_qty, 0)::numeric, 0), coalesce(l.qty, 0)::numeric),
                'pending_qty', greatest(
                  coalesce(l.qty, 0)::numeric - least(greatest(coalesce(l.dispatched_qty, 0)::numeric, 0), coalesce(l.qty, 0)::numeric),
                  0
                ),
                'line_remarks', l.line_remarks
              )
              order by coalesce(i.name, 'Unknown item') asc
            ),
            '[]'::jsonb
          ) as lines,
          coalesce(sum(coalesce(l.qty, 0)), 0)::numeric as total_ordered,
          coalesce(sum(least(greatest(coalesce(l.dispatched_qty, 0)::numeric, 0), coalesce(l.qty, 0)::numeric)), 0)::numeric as total_dispatched,
          coalesce(
            sum(
              greatest(
                coalesce(l.qty, 0)::numeric - least(greatest(coalesce(l.dispatched_qty, 0)::numeric, 0), coalesce(l.qty, 0)::numeric),
                0
              )
            ),
            0
          )::numeric as total_pending
        from public.order_lines l
        left join public.items i on i.id = l.item_id
        where l.order_id = p_order_id
      ),
      logs_payload as (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'id', recent_logs.id,
              'message', recent_logs.message,
              'created_at', recent_logs.created_at
            )
            order by recent_logs.created_at desc
          ),
          '[]'::jsonb
        ) as logs
        from (
          select ol.id, ol.message, ol.created_at
          from public.order_logs ol
          where ol.order_id = p_order_id
          order by ol.created_at desc
          limit 50
        ) recent_logs
      ),
      dispatch_payload as (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'order_line_id', de.order_line_id,
              'dispatched_qty', de.dispatched_qty,
              'dispatched_at', de.dispatched_at
            )
            order by de.dispatched_at asc
          ),
          '[]'::jsonb
        ) as dispatch_events
        from public.dispatch_events de
        where de.order_id = p_order_id
      )
      select case
        when exists (
          select 1
          from order_core oc
          cross join lines_payload lp
          where lp.total_pending > 0
        ) then
          jsonb_build_object(
            'order', (
              select jsonb_build_object(
                'id', oc.id,
                'order_code', oc.order_code,
                'order_date', oc.order_date,
                'expected_dispatch_date', oc.expected_dispatch_date,
                'status', oc.status,
                'remarks', oc.remarks,
                'party_name', oc.party_name,
                'city', oc.city,
                'total_ordered', lp.total_ordered,
                'total_dispatched', lp.total_dispatched,
                'fulfillment_pct',
                  case
                    when lp.total_ordered > 0 then round((lp.total_dispatched / lp.total_ordered) * 100)::int
                    else 0
                  end
              )
              from order_core oc
              cross join lines_payload lp
            ),
            'lines', (select lp.lines from lines_payload lp),
            'logs', (select lg.logs from logs_payload lg),
            'dispatch_events', (select dp.dispatch_events from dispatch_payload dp)
          )
        else null
      end
    )
  end;
$$;

revoke all on function public.viewer_dispatch_orders() from public;
revoke all on function public.viewer_dispatch_orders() from anon;
grant execute on function public.viewer_dispatch_orders() to authenticated;

revoke all on function public.viewer_order_detail(uuid) from public;
revoke all on function public.viewer_order_detail(uuid) from anon;
grant execute on function public.viewer_order_detail(uuid) to authenticated;

grant usage on schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

grant select on public.user_profiles to authenticated;
grant select, insert, update, delete on public.orders to authenticated;
grant select, insert, update, delete on public.order_lines to authenticated;
grant select, insert, update, delete on public.order_logs to authenticated;
grant select, insert, update, delete on public.dispatch_events to authenticated;
grant select, insert, update, delete on public.items to authenticated;
grant select, insert, update, delete on public.parties to authenticated;

revoke all on public.allowed_users from anon;
revoke all on public.user_profiles from anon;
revoke all on public.orders from anon;
revoke all on public.order_lines from anon;
revoke all on public.order_logs from anon;
revoke all on public.dispatch_events from anon;
revoke all on public.items from anon;
revoke all on public.parties from anon;

alter table public.allowed_users enable row level security;
alter table public.user_profiles enable row level security;
alter table public.orders enable row level security;
alter table public.order_lines enable row level security;
alter table public.order_logs enable row level security;
alter table public.dispatch_events enable row level security;
alter table public.items enable row level security;
alter table public.parties enable row level security;

drop policy if exists user_profiles_select_self_or_admin on public.user_profiles;
create policy user_profiles_select_self_or_admin
on public.user_profiles
for select
to authenticated
using (auth.uid() = id or public.is_admin());

drop policy if exists orders_admin_all on public.orders;
create policy orders_admin_all
on public.orders
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists order_lines_admin_all on public.order_lines;
create policy order_lines_admin_all
on public.order_lines
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists order_logs_admin_all on public.order_logs;
create policy order_logs_admin_all
on public.order_logs
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists dispatch_events_admin_all on public.dispatch_events;
create policy dispatch_events_admin_all
on public.dispatch_events
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists items_admin_all on public.items;
create policy items_admin_all
on public.items
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists parties_admin_all on public.parties;
create policy parties_admin_all
on public.parties
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());
