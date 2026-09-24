create or replace function public.is_allowed_user()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    lower(auth.jwt() ->> 'email') = 'miroslav.vicher@gmail.com'
    and auth.jwt() -> 'app_metadata' ->> 'provider' = 'google',
    false
  );
$$;

revoke execute on function public.is_allowed_user() from public, anon;
grant execute on function public.is_allowed_user() to authenticated;

drop policy "Users manage own settings" on public.settings;
drop policy "Users manage own body part groups" on public.body_part_groups;
drop policy "Users manage own gyms" on public.gyms;
drop policy "Users manage own exercises" on public.exercises;
drop policy "Users manage own workouts" on public.workouts;
drop policy "Users manage own workout exercises" on public.workout_exercises;
drop policy "Users manage own workout sets" on public.workout_sets;

create policy "Allowed user manages own settings"
on public.settings for all to authenticated
using ((select public.is_allowed_user()) and (select auth.uid()) = user_id)
with check ((select public.is_allowed_user()) and (select auth.uid()) = user_id);

create policy "Allowed user manages own body part groups"
on public.body_part_groups for all to authenticated
using ((select public.is_allowed_user()) and (select auth.uid()) = user_id)
with check ((select public.is_allowed_user()) and (select auth.uid()) = user_id);

create policy "Allowed user manages own gyms"
on public.gyms for all to authenticated
using ((select public.is_allowed_user()) and (select auth.uid()) = user_id)
with check ((select public.is_allowed_user()) and (select auth.uid()) = user_id);

create policy "Allowed user manages own exercises"
on public.exercises for all to authenticated
using ((select public.is_allowed_user()) and (select auth.uid()) = user_id)
with check ((select public.is_allowed_user()) and (select auth.uid()) = user_id);

create policy "Allowed user manages own workouts"
on public.workouts for all to authenticated
using ((select public.is_allowed_user()) and (select auth.uid()) = user_id)
with check ((select public.is_allowed_user()) and (select auth.uid()) = user_id);

create policy "Allowed user manages own workout exercises"
on public.workout_exercises for all to authenticated
using ((select public.is_allowed_user()) and (select auth.uid()) = user_id)
with check ((select public.is_allowed_user()) and (select auth.uid()) = user_id);

create policy "Allowed user manages own workout sets"
on public.workout_sets for all to authenticated
using ((select public.is_allowed_user()) and (select auth.uid()) = user_id)
with check ((select public.is_allowed_user()) and (select auth.uid()) = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if lower(coalesce(new.email, '')) = 'miroslav.vicher@gmail.com'
    and new.raw_app_meta_data ->> 'provider' = 'google' then
    insert into public.settings (user_id) values (new.id)
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;

insert into public.settings (user_id)
select id
from auth.users
where lower(coalesce(email, '')) = 'miroslav.vicher@gmail.com'
  and raw_app_meta_data ->> 'provider' = 'google'
on conflict (user_id) do nothing;