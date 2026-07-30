# GymLog - Product Specification

Version: 0.4
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

Almost the entire workout should be performed from the Active Workout screen.

---

# 5. Main Screens

## Active Workout (Primary Screen)

The Active Workout screen is the central screen of the application.

The user should be able to log an entire workout with minimal navigation.

The screen contains the following elements.

### Exercise

Displays the currently selected exercise.

If no exercise is selected, tapping the exercise name opens the Exercise Selection screen.

The user can change the current exercise by tapping its name.

---

### Weight

Numeric input field for the current set weight.

The value is pre-filled using the previous set of the same exercise whenever available.

---

### Repetitions

Numeric input field for the number of repetitions.

The value is pre-filled using the previous set of the same exercise whenever available.

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

---

### Exercise History

Displays previous sets for the selected exercise.

History consists of two sections.

#### Current Workout

Shows all sets already logged during the current workout.

Example

115 × 5

115 × 5

110 × 6

#### Previous Workout

Shows all sets from the most recent previous workout containing the same exercise.

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

## Exercise Editor

Used to create and edit exercises.

Fields

- name
- body part group
- note

The exercise editor allows the user to assign an exercise to a body part group.

---

## Body Part Groups

Used to create and edit body part groups.

The user can:

- create a new body part group
- rename an existing body part group
- delete a body part group when it is no longer used

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
