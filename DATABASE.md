# GymLog - Database Model

Version: 1.2
Status: Current implementation

This app uses IndexedDB through Dexie.js as its primary application store, with Supabase Auth and explicitly synchronized PostgreSQL storage protected by Row Level Security. Domain models remain in `src/db/types.ts`, while typed database access is defined in `src/lib/database.types.ts` and `src/data/`.

## Supabase schema

### Local storage and manual synchronization

`src/db/local.ts` defines seven application tables; Dexie schema version 2 adds a local `sync_metadata` store for the last successful Pull cursor. Each account uses a separate `gymlog-{userId}` database. Rows retain snake_case application fields, UUIDs, ownership, timestamps and `is_deleted`, plus local-only `sync_status: 'pending' | 'synced'`. Domain mappers expose dates and camelCase fields to screens. Local storage starts empty and is not automatically seeded or synchronized.

`src/db/sync.ts` merges full or incremental explicit Pull snapshots and acknowledges explicit Push batches. Newer `updated_at` wins for the same ID, including tombstones; ties favor the server. Newer in-flight local edits and rows absent from a Pull are retained. Active unique keys and same-account relationships are validated transactionally, including local cascading workout deletion.

Apply `supabase/migrations/202610310009_manual_local_sync.sql` after the UUID and `is_deleted` migrations. It adds authenticated, security-invoker `push_local_changes(changes jsonb)` and `pull_local_snapshot()` RPCs. Push uses a per-owner transaction lock, timestamp-aware upserts and dependency ordering, preserving client timestamps and bypassing implicit cascades only during the batch. Pull is a stable function returning all seven tables in one consistent JSON snapshot, including more than 1,000 rows and tombstones. Neither RPC stores `sync_status`. Unique-key or deletion/relationship conflicts abort the batch and are reported.

Reset and restore are local transactions. Existing rows are tombstoned instead of physically cleared, imported UUIDs are preserved (legacy IDs remapped), and imported rows become pending with fresh timestamps. Portable backups remain schema version 3 without synchronization metadata. Authentication and explicit Strava integration remain remote; automatic Strava upload on workout auto-close is disabled.

Apply `supabase/migrations/202610310010_incremental_pull.sql` after `202610310009`. Each replicated server table gains an indexed `server_revision bigint`, initially zero for pre-existing rows. Insert/update triggers allocate revisions from a private `sync_revisions` counter per user, whose row lock is held until commit. The counter and row updates roll back together; revisions are independent of client clocks and cannot commit out of order.

`pull_local_changes(since_revision text default null)` returns `{ cursor: string, data: { ...seven tables } }`. Null requests a full snapshot; otherwise only rows with newer server revisions are returned, including tombstones. The stable function uses one MVCC snapshot and explicit allowed-account/ownership checks; it is security-definer to read the private counter. Counter access and trigger-function execution are revoked from clients. Revision fields are excluded from incremental responses/local rows.

Dexie persists `sync_metadata` key `pull_cursor` in the same transaction as the validated merge. Empty successful Pulls also save the cursor. Failures retain the previous cursor; Push, reset, restore and exports do not change it. Existing version 1 local databases upgrade without losing rows and initially have no cursor. Backups stay at version 3 and omit cursors. The older full-snapshot RPC remains available for compatibility.

The PostgreSQL schema is defined in `supabase/migrations/202609230001_initial_schema.sql`. `supabase/migrations/202610310007_client_generated_uuid_ids.sql` migrates application record IDs and their foreign keys to UUIDs while preserving existing relationships. `supabase/migrations/202610310008_add_is_deleted.sql` adds tombstone flags to application data and propagates workout and workout-exercise deletion to child records. The client generates UUIDs and initializes tombstones before inserting application records; database defaults remain for rows created by server-side triggers. Normal application reads hide tombstoned records, while backup export includes them. Every table has authenticated ownership, same-user relationships are enforced with composite foreign keys, and Row Level Security is enabled. `supabase/migrations/202609230002_restrict_to_google_user.sql` restricts every policy to the configured Google identity. All application screens use the local data-access layer.

The Supabase TypeScript contract is in `src/lib/database.types.ts` and is wired into the shared Supabase client. Regenerate it with the Supabase CLI after schema changes using `supabase gen types typescript --project-id dhxckgfuapniettrohvo --schema public` with an authenticated Supabase access token.

The one-time JSON migration is implemented in `scripts/import-supabase-json.mjs`. It uses the Supabase service-role key only in Node, resolves the allowed Auth user by email, refuses to overwrite existing non-settings rows, remaps old numeric IDs, and imports records in dependency order. Application backups export schema version 3 with UUID identifiers and deletion flags; the in-app restore continues to accept schema versions 1 and 2.

