# GymLog - Product Specification

Version: 3.62
Last Updated: 2026-09-10
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
- Keep complete ownership of all data

Non-goals

- Social features
- User accounts
- Sharing workouts
- Public leaderboards
- Advertisement
- Online backend

---

# 3. Core Concepts

The application stores six primary entities plus application settings.

- Workout
- Workout Exercise
- Workout Set
- Exercise
- Body Part Group
- Gym

- Settings

---

# 4. Main Workflow

Start Workout

↓

Detect/select gym

↓

Select Exercise

↓

Log Sets

↓

Select Exercise

↓

Log Sets

↓

The workout automatically finishes when the calendar day ends. The timestamp of the first logged set is considered the workout start time, and the timestamp of the last logged set is considered the workout end time. When viewing an older workout summary, GymLog corrects its stored start time to the earliest logged set when needed.

Only one workout can be active at a time. If a workout already exists for the current calendar day, opening Active Workout resumes that workout.

Almost the entire workout should be performed from the Active Workout screen.

---

# 5. Main Screens

## Home

The Home screen displays the GymLog logo and simple navigation buttons.
- Home is available at a separate route (`/home`)
- Home displays the date and local time of the application build beneath the logo.

The user can navigate from Home to:

- Active Workout
- History
- More

## More
The More page provides navigation to:
- Body Part Groups 
- Exercises 
- Gyms 
- Backup
- Restore
- Settings
- Reset Data

## History

The full-width History screen shows a compact, swipeable calendar above a paginated workout list. Days with workouts are highlighted and the calendar remains visible while viewing workout pages. Dragging the calendar right opens earlier months; dragging it left returns toward the current month. Selecting a calendar date resets the list so it begins with workouts logged on that date. The calendar is synchronized with the list’s initial and current page, showing the month of the newest workout on that page. The list is synchronized with the displayed calendar month and resets to that month's first page when the calendar changes; its pagination continues across earlier month boundaries. Workout history is shown three workouts at a time; the list responds to left and right drag gestures, as well as up and down drag gestures, to move between pages. Dragging up moves to older workouts; dragging down moves to newer workouts. Each workout shows its date and gym abbreviation, followed by the exercises logged in recorded order. Clicking anywhere on a workout card opens its Workout Summary page.

For horizontal list swipes, swiping right moves to older workouts and swiping left moves to newer workouts.

## Workout Summary

The compact Workout Summary page is opened by clicking anywhere on a workout card in the History list. Returning to History
restores the same calendar month, selected date, and workout-list position. Active Workout provides a Today action that opens the current workout's summary; its back action returns to Active Workout.

Its header shows the workout date, gym name, start time, and duration from workout start to the latest logged set. Below the header, exercises are listed by their earliest logged set, first to last;
 each exercise shows its body part group, exercise name, and logged sets as `kg × reps` values with each set's local time, on separate rows.

## Exercise Management
Exercises from More opens an Exercise Management screen where the user can:

- create a new exercise (opens Exercise Editor form)
- select an existing exercise from a list (opens Exercise Details for editing)

Exercise Management groups exercises by body part group using the same collapsed, alphabetically sorted group and exercise
layout as Exercise Selection.

## Gyms

Gym management is split into two pages.

1. Gym List page

- lists all known gyms for selection
- each row displays abbreviation first, then full gym name
- GPS coordinates are not shown in the list rows
- selecting a gym opens the editor page for that gym
- delete is available directly from the list via a trash icon action
- back button returns to Home page

2. Gym Editor page

- create a new gym
- edit an existing gym

The user can:

- add a gym
- edit a gym
- delete a gym

Each gym stores:

- Name
- Abbreviation (case-preserving; lowercase letters are allowed)
- GPS coordinates (latitude, longitude)

When creating a gym, GymLog requests the device position and prefills the GPS coordinate fields when location is available.
The user can edit or enter the coordinates manually if location access is unavailable.
When editing a gym, the user can request the device's current position to replace both stored GPS coordinates.

Old imported workouts that have no gym assignment show the gym as 'Unknown' with abbreviation shown `UNKN`.

## Active Workout (Primary Screen)

The Active Workout screen is the central screen of the application.

Active Workout remains the default route (`/`)

The user should be able to log an entire workout with minimal navigation.

