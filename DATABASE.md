# GymLog - Database Model

Version: 0.9
Status: Current implementation

This app uses Supabase PostgreSQL with Supabase Auth and Row Level Security. Domain models remain in `src/db/types.ts`, while typed database access is defined in `src/lib/database.types.ts` and `src/data/`.

## Supabase schema

The PostgreSQL schema is defined in `supabase/migrations/202609230001_initial_schema.sql`. `supabase/migrations/202610310007_client_generated_uuid_ids.sql` migrates application record IDs and their foreign keys to UUIDs while preserving existing relationships. The client generates UUIDs before inserting application records so identifiers are available independently of a server response; database defaults remain for rows created by server-side triggers. Every table has authenticated ownership, same-user relationships are enforced with composite foreign keys, and Row Level Security is enabled. `supabase/migrations/202609230002_restrict_to_google_user.sql` restricts every policy to the configured Google identity. All application screens use the Supabase data-access layer.

The Supabase TypeScript contract is in `src/lib/database.types.ts` and is wired into the shared Supabase client. Regenerate it with the Supabase CLI after schema changes using `supabase gen types typescript --project-id dhxckgfuapniettrohvo --schema public` with an authenticated Supabase access token.

The one-time JSON migration is implemented in `scripts/import-supabase-json.mjs`. It uses the Supabase service-role key only in Node, resolves the allowed Auth user by email, refuses to overwrite existing non-settings rows, remaps old numeric IDs, and imports records in dependency order. Application backups export schema version 2 with UUID identifiers; the in-app restore continues to accept schema version 1 backups.

Strava integration tables are defined in `supabase/migrations/202609240003_strava_tables.sql`. `strava_connections` is server-only and stores OAuth tokens for Edge Functions; `strava_activities` is readable by the owner and uses `(user_id, strava_activity_id)` for idempotent imports.

Workout upload deduplication is defined in `supabase/migrations/202609240004_workout_strava_links.sql` through the `workout_strava_links` table.

`supabase/migrations/202610060005_strava_upload_reservations.sql` makes `strava_activity_id` nullable and adds `strava_upload_id`. A unique workout link is reserved before creating the remote upload. A saved upload ID allows subsequent requests to resume polling without re-uploading. A reservation without either ID blocks retries until the remote outcome has been verified.

---

# 1. Settings

Stores application-wide preferences.

Fields

- id: string (UUID)
- gymDetectionRadius: number
  - Units: metres
  - Default: 200
- theme: 'dark'

Notes

- The database seeds a default row on first populate:
  - `{ gymDetectionRadius: 200, theme: 'dark' }`
- Supabase table: `settings`
- Indexes: `id`

---

# 2. Body Part Group

Represents a user-defined exercise category.

Fields

- id: string (UUID)
- name: string

Notes

- Supabase table: `body_part_groups`
- Indexes: `id, name`

Example

- Back
- Biceps

---

# 3. Exercise

Represents an exercise template that can be reused across workouts.

Fields

- id: string (UUID)
- name: string
- bodyPartGroupId: string (UUID)
- machine: boolean
- notes?: string

Notes

- `machine` was added in database version 3 and defaults to `false` for existing rows during upgrade.
- Supabase table: `exercises`
- Indexes: `id, name, bodyPartGroupId`

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
- name: string
- abbreviation: string
- latitude: number
- longitude: number

Notes

- `abbreviation` was added in database version 2.
- Existing gyms are upgraded by generating a value from the name when missing.
- Supabase table: `gyms`
- Indexes: `id, name, abbreviation`

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
- gymId?: string (UUID)
- startTime: Date
- endTime?: Date

Notes

- `gymId` is optional.
- `endTime` may be null/undefined until the workout is finished.
- Supabase table: `workouts`
- Indexes: `id, gymId, startTime`

Derived values are not stored as DB fields; they are computed in application logic when needed.

---

# 6. Workout Exercise

Represents one exercise performed within a workout, including the order in which it was added.

Fields

- id: string (UUID)
- workoutId: string (UUID)
- exerciseId: string (UUID)
- order: number

Notes

- Supabase table: `workout_exercises`
- Indexes: `id, workoutId, exerciseId, order`
- There is cleanup logic to delete empty workout exercises that have no sets, and delete the parent workout if it ends up empty.

---

# 7. Workout Set

Represents a single set within a workout exercise.

Fields

- id: string (UUID)
- workoutExerciseId: string (UUID)
- setNumber: number
- weight: number
- reps: number
- timestamp: Date

Notes

- Supabase table: `workout_sets`
- Indexes: `id, workoutExerciseId, timestamp`

---

# 8. Database versioning and upgrades

The schema has evolved through Supabase migrations.

- Version 1
  - Initial schema.
  - `settings`, `bodyPartGroups`, `exercises`, `gyms`, `workouts`, `workoutExercises`, `workoutSets`
- Version 2
  - Added `gyms.abbreviation`
  - Backfills an abbreviation from the gym name when missing.
- Version 3
  - Added `exercises.machine`
  - Backfills `machine` as `false` for old records.
- Version 4
  - Migrated application record IDs and foreign keys from numeric values to UUIDs.
  - New application records receive their UUID from the client before insertion.

The implementation also includes a cleanup hook, `removeEmptyWorkoutExercises`, which removes orphaned workout exercises and empty workouts after data maintenance.
