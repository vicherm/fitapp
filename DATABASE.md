# GymLog - Database Model

Version: 0.5
Status: Current implementation

This app uses Dexie on top of IndexedDB. The database name is `GymLog`, and the schema is defined in `src/db/db.ts` with TypeScript models in `src/db/types.ts`.

## Supabase migration foundation

The target PostgreSQL schema is defined in `supabase/migrations/202609230001_initial_schema.sql`. It preserves numeric identifiers for data migration, adds authenticated ownership to every table, enforces same-user relationships with composite foreign keys, and enables Row Level Security. `supabase/migrations/202609230002_restrict_to_google_user.sql` restricts every policy to the configured Google identity. The application continues to use Dexie until its data-access layer is migrated.

The Supabase TypeScript contract is in `src/lib/database.types.ts` and is wired into the shared Supabase client. Regenerate it with the Supabase CLI after schema changes using `supabase gen types typescript --project-id dhxckgfuapniettrohvo --schema public` with an authenticated Supabase access token.

---

# 1. Settings

Stores application-wide preferences.

Fields

- id?: number
- gymDetectionRadius: number
  - Units: metres
  - Default: 200
- theme: 'dark'

Notes

- The database seeds a default row on first populate:
  - `{ gymDetectionRadius: 200, theme: 'dark' }`
- Dexie store: `settings`
- Indexes: `++id`

---

# 2. Body Part Group

Represents a user-defined exercise category.

Fields

- id?: number
- name: string

Notes

- Dexie store: `bodyPartGroups`
- Indexes: `++id, name`

Example

- Back
- Biceps

---

# 3. Exercise

Represents an exercise template that can be reused across workouts.

Fields

- id?: number
- name: string
- bodyPartGroupId: number
- machine: boolean
- notes?: string

Notes

- `machine` was added in database version 3 and defaults to `false` for existing rows during upgrade.
- Dexie store: `exercises`
- Indexes: `++id, name, bodyPartGroupId`

Example

- Name: Deadlift
- bodyPartGroupId: Back
- machine: false
- notes: optional workout notes or technique reminders

---

# 4. Gym

Represents a training location.

Fields

- id?: number
- name: string
- abbreviation: string
- latitude: number
- longitude: number

Notes

- `abbreviation` was added in database version 2.
- Existing gyms are upgraded by generating a value from the name when missing.
- Dexie store: `gyms`
- Indexes: `++id, name, abbreviation`

Example

- name: Factory Prague
- abbreviation: FAC
- latitude: 50.087
- longitude: 14.420

---

# 5. Workout

Represents a single training session.

Fields

- id?: number
- gymId?: number
- startTime: Date
- endTime?: Date

Notes

- `gymId` is optional.
- `endTime` may be null/undefined until the workout is finished.
- Dexie store: `workouts`
- Indexes: `++id, gymId, startTime`

Derived values are not stored as DB fields; they are computed in application logic when needed.

---

# 6. Workout Exercise

Represents one exercise performed within a workout, including the order in which it was added.

Fields

- id?: number
- workoutId: number
- exerciseId: number
- order: number

Notes

- Dexie store: `workoutExercises`
- Indexes: `++id, workoutId, exerciseId, order`
- There is cleanup logic to delete empty workout exercises that have no sets, and delete the parent workout if it ends up empty.

---

# 7. Workout Set

Represents a single set within a workout exercise.

Fields

- id?: number
- workoutExerciseId: number
- setNumber: number
- weight: number
- reps: number
- timestamp: Date

Notes

- Dexie store: `workoutSets`
- Indexes: `++id, workoutExerciseId, timestamp`

---

# 8. Database versioning and upgrades

The schema has evolved across Dexie versions.

- Version 1
  - Initial schema.
  - `settings`, `bodyPartGroups`, `exercises`, `gyms`, `workouts`, `workoutExercises`, `workoutSets`
- Version 2
  - Added `gyms.abbreviation`
  - Backfills an abbreviation from the gym name when missing.
- Version 3
  - Added `exercises.machine`
  - Backfills `machine` as `false` for old records.

The implementation also includes a cleanup hook, `removeEmptyWorkoutExercises`, which removes orphaned workout exercises and empty workouts after data maintenance.
