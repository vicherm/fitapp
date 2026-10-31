create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('gymlog.manual_sync', true) is distinct from 'on' then
    new.updated_at = now();
  end if;
  return new;
end;
$$;

create or replace function public.soft_delete_workout_children()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_deleted and not old.is_deleted
    and current_setting('gymlog.manual_sync', true) is distinct from 'on' then
    update public.workout_exercises set is_deleted = true
    where workout_id = new.id and not is_deleted;
  end if;
  return new;
end;
$$;

create or replace function public.soft_delete_workout_exercise_sets()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_deleted and not old.is_deleted
    and current_setting('gymlog.manual_sync', true) is distinct from 'on' then
    update public.workout_sets set is_deleted = true
    where workout_exercise_id = new.id and not is_deleted;
  end if;
  return new;
end;
$$;

create or replace function public.pull_local_snapshot()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  table_name text;
  rows jsonb;
  result jsonb := '{}'::jsonb;
begin
  if auth.uid() is null or not public.is_allowed_user() then
    raise exception 'Sign in to the allowed account before syncing.';
  end if;
  foreach table_name in array array[
    'settings', 'body_part_groups', 'gyms', 'exercises',
    'workouts', 'workout_exercises', 'workout_sets'
  ] loop
    execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from public.%I t where user_id = $1', table_name)
      into rows using auth.uid();
    result := result || jsonb_build_object(table_name, rows);
  end loop;
  return result;
end;
$$;

create or replace function public.push_local_changes(changes jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  table_name text;
  item jsonb;
  assignments text;
  stored jsonb;
  result jsonb := '{}'::jsonb;
  deleted_pass boolean;
  previous_sync_setting text := current_setting('gymlog.manual_sync', true);
begin
  if auth.uid() is null or not public.is_allowed_user() then
    raise exception 'Sign in to the allowed account before syncing.';
  end if;
  if jsonb_typeof(changes) is distinct from 'object' then
    raise exception 'Invalid sync payload.';
  end if;
  -- Serialize manual pushes for this owner, including requests from other devices.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  perform set_config('gymlog.manual_sync', 'on', true);
  foreach table_name in array array[
    'settings', 'body_part_groups', 'gyms', 'exercises',
    'workouts', 'workout_exercises', 'workout_sets'
  ] loop
    if jsonb_typeof(changes -> table_name) is distinct from 'array' then
      raise exception 'Missing or invalid sync table: %', table_name;
    end if;
    result := result || jsonb_build_object(table_name, '[]'::jsonb);
    for item in select value from jsonb_array_elements(changes -> table_name) loop
      if (item ->> 'user_id')::uuid is distinct from auth.uid()
        or item ->> 'id' is null or item ->> 'created_at' is null
        or item ->> 'updated_at' is null or jsonb_typeof(item -> 'is_deleted') is distinct from 'boolean' then
        raise exception 'Invalid ownership or metadata in %.', table_name;
      end if;
      execute format('select to_jsonb(t) from public.%I t where id = $1', table_name)
        into stored using (item ->> 'id')::uuid;
      if stored is not null and (stored ->> 'user_id')::uuid <> auth.uid() then
        raise exception 'Record belongs to another account.';
      end if;
    end loop;
  end loop;
  -- Temporarily release active unique keys for every changed row. The final
  -- dependency-ordered pass restores active rows and applies complete tombstones.
  foreach deleted_pass in array array[true, false] loop
    foreach table_name in array array[
      'settings', 'body_part_groups', 'gyms', 'exercises',
      'workouts', 'workout_exercises', 'workout_sets'
    ] loop
      select string_agg(format('%I = excluded.%I', attname, attname), ', ')
      into assignments
      from pg_attribute
      where attrelid = format('public.%I', table_name)::regclass
        and attnum > 0 and not attisdropped and attname not in ('id', 'user_id', 'created_at');
      for item in select value from jsonb_array_elements(changes -> table_name) loop
        if deleted_pass then
          execute format(
            'update public.%1$I set is_deleted = true
             where id = ($1 ->> ''id'')::uuid and user_id = $2
               and updated_at < ($1 ->> ''updated_at'')::timestamptz', table_name
          ) using item, auth.uid();
        else
          execute format(
            'insert into public.%1$I as existing select (jsonb_populate_record(null::public.%1$I, $1)).*
             on conflict (id) do update set %2$s
             where existing.user_id = excluded.user_id and excluded.updated_at > existing.updated_at',
            table_name, assignments
          ) using item;
        end if;
      end loop;
    end loop;
  end loop;
  if exists (
    select 1 from public.exercises e join public.body_part_groups g on g.id = e.body_part_group_id
    where e.user_id = auth.uid() and not e.is_deleted and g.is_deleted
  ) or exists (
    select 1 from public.workout_exercises e join public.workouts w on w.id = e.workout_id
    where e.user_id = auth.uid() and not e.is_deleted and w.is_deleted
  ) or exists (
    select 1 from public.workout_sets s join public.workout_exercises e on e.id = s.workout_exercise_id
    where s.user_id = auth.uid() and not s.is_deleted and e.is_deleted
  ) then
    raise exception 'Conflicting parent and child deletions. Pull and resolve the conflict before pushing.';
  end if;
  foreach table_name in array array[
    'settings', 'body_part_groups', 'gyms', 'exercises',
    'workouts', 'workout_exercises', 'workout_sets'
  ] loop
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from public.%I t
       where user_id = $1 and id in (select (value ->> ''id'')::uuid from jsonb_array_elements($2))', table_name
    ) into stored using auth.uid(), changes -> table_name;
    result := result || jsonb_build_object(table_name, stored);
  end loop;
  perform set_config('gymlog.manual_sync', coalesce(previous_sync_setting, ''), true);
  return result;
end;
$$;

revoke all on function public.pull_local_snapshot() from public, anon;
revoke all on function public.push_local_changes(jsonb) from public, anon;
grant execute on function public.pull_local_snapshot() to authenticated;
grant execute on function public.push_local_changes(jsonb) to authenticated;
