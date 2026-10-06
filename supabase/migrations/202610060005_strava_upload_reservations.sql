alter table public.workout_strava_links
  alter column strava_activity_id drop not null,
  add column strava_upload_id text;