create temporary table settings_id_map as
select id as old_id, gen_random_uuid() as new_id from public.settings;
create temporary table body_part_groups_id_map as
select id as old_id, gen_random_uuid() as new_id from public.body_part_groups;
create temporary table gyms_id_map as
select id as old_id, gen_random_uuid() as new_id from public.gyms;
create temporary table exercises_id_map as
select id as old_id, gen_random_uuid() as new_id from public.exercises;
create temporary table workouts_id_map as
select id as old_id, gen_random_uuid() as new_id from public.workouts;
create temporary table workout_exercises_id_map as
select id as old_id, gen_random_uuid() as new_id from public.workout_exercises;
create temporary table workout_sets_id_map as
select id as old_id, gen_random_uuid() as new_id from public.workout_sets;

alter table public.settings add column id_uuid uuid;
alter table public.body_part_groups add column id_uuid uuid;
alter table public.gyms add column id_uuid uuid;
alter table public.exercises add column id_uuid uuid, add column body_part_group_id_uuid uuid;
alter table public.workouts add column id_uuid uuid, add column gym_id_uuid uuid;
alter table public.workout_exercises
  add column id_uuid uuid,
  add column workout_id_uuid uuid,
  add column exercise_id_uuid uuid;
alter table public.workout_sets add column id_uuid uuid, add column workout_exercise_id_uuid uuid;
alter table public.workout_strava_links add column workout_id_uuid uuid;

update public.settings t set id_uuid = m.new_id from settings_id_map m where t.id = m.old_id;
update public.body_part_groups t set id_uuid = m.new_id from body_part_groups_id_map m where t.id = m.old_id;
update public.gyms t set id_uuid = m.new_id from gyms_id_map m where t.id = m.old_id;
update public.exercises t
set id_uuid = own.new_id, body_part_group_id_uuid = parent.new_id
from exercises_id_map own, body_part_groups_id_map parent
where t.id = own.old_id and t.body_part_group_id = parent.old_id;
update public.workouts t
set id_uuid = own.new_id from workouts_id_map own where t.id = own.old_id;
update public.workouts t
set gym_id_uuid = parent.new_id
from gyms_id_map parent
where t.gym_id = parent.old_id;
update public.workout_exercises t
set id_uuid = own.new_id, workout_id_uuid = workout.new_id, exercise_id_uuid = exercise.new_id
from workout_exercises_id_map own, workouts_id_map workout, exercises_id_map exercise
where t.id = own.old_id and t.workout_id = workout.old_id and t.exercise_id = exercise.old_id;
update public.workout_sets t
set id_uuid = own.new_id, workout_exercise_id_uuid = parent.new_id
from workout_sets_id_map own, workout_exercises_id_map parent
where t.id = own.old_id and t.workout_exercise_id = parent.old_id;
update public.workout_strava_links t
set workout_id_uuid = parent.new_id
from workouts_id_map parent
where t.workout_id = parent.old_id;

alter table public.exercises drop constraint exercises_body_part_group_id_user_id_fkey;
alter table public.workouts drop constraint workouts_gym_id_user_id_fkey;
alter table public.workout_exercises
  drop constraint workout_exercises_workout_id_user_id_fkey,
  drop constraint workout_exercises_exercise_id_user_id_fkey;
alter table public.workout_sets drop constraint workout_sets_workout_exercise_id_user_id_fkey;
alter table public.workout_strava_links drop constraint workout_strava_links_workout_id_user_id_fkey;

alter table public.settings drop constraint settings_pkey, drop constraint settings_id_user_id_key;
alter table public.body_part_groups drop constraint body_part_groups_pkey, drop constraint body_part_groups_id_user_id_key;
alter table public.gyms drop constraint gyms_pkey, drop constraint gyms_id_user_id_key;
alter table public.exercises drop constraint exercises_pkey, drop constraint exercises_id_user_id_key;
alter table public.workouts drop constraint workouts_pkey, drop constraint workouts_id_user_id_key;
alter table public.workout_exercises drop constraint workout_exercises_pkey, drop constraint workout_exercises_id_user_id_key;
alter table public.workout_sets drop constraint workout_sets_pkey, drop constraint workout_sets_id_user_id_key;

