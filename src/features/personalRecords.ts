import type { WorkoutSet } from '../db/types'

export interface PersonalRecordEvent {
  maximumWeight: boolean
  repetitions: number | null
}

export interface PersonalRecords {
  events: Map<number, PersonalRecordEvent>
  markedSetIds: Set<number>
  maximumWeight: WorkoutSet | null
  maximumWeightByRepetitions: Map<number, WorkoutSet>
}

/** Derive PR progression from the complete chronological set history. */
export function calculatePersonalRecords(sets: WorkoutSet[]): PersonalRecords {
  const events = new Map<number, PersonalRecordEvent>()
  const markedSetIds = new Set<number>()
  const byRepetitions = new Map<number, WorkoutSet>()
  let maximumWeight: WorkoutSet | null = null

  const chronologicalSets = [...sets].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())

  for (const set of chronologicalSets) {
    const isMaximumWeight = maximumWeight === null || set.weight > maximumWeight.weight
    const previousByRepetitions = byRepetitions.get(set.reps)
    const isMaximumWeightByRepetitions =
      previousByRepetitions === undefined || set.weight > previousByRepetitions.weight

    if (set.id !== undefined) {
      events.set(set.id, {
        maximumWeight: isMaximumWeight,
        repetitions: isMaximumWeightByRepetitions ? set.reps : null,
      })
      if (isMaximumWeight || isMaximumWeightByRepetitions) markedSetIds.add(set.id)
    }

    if (isMaximumWeight) maximumWeight = set
    if (isMaximumWeightByRepetitions) byRepetitions.set(set.reps, set)
  }

  return {
    events,
    markedSetIds,
    maximumWeight,
    maximumWeightByRepetitions: byRepetitions,
  }
}