A workout belongs to a single calendar day. When Active Workout is opened, any active workout from a previous calendar day is considered finished. The timestamp of its last logged set is considered its end time.

The Active Workout screen does not include a manual Finish Workout button.

The screen includes a direct Home link.

A gym must be assigned before workout logging begins. When starting a new workout, GymLog preselects the nearest configured gym within the detection radius using the device GPS position. If GPS is unavailable or no configured gym is within the radius, GymLog preselects the gym used by the most recent previous workout when one exists. The user can change the preselected gym or create a new one.

The selected gym abbreviation is shown at the top left of the Active Workout screen. Tapping it opens a gym selector so the gym assigned to the active workout can be corrected without leaving the screen.

The Today action at the top of Active Workout opens the current workout's summary. Exercise Details allows the exercise name, body part group, note, and Machine setting to be corrected. While editing a logged set, its time and personal-record marker are hidden, and a correction control beside Done and Delete opens the existing exercise selection screen to choose a different exercise for that set. When the target exercise already has sets in that workout, the sets are combined in recorded-time order.

In Exercise Details, each workout header shows workout date and gym abbreviation, with abbreviation right-aligned in the same typography as the date.

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

Workout exercises with no logged sets are removed from local storage and are excluded from backup data. A workout with no remaining workout exercises is also removed from local storage and excluded from backup data.

---

### Weight

Numeric input field for the current set weight.

When the field is selected, its value is cleared so the user can enter a fresh value quickly.

---

### Repetitions

Numeric input field for the number of repetitions.

When the field is selected, its value is cleared so the user can enter a fresh value quickly.

---

### Previous-Set Prefill

GymLog predicts the weight and repetitions for the next set using the sets from the most recent previous workout containing the selected exercise.

The previous workout is treated as a sequence of sets. GymLog tracks the current position within this sequence and suggests the next set from it.

After a set is logged:

* if the logged weight matches the currently suggested set, GymLog advances to the next set in the previous workout sequence
* if the logged weight does not match, GymLog searches forward from the current position for the first set with the same weight
* if a matching set is found, GymLog considers any preceding sets in the sequence skipped and continues with the set following the matched set
* when the same weight occurs multiple times, the first matching set at or after the current position is used
* if no matching set is found, GymLog continues from the current position in the previous workout sequence

For example, if the previous workout contains:

`20 × 10 → 40 × 10 → 50 × 10 → 60 × 6 → 60 × 6 → 60 × 6 → 60 × 5 → 50 × 10`

GymLog initially suggests `20 × 10`, followed by `40 × 10`.

If the user skips `40 × 10` and instead logs `50 × 10`, GymLog matches this to the next `50 kg` set in the previous workout sequence and next suggests `60 × 6`.

Sequence matching uses exact weight matches. Repetitions are not used to determine the position within the previous workout sequence. GymLog does not attempt to infer changes in working weight or otherwise modify the historical sequence.

When the end of the previous workout sequence is reached, the weight and repetitions from the most recently logged set of the exercise in the current workout are prefilled.

If there is no previous workout containing the exercise, weight and repetitions are initially empty.

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

Hot Picks

- shown above the body part groups, only while the search box is empty
- listed as a plain list, one exercise per row, without button styling
- contains up to 5 exercises:
  - the 3 most recently added exercises in the current workout (to support supersets)
  - the 2 exercises that most often immediately followed the currently selected exercise in workouts from the past 6 months
- an exercise already selected as the current exercise is excluded from Hot Picks

Exercises grouped by body part group, sorted alphabetically at both group and exercise level

- each group is collapsed by default
- tapping the group name folds/unfolds its exercise list
- while a search query is active, all groups with matching exercises are automatically expanded

---

## Exercise Details

The Exercise Details screen is opened from Active Workout for the currently selected exercise.

Top section:

- exercise name is used as the page title
- exercise name is editable inline
- exercise name editing displays and preserves the entered upper/lower case letters
- body part group is shown and editable inline
- Machine is shown as an inline checkbox with a Yes/No value
- exercise note is shown and editable inline

The screen lists all sets for that exercise, including the current workout, grouped by workout.

For each set, one row displays:

- `kg × reps`
- set time (`HH:MM`)
- a personal-record star when applicable

`kg × reps` and time are shown on the same row.

