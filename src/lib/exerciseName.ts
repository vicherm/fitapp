import type { Exercise } from '../db/types'

export function getExerciseDisplayName(exercise: Pick<Exercise, 'name' | 'machine'>): string {
  return exercise.machine === true ? `${exercise.name} M` : exercise.name
}