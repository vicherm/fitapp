# GymLog - Product Specification

Version: 0.1
Status: Draft
Target Platform: Progressive Web App (PWA)
Primary User: Personal use (single user)

---

# 1. Vision
GymLog is a lightweight personal workout logging application optimized for
strength training.

The application replaces HeavySet and is tailored specifically for the owner's
training style rather than attempting to satisfy a broad audience.

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

# 3. Technology

Frontend

- React
- TypeScript
- Vite

PWA

- vite-plugin-pwa

Database

- IndexedDB
- Dexie.js

Charts

- Recharts

Export

- SheetJS (xlsx)

Maps

- Browser Geolocation API

---

# 4. Core Concepts

The application stores five main entity types.

Exercise

Workout

WorkoutSet

Gym

Template

---

# 5. Data Model

## Exercise

Fields

- id
- category
- name
- notes

Example

Name:
Deadlift

Category:
Back

---

## Gym

Fields

- id
- name
- latitude
- longitude

Example

Factory Prague
50.087
14.420

---

## Workout

Fields

- id
- gymId
- startTime
- endTime
- notes

Derived values

- duration
- totalVolume
- totalSets

---

## Workout Set

Fields

- id
- workoutId
- exerciseId
- setNumber
- weight
- reps
- timestamp
- notes

---

# 6. Main Screens

## Dashboard

Shows

- Start Workout
- Continue Workout
- History
- Export
- Settings

---

## Start Workout

Automatically

- read GPS
- determine nearest gym

Display

Current Gym

Factory Prague

Change button

Start

---

## Active Workout

List of exercises

Each exercise expands into sets

Example

Deadlift

20 x 10

60 x 5

100 x 3

115 x 5

115 x 5

115 x 5

Button

Add Set

---

## Exercise Selection

Search box

Recent exercises

All exercises

---

## Settings

Gyms

Exercise categories

Import

Export

Theme

Backup

Restore

---

# 7. Gym Detection

Application requests GPS permission.

When a workout starts

Read current location

For every configured gym

calculate distance

If distance <= radius

select gym automatically

Otherwise

Gym = Unknown

User can override.

---

# 8. Progress Tracking

For every exercise

Show

Maximum weight

Estimated 1RM

Graph

---

# 9. Export

CSV

One row per set.

Columns

Date

Gym

Exercise

Weight

Reps

Volume

Workout Duration

Notes

XLSX

Workbook contains sheets

Exercises

Gyms

Workouts

Sets

Statistics

---

# 11. User Experience

Dark mode only.

Large buttons.

One-hand operation.

Maximum two taps to log a set.

Previous values visible during logging.

Default weight and reps filled automatically from previous workout.

---

# 12. Future Features

AI weight recommendations

Workout templates

Plate calculator

Rest timer

Supersets

Drop sets

Warm-up generator

Exercise photos

Body weight tracking

Measurements

Cloud synchronization

Apple Health integration

Wearables

QR code export

Voice logging

Watch support

---

# 13. Design Principles

Fast over beautiful.

Offline over cloud.

Local ownership of data.

Few screens.

Minimal typing.

No advertisements.

No subscriptions.

No unnecessary features.

Everything exportable.
