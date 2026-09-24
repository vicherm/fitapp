import { supabase } from '../lib/supabase'
import { mapBodyPartGroup } from './mappers'
import type { BodyPartGroup } from '../db/types'

export async function listBodyPartGroups(): Promise<BodyPartGroup[]> {
  const { data, error } = await supabase.from('body_part_groups').select('*').order('name')
  if (error) throw error
  return data.map(mapBodyPartGroup)
}

export async function createBodyPartGroup(name: string): Promise<BodyPartGroup> {
  const { data, error } = await supabase
    .from('body_part_groups')
    .insert({ name })
    .select('*')
    .single()
  if (error) throw error
  return mapBodyPartGroup(data)
}

export async function updateBodyPartGroup(id: number, name: string): Promise<BodyPartGroup> {
  const { data, error } = await supabase
    .from('body_part_groups')
    .update({ name })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return mapBodyPartGroup(data)
}

export async function deleteBodyPartGroup(id: number): Promise<void> {
  const { error } = await supabase.from('body_part_groups').delete().eq('id', id)
  if (error) throw error
}

export async function getBodyPartGroup(id: number): Promise<BodyPartGroup | null> {
  const { data, error } = await supabase.from('body_part_groups').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data ? mapBodyPartGroup(data) : null
}