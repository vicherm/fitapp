# GymLog - Architecture

Version: 0.4
Status: Draft

Supabase migration status: Google authentication and PostgreSQL are the runtime data platform.

---

# 1. Application Style

GymLog is an offline-first Progressive Web App.

The application uses Supabase Auth and PostgreSQL as its source of truth. Network access is required for normal data operations.

---

# 2. Runtime Model

The application is built to run on iPhone through Safari as an installed PWA.

The primary workflow is local and device-based:

- start workout
- read GPS location
- detect gym
- log sets to Supabase
- export data when needed

---

# 3. Location Workflow

When a workout starts, the app reads the current GPS position.

If a gym can be matched automatically, it is selected.

If no gym is detected, the user selects an existing gym or creates a new one from current coordinates.

---

# 4. Data Storage

All application data is stored in Supabase PostgreSQL and protected by authenticated Row Level Security.

JSON export remains available as a user-controlled backup and restore format.
