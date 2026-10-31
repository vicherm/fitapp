import { supabase } from '../lib/supabase'
import { mapBodyPartGroup } from './mappers'
import type { BodyPartGroup } from '../db/types'

export async function listBodyPartGroups(includeDeleted = false): Promise<BodyPartGroup[]> {
  let query = supabase.from('body_part_groups').select('*')
  if (!includeDeleted) query = query.eq('is_deleted', false)
  const { data, error } = await query.order('name')
  if (error) throw error
  return data.map(mapBodyPartGroup)
}

export async function createBodyPartGroup(name: string): Promise<BodyPartGroup> {
  const { data, error } = await supabase
    .from('body_part_groups')
    .insert({ id: crypto.randomUUID(), is_deleted: false, name })
    .select('*')
    .single()
  if (error) throw error
  return mapBodyPartGroup(data)
}

export async function updateBodyPartGroup(id: string, name: string): Promise<BodyPartGroup> {
  const { data, error } = await supabase
    .from('body_part_groups')
    .update({ name })
    .eq('id', id)
    .eq('is_deleted', false)
    .select('*')
    .single()
  if (error) throw error
  return mapBodyPartGroup(data)
}

export async function deleteBodyPartGroup(id: string): Promise<void> {
  const { error } = await supabase.from('body_part_groups').update({ is_deleted: true }).eq('id', id).eq('is_deleted', false)
  if (error) throw error
}

export async function getBodyPartGroup(id: string, includeDeleted = false): Promise<BodyPartGroup | null> {
  let query = supabase.from('body_part_groups').select('*').eq('id', id)
  if (!includeDeleted) query = query.eq('is_deleted', false)
  const { data, error } = await query.maybeSingle()
  if (error) throw error
  return data ? mapBodyPartGroup(data) : null
}