Set editing:

- rows are initially shown in read-only mode
- tapping a row switches only that row to editing mode
- `kg` and `reps` are editable inline in editing mode
- when edit mode opens, focus starts in the `kg` input
- changes are saved automatically (no explicit Save button)
- the set time and personal-record star are hidden while editing
- Done and Delete actions are available directly in the row
- Correct exercise beside Done and Delete opens Exercise Selection; choosing an exercise returns to Exercise Details and reassigns only that set
- when the target exercise already has sets in the same workout, the moved set is combined with them in recorded-time order

Workouts are ordered with the most recent on top.

---

## Exercise Editor

Used to create new exercises.

Primary flow: creating new exercises.

Fields

- name
- body part group
- machine (yes/no, default no)
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

- Global gym detection radius, editable in metres and saved locally

---

## Reset Data
- Reset all local data
- Reset requires a secondary confirmation after a short countdown before deletion is enabled

# 6. Gym Detection

Application requests GPS permission.

When a workout starts

Read current location.

For every configured gym

calculate distance.

If distance <= configured global radius

select nearest gym automatically.

When GPS detection is unavailable or no gym matches the configured radius, preselect the gym from the most recent previous workout if one exists.

Otherwise, the user can
- choose existing gym
- create a new gym using current location

---

# 7. Backup
- Exports all local tables (settings, exercises, body part groups, gyms, workouts, workout exercises, workout sets) in JSON format

# 8. Restore
- Importing a JSON backup replaces all current local data

# Personal Records

GymLog tracks personal records (PRs) separately for each exercise.

Personal records are derived from the complete chronological history of logged sets for the exercise.

## Record Types

GymLog tracks two types of personal records.

### Maximum Weight

The highest weight logged for the exercise, regardless of the number of repetitions.

For example, given:

`80 × 10`  
`90 × 5`  
`100 × 2`  
`105 × 1`

the Maximum Weight record is:

`105 kg × 1`

A set establishes a new Maximum Weight PR when its weight is greater than the Maximum Weight established by all earlier sets for the exercise.

The number of repetitions does not affect this comparison.

A set with the same weight as the existing Maximum Weight does not establish a new Maximum Weight PR.

### Maximum Weight by Repetitions

For each number of repetitions, GymLog tracks the highest weight logged for at least that number of repetitions.

A set performed for `N` repetitions therefore qualifies for the records for every repetition count from `1` through `N`.

For example:

`100 × 5`

qualifies as:

* 1 rep: `100 kg`
* 2 reps: `100 kg`
* 3 reps: `100 kg`
* 4 reps: `100 kg`
* 5 reps: `100 kg`

It does not qualify for the 6-repetition record or higher.

For each repetition count, the record is the maximum weight among all sets containing that number of repetitions or more.

For example, given:

`100 × 5`  
`90 × 8`  
`70 × 10`

the records are:

* 1 rep: `100 kg`
* 2 reps: `100 kg`
* 3 reps: `100 kg`
* 4 reps: `100 kg`
* 5 reps: `100 kg`
* 6 reps: `90 kg`
* 7 reps: `90 kg`
* 8 reps: `90 kg`
* 9 reps: `70 kg`
* 10 reps: `70 kg`

A set establishes a new Maximum Weight by Repetitions PR for each repetition count from `1` through the number of repetitions performed for which its weight is greater than the record established by all earlier qualifying sets.

Matching an existing record does not establish a new PR.

As a consequence, Maximum Weight by Repetitions records can never increase as the repetition count increases.

## PR Detection

PRs are evaluated when a set is logged.

The new set is compared with all chronologically earlier sets for the same exercise.

A single set may establish:

* a new Maximum Weight PR
* one or more Maximum Weight by Repetitions PRs
* both types of PR
* no PR

For Maximum Weight by Repetitions, a set with `N` repetitions is evaluated against the existing records for repetition counts `1` through `N`.

For example, assume the current records are:

* Maximum Weight: `100 kg`
* 5 reps: `100 kg`
* 6 reps: `90 kg`
* 7 reps: `90 kg`
* 8 reps: `90 kg`

Logging:

`95 × 7`

establishes new Maximum Weight by Repetitions PRs for:

* 6 reps: `95 kg`
* 7 reps: `95 kg`

