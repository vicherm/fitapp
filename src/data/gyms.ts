import { supabase } from '../lib/supabase'
import { mapGym } from './mappers'
import type { Gym } from '../db/types'

export async function listGyms(): Promise<Gym[]> {
  const { data, error } = await supabase.from('gyms').select('*').order('name')
  if (error) throw error
  return data.map(mapGym)
}

export async function getGym(id: number): Promise<Gym | null> {
  const { data, error } = await supabase.from('gyms').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data ? mapGym(data) : null
}

export async function createGym(input: Omit<Gym, 'id'>): Promise<Gym> {
  const { data, error } = await supabase.from('gyms').insert(input).select('*').single()
  if (error) throw error
  return mapGym(data)
}

export async function updateGym(id: number, input: Partial<Omit<Gym, 'id'>>): Promise<Gym> {
  const { data, error } = await supabase.from('gyms').update(input).eq('id', id).select('*').single()
  if (error) throw error
  return mapGym(data)
}

export async function deleteGym(id: number): Promise<void> {
  const { error } = await supabase.from('gyms').delete().eq('id', id)
  if (error) throw error
}