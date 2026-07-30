# GymLog - Database Model

Version: 0.2
Status: Draft

---

# 1. Exercise

Fields

- id
- name
- bodyPartGroup
- notes

Example

Name

Deadlift

Body Part Group

Back

---

# 2. Gym

Fields

- id
- name
- latitude
- longitude
- notes

Example

Factory Prague

50.087

14.420

---

# 3. Workout

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

# 4. Workout Exercise

Represents one exercise performed during one workout.

Fields

- id
- workoutId
- exerciseId
- order
- notes

---

# 5. Workout Set

Fields

- id
- workoutExerciseId
- setNumber
- weight
- reps
- timestamp
- notes
