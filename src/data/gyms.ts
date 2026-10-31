import { supabase } from '../lib/supabase'
import { mapGym } from './mappers'
import type { Gym } from '../db/types'

export async function listGyms(includeDeleted = false): Promise<Gym[]> {
  let query = supabase.from('gyms').select('*')
  if (!includeDeleted) query = query.eq('is_deleted', false)
  const { data, error } = await query.order('name')
  if (error) throw error
  return data.map(mapGym)
}

export async function getGym(id: string, includeDeleted = false): Promise<Gym | null> {
  let query = supabase.from('gyms').select('*').eq('id', id)
  if (!includeDeleted) query = query.eq('is_deleted', false)
  const { data, error } = await query.maybeSingle()
  if (error) throw error
  return data ? mapGym(data) : null
}

export async function createGym(input: Omit<Gym, 'id' | 'isDeleted'>): Promise<Gym> {
  const { data, error } = await supabase.from('gyms').insert({ ...input, id: crypto.randomUUID(), is_deleted: false }).select('*').single()
  if (error) throw error
  return mapGym(data)
}

export async function updateGym(id: string, input: Partial<Omit<Gym, 'id' | 'isDeleted'>>): Promise<Gym> {
  const { data, error } = await supabase.from('gyms').update(input).eq('id', id).select('*').single()
  if (error) throw error
  return mapGym(data)
}

export async function deleteGym(id: string): Promise<void> {
  const { error } = await supabase.from('gyms').update({ is_deleted: true }).eq('id', id).eq('is_deleted', false)
  if (error) throw error
}