alter table public.settings drop column id;
alter table public.settings rename column id_uuid to id;
alter table public.body_part_groups drop column id;
alter table public.body_part_groups rename column id_uuid to id;
alter table public.gyms drop column id;
alter table public.gyms rename column id_uuid to id;
alter table public.exercises drop column id, drop column body_part_group_id;
alter table public.exercises rename column id_uuid to id;
alter table public.exercises rename column body_part_group_id_uuid to body_part_group_id;
alter table public.workouts drop column id, drop column gym_id;
alter table public.workouts rename column id_uuid to id;
alter table public.workouts rename column gym_id_uuid to gym_id;
alter table public.workout_exercises drop column id, drop column workout_id, drop column exercise_id;
alter table public.workout_exercises rename column id_uuid to id;
alter table public.workout_exercises rename column workout_id_uuid to workout_id;
alter table public.workout_exercises rename column exercise_id_uuid to exercise_id;
alter table public.workout_sets drop column id, drop column workout_exercise_id;
alter table public.workout_sets rename column id_uuid to id;
alter table public.workout_sets rename column workout_exercise_id_uuid to workout_exercise_id;
alter table public.workout_strava_links drop column workout_id;
alter table public.workout_strava_links rename column workout_id_uuid to workout_id;

alter table public.exercises alter column body_part_group_id set not null;
alter table public.workouts alter column gym_id drop not null;
alter table public.workout_exercises
  alter column workout_id set not null,
  alter column exercise_id set not null;
alter table public.workout_sets alter column workout_exercise_id set not null;
alter table public.workout_strava_links alter column workout_id set not null;

alter table public.settings alter column id set default gen_random_uuid();
alter table public.body_part_groups alter column id set default gen_random_uuid();
alter table public.gyms alter column id set default gen_random_uuid();
alter table public.exercises alter column id set default gen_random_uuid();
alter table public.workouts alter column id set default gen_random_uuid();
alter table public.workout_exercises alter column id set default gen_random_uuid();
alter table public.workout_sets alter column id set default gen_random_uuid();

alter table public.settings
  add constraint settings_pkey primary key (id),
  add constraint settings_id_user_id_key unique (id, user_id);
alter table public.body_part_groups
  add constraint body_part_groups_pkey primary key (id),
  add constraint body_part_groups_id_user_id_key unique (id, user_id);
alter table public.gyms
  add constraint gyms_pkey primary key (id),
  add constraint gyms_id_user_id_key unique (id, user_id);
alter table public.exercises
  add constraint exercises_pkey primary key (id),
  add constraint exercises_id_user_id_key unique (id, user_id),
  add constraint exercises_body_part_group_id_user_id_fkey
    foreign key (body_part_group_id, user_id)
    references public.body_part_groups(id, user_id)
    on delete restrict;
alter table public.workouts
  add constraint workouts_pkey primary key (id),
  add constraint workouts_id_user_id_key unique (id, user_id),
  add constraint workouts_gym_id_user_id_fkey
    foreign key (gym_id, user_id)
    references public.gyms(id, user_id)
    on delete set null (gym_id);
alter table public.workout_exercises
  add constraint workout_exercises_pkey primary key (id),
  add constraint workout_exercises_id_user_id_key unique (id, user_id),
  add constraint workout_exercises_workout_id_exercise_id_key unique (workout_id, exercise_id),
  add constraint workout_exercises_workout_id_exercise_order_key unique (workout_id, exercise_order),
  add constraint workout_exercises_workout_id_user_id_fkey
    foreign key (workout_id, user_id)
    references public.workouts(id, user_id)
    on delete cascade,
  add constraint workout_exercises_exercise_id_user_id_fkey
    foreign key (exercise_id, user_id)
    references public.exercises(id, user_id)
    on delete restrict;
alter table public.workout_sets
  add constraint workout_sets_pkey primary key (id),
  add constraint workout_sets_id_user_id_key unique (id, user_id),
  add constraint workout_sets_workout_exercise_id_set_number_key unique (workout_exercise_id, set_number),
  add constraint workout_sets_workout_exercise_id_user_id_fkey
    foreign key (workout_exercise_id, user_id)
    references public.workout_exercises(id, user_id)
    on delete cascade;
alter table public.workout_strava_links
  add constraint workout_strava_links_workout_id_key unique (workout_id),
  add constraint workout_strava_links_workout_id_user_id_fkey
    foreign key (workout_id, user_id)
    references public.workouts(id, user_id)
    on delete cascade;

create index exercises_body_part_group_idx on public.exercises (body_part_group_id);
create index workout_exercises_exercise_idx on public.workout_exercises (exercise_id);
create index workout_sets_performed_at_idx on public.workout_sets (workout_exercise_id, performed_at);

drop table settings_id_map;
drop table body_part_groups_id_map;
drop table gyms_id_map;
drop table exercises_id_map;
drop table workouts_id_map;
drop table workout_exercises_id_map;
drop table workout_sets_id_map;
