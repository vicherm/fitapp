# GymLog - Product Specification

Version: 2.7
Last Updated: 2026-08-05
Status: Draft
Target Platform: Progressive Web App (PWA)
Primary User: Personal use (single user)

---

# 1. Vision

GymLog is a lightweight personal workout logging application optimized for strength training.

The application replaces HeavySet and is tailored specifically for the owner's training style rather than attempting to satisfy a broad audience.

The application must be:

- offline-first
- installable as an iPhone PWA
- developed entirely on Windows
- require no backend server
- support deployment from a URL subpath (for example `/fitapp/`) so routes and static assets resolve correctly outside domain root
- include valid PWA manifest icon references that resolve to files shipped in the production build
- use the GymLog branded application icon across install surfaces (manifest icons, maskable icons, Apple touch icon, and favicon)
- use a consistent dark graphite + orange accent visual theme across screens that matches GymLog branding

All user data is stored locally on the device.

Cloud synchronization may be added in the future.

---

# 2. Goals

Primary goals

- Log workouts quickly
- Minimize typing
- Track long-term progress
- Automatically detect gym location
- Export all data to Excel / CSV
- Keep complete ownership of all data

Non-goals

- Social features
- User accounts
- Sharing workouts
- Public leaderboards
- Subscription model
- Advertisement
- Online backend

---

# 3. Core Concepts

The application stores six primary entities plus application settings.

- Exercise
- Body Part Group
- Gym
- Workout
- Workout Exercise
- Workout Set
- Settings

---

# 4. Main Workflow

The primary workflow of the application is

Start Workout

↓

Active Workout

↓

Select Exercise

↓

Log Sets

↓

Select Exercise

↓

Log Sets

↓

Finish Workout

Note: workouts that remain open past midnight are automatically considered finished.

Almost the entire workout should be performed from the Active Workout screen.

---

# 5. Main Screens

## Home

The Home screen displays the GymLog logo and simple navigation buttons.

The user can navigate from Home to:

- Active Workout
- Body Part Groups
- Exercise Editor (new exercise)

Home also provides data backup actions:

- Export all local data to a JSON backup file
- Import all local data from a JSON backup file (replaces local data)

Route behavior:

- Active Workout remains the default route (`/`)
- Home is available at a separate route (`/home`)

## Active Workout (Primary Screen)

The Active Workout screen is the central screen of the application.

The user should be able to log an entire workout with minimal navigation.

Any workout left open from a previous calendar day is automatically considered finished.

The Active Workout screen does not include a manual Finish Workout button.

The screen includes a direct Home link.

When an exercise is selected, the screen provides access to Exercise History.

The input area is compact:

- `kg` and `reps` labels are small text above their values
- LOG action is placed next to the input fields
- Numeric keypad uses full available width

When navigating away from Active Workout and returning within the same open workout, the in-progress state is restored (selected exercise, active field, and entered weight/reps values), including Home -> Active navigation.

The screen contains the following elements.

### Exercise

Displays the currently selected exercise.

If no exercise is selected, tapping the exercise name opens the Exercise Selection screen.

The user can change the current exercise by tapping its name.

After selecting an exercise, the selection is immediately transferred back to Active Workout and becomes the current exercise.

---

### Weight

Numeric input field for the current set weight.

The value is pre-filled using the previous set of the same exercise whenever available.

When the field is selected, its value is cleared so the user can enter a fresh value quickly.

---

### Repetitions

Numeric input field for the number of repetitions.

The value is pre-filled using the previous set of the same exercise whenever available.

When the field is selected, its value is cleared so the user can enter a fresh value quickly.

---

### Log Button

Stores the entered set.

After logging

- the set is added to the current workout
- the history is immediately updated
- the screen remains ready for entering the next set

---

### Numeric Keypad

A large on-screen numeric keypad is displayed while entering weight or repetitions.

The keypad is optimized for one-handed operation.

Hardware keyboard input is also supported for fast entry.

Supported keys

- `0` to `9`
- `Backspace` and `Delete`
- `.` or `,` for decimal weight input
- `Enter` to log set

---

### Exercise History

Displays previous sets for the selected exercise.

History is shown in three side-by-side columns:

- Current workout
- Previous workout 1
- Previous workout 2
- All three columns fit within page width without horizontal scrolling

Previous workout columns are titled by workout date in `YYYY-MM-DD` format.

Set entries (`weight × reps`) use larger text for readability while preserving compact title typography.

#### Current Workout

Shows all sets already logged during the current workout.

Example

115 × 5

115 × 5

110 × 6

#### Previous Workouts

Shows sets from the two most recent previous workouts containing the same exercise.

Example

112.5 × 5

112.5 × 5

112.5 × 5

The history is read-only and serves as a reference while logging new sets.

---

## Exercise Selection

Search box

Recent exercises

All exercises

---

## Exercise History

The Exercise History screen is opened from Active Workout for the currently selected exercise.

Top section:

- exercise name is used as the page title
- exercise name is editable inline
- body part group is shown and editable inline
- exercise note is shown and editable inline

The screen lists all sets for that exercise, including the current workout, grouped by workout.

For each set, one row displays:

- `kg × reps`
- set time (`HH:MM`)

`kg × reps` and time are shown on the same row.

Set editing:

- rows are initially shown in read-only mode
- tapping a row switches only that row to editing mode
- `kg` and `reps` are editable inline in editing mode
- when edit mode opens, focus starts in the `kg` input
- changes are saved automatically (no explicit Save button)
- a set can be deleted directly from the row

Workouts are ordered with the most recent on top.

---

## Exercise Editor

Used to create and edit exercises.

Fields

- name
- body part group
- notes

The exercise editor allows the user to assign an exercise to a body part group.

The editor also provides quick navigation to body part group management.

---

## Body Part Groups

Used to create and edit body part groups.

The user can:

- create a new body part group
- rename an existing body part group
- delete a body part group when it is no longer used by any exercise

Validation rules

- group name is required
- group name must be unique (case-insensitive)

---

## Settings

Application settings

- Global gym detection radius
- Theme

Gyms

Import

Export

Backup

Restore

---

# 6. Gym Detection

Application requests GPS permission.

When a workout starts

Read current location.

For every configured gym

calculate distance.

If distance <= configured global radius

select nearest gym automatically.

Otherwise

Gym = Unknown.

User can

- choose existing gym
- create a new gym using current location

---

# 7. Progress Tracking

For every exercise

Show

- Maximum weight
- Estimated 1RM
- Graph

---

# 8. Export

CSV

One row per workout set.

Details to be finalized.

XLSX

Workbook contains sheets

- Exercises
- Body Part Groups
- Gyms
- Workouts
- Workout Exercises
- Workout Sets
- Statistics

JSON Backup

- Exports all local tables (settings, exercises, body part groups, gyms, workouts, workout exercises, workout sets)
- Importing a JSON backup replaces all current local data

CSV Migration Tooling

- A CLI conversion script is provided to transform HeavySet CSV exports into GymLog JSON backup format for import
- Encoded exercise prefixes (for example `LEG`, `BIC`) are mapped to body part groups during conversion
