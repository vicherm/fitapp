alter table public.settings
  add column sync_cooldown_seconds integer not null default 3600
  check (sync_cooldown_seconds >= 0);
