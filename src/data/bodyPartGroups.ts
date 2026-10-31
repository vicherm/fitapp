import { createLocalRow, deleteLocalRow, getLocalRow, listLocalRows, updateLocalRow } from '../db/local'
import { mapBodyPartGroup } from './mappers'
import type { BodyPartGroup } from '../db/types'

export async function listBodyPartGroups(includeDeleted = false): Promise<BodyPartGroup[]> {
  return (await listLocalRows('body_part_groups', includeDeleted))
    .sort((a, b) => a.name.localeCompare(b.name)).map(mapBodyPartGroup)
}

export async function createBodyPartGroup(name: string): Promise<BodyPartGroup> {
  return mapBodyPartGroup(await createLocalRow('body_part_groups', { name, is_deleted: false }))
}

export async function updateBodyPartGroup(id: string, name: string): Promise<BodyPartGroup> {
  return mapBodyPartGroup(await updateLocalRow('body_part_groups', id, { name }))
}

export async function deleteBodyPartGroup(id: string): Promise<void> {
  await deleteLocalRow('body_part_groups', id)
}

export async function getBodyPartGroup(id: string, includeDeleted = false): Promise<BodyPartGroup | null> {
  const row = await getLocalRow('body_part_groups', id, includeDeleted)
  return row ? mapBodyPartGroup(row) : null
}
