begin;

create table public.sync_revisions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 0 check (revision >= 0)
);
alter table public.sync_revisions enable row level security;
revoke all on public.sync_revisions from public, anon, authenticated;

create or replace function public.track_sync_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
    raise exception 'Cannot change ownership of a synchronized record.';
  end if;
  -- The counter row stays locked until commit: later revisions cannot become
  -- visible before earlier ones, unlike a sequence or a client timestamp.
  insert into public.sync_revisions (user_id, revision) values (new.user_id, 1)
  on conflict (user_id) do update
    set revision = public.sync_revisions.revision + 1
  returning revision into new.server_revision;
  return new;
end;
$$;
revoke all on function public.track_sync_revision() from public, anon, authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'settings', 'body_part_groups', 'gyms', 'exercises',
    'workouts', 'workout_exercises', 'workout_sets'
  ] loop
    execute format('alter table public.%I add column server_revision bigint not null default 0', table_name);
    execute format('create index %I on public.%I (user_id, server_revision)', table_name || '_sync_revision_idx', table_name);
    execute format('create trigger track_sync_revision before insert or update on public.%I
      for each row execute function public.track_sync_revision()', table_name);
  end loop;
end;
$$;

create or replace function public.pull_local_changes(since_revision text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  current_revision bigint;
  since bigint;
  table_name text;
  rows jsonb;
  result jsonb := '{}'::jsonb;
begin
  if owner_id is null or not public.is_allowed_user() then
    raise exception 'Sign in to the allowed account before syncing.';
  end if;
  if since_revision is not null and since_revision !~ '^(0|[1-9][0-9]*)$' then
    raise exception 'Invalid Pull cursor.';
  end if;
  since := since_revision::bigint;
  select coalesce((select revision from public.sync_revisions where user_id = owner_id), 0)
    into current_revision;
  if since > current_revision then
    raise exception 'Pull cursor is ahead of the server. Clear the local Pull cursor and retry a full Pull.';
  end if;
  -- STABLE keeps the counter and all seven table reads in one MVCC snapshot.
  foreach table_name in array array[
    'settings', 'body_part_groups', 'gyms', 'exercises',
    'workouts', 'workout_exercises', 'workout_sets'
  ] loop
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(t) - ''server_revision''), ''[]''::jsonb)
       from public.%I t where user_id = $1 and ($2 is null or server_revision > $2)
         and server_revision <= $3', table_name
    ) into rows using owner_id, since, current_revision;
    result := result || jsonb_build_object(table_name, rows);
  end loop;
  return jsonb_build_object('cursor', current_revision::text, 'data', result);
end;
$$;
revoke all on function public.pull_local_changes(text) from public, anon;
grant execute on function public.pull_local_changes(text) to authenticated;

commit;