Strava integration tables are defined in `supabase/migrations/202609240003_strava_tables.sql`. `strava_connections` is server-only and stores OAuth tokens for Edge Functions; `strava_activities` is readable by the owner and uses `(user_id, strava_activity_id)` for idempotent imports.

Workout upload deduplication is defined in `supabase/migrations/202609240004_workout_strava_links.sql` through the `workout_strava_links` table.

`supabase/migrations/202610060005_strava_upload_reservations.sql` makes `strava_activity_id` nullable and adds `strava_upload_id`. A unique workout link is reserved before creating the remote upload. A saved upload ID allows subsequent requests to resume polling without re-uploading. A reservation without either ID blocks retries until the remote outcome has been verified.

---

# 1. Settings

Stores application-wide preferences.

Fields

- id: string (UUID)
- isDeleted: boolean
- gymDetectionRadius: number
  - Units: metres
  - Default: 200
- theme: 'dark'

Notes

- Supabase seeds a default row for a new account; local storage remains empty until Pull or an explicit settings save:
  - `{ gymDetectionRadius: 200, theme: 'dark' }`
- Supabase table: `settings`
- Local indexes: `id, sync_status`

---

# 2. Body Part Group

Represents a user-defined exercise category.

Fields

- id: string (UUID)
- isDeleted: boolean
- name: string

Notes

- Supabase table: `body_part_groups`
- Local indexes: `id, sync_status`; active names are validated as unique.

Example

- Back
- Biceps

---

# 3. Exercise

Represents an exercise template that can be reused across workouts.

Fields

- id: string (UUID)
- isDeleted: boolean
- name: string
- bodyPartGroupId: string (UUID)
- machine: boolean
- notes?: string

Notes

- Legacy backups without `machine` restore it as `false`.
- Supabase table: `exercises`
- Local indexes: `id, body_part_group_id, sync_status`; active names are validated as unique.

Example

- Name: Deadlift
- bodyPartGroupId: Back
- machine: false
- notes: optional workout notes or technique reminders

---

# 4. Gym

Represents a training location.

Fields

- id: string (UUID)
- isDeleted: boolean
- name: string
- abbreviation: string
- latitude: number
- longitude: number

Notes

- Abbreviation is required when creating or restoring a gym.
- Supabase table: `gyms`
- Local indexes: `id, sync_status`; active names and abbreviations are validated as unique.

Example

- name: Factory Prague
- abbreviation: FAC
- latitude: 50.087
- longitude: 14.420

---

# 5. Workout

Represents a single training session.

Fields

- id: string (UUID)
- isDeleted: boolean
- gymId?: string (UUID)
- startTime: Date
- endTime?: Date

Notes

- `gymId` is optional.
- `endTime` may be null/undefined until the workout is finished.
- Supabase table: `workouts`
- Local indexes: `id, gym_id, start_time, sync_status`

Derived values are not stored as DB fields; they are computed in application logic when needed.

---

# 6. Workout Exercise

Represents one exercise performed within a workout, including the order in which it was added.

Fields

- id: string (UUID)
- isDeleted: boolean
- workoutId: string (UUID)
- exerciseId: string (UUID)
- order: number

Notes

- Supabase table: `workout_exercises`
- Local indexes: `id, workout_id, exercise_id, sync_status`; active exercise/order pairs are validated as unique.
- There is cleanup logic to delete empty workout exercises that have no sets, and delete the parent workout if it ends up empty.

---

# 7. Workout Set

Represents a single set within a workout exercise.

Fields

- id: string (UUID)
- isDeleted: boolean
- workoutExerciseId: string (UUID)
- setNumber: number
- weight: number
- reps: number
- timestamp: Date

Notes

- Supabase table: `workout_sets`
- Local indexes: `id, workout_exercise_id, performed_at, sync_status`; active set numbers are validated as unique.

---

# 8. Database versioning and upgrades

Local Dexie schema version 2 is separate from server migration numbering and portable backup versions. It preserves the seven version 1 tables and adds local cursor metadata; it does not import server data on upgrade/open.

Server changes are applied in filename order from `supabase/migrations/`. The UUID migration is `202610310007`, tombstones are `202610310008`, manual synchronization RPCs are `202610310009`, and incremental Pull is `202610310010`. These migrations must be applied before using the corresponding frontend features.

Portable JSON backups use schema version 3. Restore accepts versions 1–3; version 1 numeric identifiers are remapped to UUIDs. Empty workout cleanup preserves tombstones for backup and explicit synchronization instead of physically erasing identifiers.
