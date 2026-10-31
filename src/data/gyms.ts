import { createLocalRow, deleteLocalRow, getLocalRow, listLocalRows, updateLocalRow } from '../db/local'
import { mapGym } from './mappers'
import type { Gym } from '../db/types'

export async function listGyms(includeDeleted = false): Promise<Gym[]> {
  return (await listLocalRows('gyms', includeDeleted)).sort((a, b) => a.name.localeCompare(b.name)).map(mapGym)
}

export async function getGym(id: string, includeDeleted = false): Promise<Gym | null> {
  const row = await getLocalRow('gyms', id, includeDeleted)
  return row ? mapGym(row) : null
}

export async function createGym(input: Omit<Gym, 'id' | 'isDeleted'>): Promise<Gym> {
  return mapGym(await createLocalRow('gyms', { ...input, is_deleted: false }))
}

export async function updateGym(id: string, input: Partial<Omit<Gym, 'id' | 'isDeleted'>>): Promise<Gym> {
  return mapGym(await updateLocalRow('gyms', id, input))
}

export async function deleteGym(id: string): Promise<void> {
  await deleteLocalRow('gyms', id)
}
