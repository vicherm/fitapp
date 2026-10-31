alter table public.settings add column is_deleted boolean not null default false;
alter table public.body_part_groups add column is_deleted boolean not null default false;
alter table public.gyms add column is_deleted boolean not null default false;
alter table public.exercises add column is_deleted boolean not null default false;
alter table public.workouts add column is_deleted boolean not null default false;
alter table public.workout_exercises add column is_deleted boolean not null default false;
alter table public.workout_sets add column is_deleted boolean not null default false;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.settings (user_id) values (new.id)
  on conflict do nothing;
  return new;
end;
$$;

alter table public.settings drop constraint settings_user_id_key;
create unique index settings_active_user_id_idx on public.settings (user_id) where not is_deleted;

drop index public.body_part_groups_user_name_idx;
create unique index body_part_groups_user_name_idx
  on public.body_part_groups (user_id, lower(name))
  where not is_deleted;

drop index public.gyms_user_name_idx;
create unique index gyms_user_name_idx on public.gyms (user_id, lower(name)) where not is_deleted;
drop index public.gyms_user_abbreviation_idx;
create unique index gyms_user_abbreviation_idx
  on public.gyms (user_id, lower(abbreviation))
  where not is_deleted;

drop index public.exercises_user_name_idx;
create unique index exercises_user_name_idx
  on public.exercises (user_id, lower(name))
  where not is_deleted;

alter table public.workout_exercises
  drop constraint workout_exercises_workout_id_exercise_id_key,
  drop constraint workout_exercises_workout_id_exercise_order_key;
create unique index workout_exercises_active_workout_exercise_idx
  on public.workout_exercises (workout_id, exercise_id)
  where not is_deleted;
create unique index workout_exercises_active_workout_order_idx
  on public.workout_exercises (workout_id, exercise_order)
  where not is_deleted;

alter table public.workout_sets drop constraint workout_sets_workout_exercise_id_set_number_key;
create unique index workout_sets_active_exercise_set_number_idx
  on public.workout_sets (workout_exercise_id, set_number)
  where not is_deleted;

create or replace function public.soft_delete_workout_children()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_deleted and not old.is_deleted then
    update public.workout_exercises
    set is_deleted = true
    where workout_id = new.id and not is_deleted;
  end if;
  return new;
end;
$$;

create trigger workouts_soft_delete_children
after update of is_deleted on public.workouts
for each row execute function public.soft_delete_workout_children();

create or replace function public.soft_delete_workout_exercise_sets()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_deleted and not old.is_deleted then
    update public.workout_sets
    set is_deleted = true
    where workout_exercise_id = new.id and not is_deleted;
  end if;
  return new;
end;
$$;

create trigger workout_exercises_soft_delete_sets
after update of is_deleted on public.workout_exercises
for each row execute function public.soft_delete_workout_exercise_sets();