It does not establish records for 1–5 reps because the existing `100 kg` records are higher.

It does not affect the 8-repetition record because only 7 repetitions were performed.

Logging:

`105 × 5`

establishes a new Maximum Weight PR and new Maximum Weight by Repetitions PRs for repetition counts 1 through 5.

## New PR Notification

When a newly logged set establishes one or more personal records, GymLog immediately shows a prominent, non-blocking in-app notification.

The notification identifies the achieved record or records.

A single set may establish Maximum Weight by Repetitions records for multiple repetition counts. These achievements are communicated together rather than producing separate notifications.

For example, if `95 × 7` establishes new records for 6 and 7 repetitions, GymLog shows a single PR notification for the logged set.

If a set also establishes a new Maximum Weight record, this is included in the same notification.

The notification uses a visually striking orange-accented card with a trophy icon, a clear `NEW PERSONAL RECORD` heading, and the achieved record details. It does not interrupt workout logging.

The user remains on Active Workout and can immediately continue entering the next set.

Matching an existing record does not trigger a notification.

## PR Set Marker

Every set that establishes a personal record at its chronological position in workout history is marked with a small star (`★`).

A star is shown if the set establishes at least one of:

* a new Maximum Weight PR
* one or more new Maximum Weight by Repetitions PRs

Only one star is shown when a set establishes both record types or multiple repetition-count records.

The star indicates that the set established a new personal record at that point in the exercise's history. It does not indicate that the set is still the current personal record.

A set receives only one star regardless of how many repetition-count records it establishes.

For example, if `95 × 7` establishes new records for both 6 and 7 repetitions, the set is displayed as:

`95 × 7 ★`

## PR Markers in Set Lists

The PR star is displayed consistently wherever individual workout sets are shown.

This includes:

* Current Workout column in Active Workout
* Previous Workout columns in Active Workout
* Exercise Details
* Workout Summary
* any other screen that displays individual historical sets

The star is displayed as a small visual marker next to the `kg × reps` value and must not significantly increase the height of the set row.

Example:

`90 × 5 ★`

Sets that did not establish a PR are displayed normally:

`90 × 5`

## Historical PR Calculation

PR status is derived from workout history rather than permanently stored as an immutable property of a set.

Sets for each exercise are evaluated in chronological order.

For each set, GymLog determines the records established by all earlier sets for that exercise and then determines whether the set establishes a new record.

For a repetition count `N`, its current record is the maximum weight among all sets for the exercise where `reps >= N`.

This makes it possible to reconstruct the PR progression for the exercise and identify every set that established a record at the time it was performed.

## Editing and Deleting Sets

When a historical set is edited or deleted, GymLog recalculates personal records and PR markers for the affected exercise.

The recalculation uses the resulting chronological workout history.

This may:

* add a PR star to a historical set
* remove a PR star from a historical set
* change the current Maximum Weight record
* change one or more Maximum Weight by Repetitions records

Editing or deleting historical sets does not display a new-PR notification. Notifications are shown only when a newly logged set establishes a PR.

## Current Personal Records

Exercise Details displays the current personal records for the exercise.

The records section shows:

* Maximum Weight
* Maximum Weight by Repetitions

Maximum Weight shows the current highest-weight set.

Example:

`Maximum Weight    105 × 1`

Maximum Weight by Repetitions lists the highest weight logged for at least each displayed number of repetitions. To keep the section compact, consecutive repetition counts with the same weight are grouped and shown only once, using the highest repetition count in that group.

For example, if the relevant historical sets are:

`100 × 5`  
`90 × 8`  
`70 × 10`

the records are displayed as:

`5 reps    100 kg`  
`8 reps     90 kg`  
`10 reps    70 kg`

Only repetition counts up to the highest number of repetitions represented in the exercise history are displayed.

The records are read-only and are calculated from stored workout sets.

## PR Scope

Personal records are exercise-specific.

Sets from different exercises are never compared with each other.

For non-machine exercises, records include sets from all workouts and all gyms.

For machine exercises, records are calculated separately for each gym. Sets from workouts without a gym assignment are grouped under `Unknown gym`.

Machine and non-machine exercises remain separate because they are represented by separate exercises in GymLog.

Personal records require no manually maintained PR data. They are always derived from the existing workout-set history.
