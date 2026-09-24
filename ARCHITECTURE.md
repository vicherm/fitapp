# GymLog - Architecture

Version: 0.3
Status: Draft

Supabase migration status: Google authentication and the remote schema foundation are defined, but application data access still uses Dexie until the repository migration is complete.

---

# 1. Application Style

GymLog is an offline-first Progressive Web App.

The application stores user data locally on the device and does not require a backend server.

Cloud synchronization may be added in the future.

The planned target architecture uses Supabase Auth and PostgreSQL as the sole application data store. IndexedDB and Dexie will be removed after all data-access paths and existing data are migrated.

---

# 2. Runtime Model

The application is built to run on iPhone through Safari as an installed PWA.

The primary workflow is local and device-based:

- start workout
- read GPS location
- detect gym
- log sets locally
- export data when needed

---

# 3. Location Workflow

When a workout starts, the app reads the current GPS position.

If a gym can be matched automatically, it is selected.

If no gym is detected, the user selects an existing gym or creates a new one from current coordinates.

---

# 4. Data Storage

All data is stored locally.

The app should work without network access for normal logging and history viewing.
