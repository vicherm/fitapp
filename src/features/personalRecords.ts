import type { WorkoutSet } from '../db/types'

export interface PersonalRecordEvent {
  maximumWeight: boolean
  repetitions: number[]
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
    const newRepetitionRecords: number[] = []
    for (let repetitions = 1; repetitions <= set.reps; repetitions += 1) {
      const previousByRepetitions = byRepetitions.get(repetitions)
      if (previousByRepetitions === undefined || set.weight > previousByRepetitions.weight) {
        newRepetitionRecords.push(repetitions)
        byRepetitions.set(repetitions, set)
      }
    }

    if (set.id !== undefined) {
      events.set(set.id, {
        maximumWeight: isMaximumWeight,
        repetitions: newRepetitionRecords,
      })
      if (isMaximumWeight || newRepetitionRecords.length > 0) markedSetIds.add(set.id)
    }

    if (isMaximumWeight) maximumWeight = set
  }

  return {
    events,
    markedSetIds,
    maximumWeight,
    maximumWeightByRepetitions: byRepetitions,
  }
}
