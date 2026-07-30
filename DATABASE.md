# GymLog - Database Model

Version: 0.3
Status: Draft

---

# 1. Settings

Stores application-wide settings.

Fields

- id
- gymDetectionRadius
- theme

---

# 2. Body Part Group

Fields

- id
- name

Example

Back

Biceps

---

# 3. Exercise

Fields

- id
- name
- bodyPartGroupId
- notes

Example

Name

Deadlift

Body Part Group

Back

---

# 4. Gym

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

# 5. Workout

Fields

- id
- gymId
- startTime
- endTime

Derived values

- duration
- totalVolume
- totalSets

---

# 6. Workout Exercise

Represents one exercise performed during one workout.

Fields

- id
- workoutId
- exerciseId
- order

---

# 7. Workout Set

Fields

- id
- workoutExerciseId
- setNumber
- weight
- reps
- timestamp
