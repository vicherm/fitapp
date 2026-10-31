# GymLog - Architecture

Version: 0.5
Status: Draft

Storage status: IndexedDB/Dexie is primary; Supabase provides authentication and explicitly synchronized server storage.

---

# 1. Application Style

GymLog is an offline-first Progressive Web App.

The application uses Supabase Auth with per-account IndexedDB/Dexie databases for normal data operations. Network access is required for sign-in, explicit Home Push/Pull synchronization, and explicitly requested Strava actions, not local reads or saves.

---

# 2. Runtime Model

The application is built to run on iPhone through Safari as an installed PWA.

The primary workflow is local and device-based:

- start workout
- read GPS location
- detect gym
- log sets locally
- explicitly Push changes to Supabase or Pull server data
- export data when needed

---

# 3. Location Workflow

When a workout starts, the app reads the current GPS position.

If a gym can be matched automatically, it is selected.

If no gym is detected, the user selects an existing gym or creates a new one from current coordinates.

---

# 4. Data Storage

All application data is stored primarily in IndexedDB through `src/db/local.ts`; `src/data/` preserves the screen-facing API and domain mappers. Allowed authentication activates a separate account database before rendering screens. Signing out closes access without erasing stored data.

JSON export remains available as a user-controlled backup and restore format.

Application records use client-generated UUIDs and local-only `sync_status`. Saves and deletes become pending. Local initialization is empty; there are no startup, save, timer, or reconnect replication triggers.

Application data records carry an `is_deleted` tombstone. User deletes mark records instead of physically removing them, and ordinary reads omit tombstoned records. Workout deletion propagates the tombstone to its child records so explicit synchronization can transmit deletions without losing their identifiers.

Temporary Home buttons call `src/data/sync.ts`, the only application-data replication entry point. Atomic Supabase RPCs provide timestamp-aware Push and consistent complete Pull snapshots. `src/db/sync.ts` compares `updated_at` (including server sub-millisecond precision); the server wins ties. Local merge/acknowledgement transactions preserve newer edits made during network requests. Invalid relationships or active unique-key collisions surface errors instead of partial success. Device clock accuracy is required.

Backups, restores and resets operate locally. Restore validates a complete replacement transaction and preserves outgoing tombstones. Strava remains server-side; upload and preview require synchronized local workout data and never implicitly Push. Automatic Strava uploads are deferred during the manual-only phase.
