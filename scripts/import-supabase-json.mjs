import fs from 'node:fs/promises'
import { execFile } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import { createClient } from '@supabase/supabase-js'

const DEFAULT_BACKUP_PATH = 'test_data/gymlog-backup.json'
const DEFAULT_EMAIL = 'miroslav.vicher@gmail.com'
const INSERT_BATCH_SIZE = 50
const TABLES = [
  'settings',
  'body_part_groups',
  'gyms',
  'exercises',
  'workouts',
  'workout_exercises',
  'workout_sets',
]
const execFileAsync = promisify(execFile)

async function curlFetch(input, init = {}) {
  const requestUrl = new URL(typeof input === 'string' ? input : input.url)
  const headers = [...new Headers(init.headers).entries()].flatMap(([name, value]) => ['-H', `${name}: ${value}`])
  const args = [
    '--silent',
    '--show-error',
    '--location',
    '--max-time',
    '30',
    '--request',
    init.method ?? 'GET',
    ...headers,
  ]
  if (init.body) args.push('--data-raw', String(init.body))
  args.push('--write-out', '\n__GYMLOG_STATUS__:%{http_code}', requestUrl.toString())

  try {
    const { stdout } = await execFileAsync('curl.exe', args, { maxBuffer: 50 * 1024 * 1024 })
    const markerIndex = stdout.lastIndexOf('\n__GYMLOG_STATUS__:')
    if (markerIndex < 0) throw new Error('curl did not return an HTTP status.')
    const status = Number.parseInt(stdout.slice(markerIndex + '\n__GYMLOG_STATUS__:'.length), 10)
    const body = [204, 205, 304].includes(status) ? null : stdout.slice(0, markerIndex)
    return new Response(body, {
      status,
      headers: { 'content-type': 'application/json' },
    })
  } catch (error) {
    throw new Error(`curl request failed: ${error.message}`)
  }
}

async function loadLocalEnv() {
  try {
    const text = await fs.readFile('.env.local', 'utf8')
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
      if (!match || process.env[match[1]]) continue
      const value = match[2].replace(/^(["'])(.*)\1$/, '$2')
      process.env[match[1]] = value
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}

function parseArguments() {
  const args = process.argv.slice(2)
  const backupIndex = args.indexOf('--backup')
  return {
    backupPath: backupIndex >= 0 ? args[backupIndex + 1] : DEFAULT_BACKUP_PATH,
    reset: args.includes('--reset'),
  }
}

function requireValue(name, value) {
  if (!value) throw new Error(`Missing ${name}.`)
  return value
}

function requireNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Invalid number for ${label}.`)
  }
  return value
}

function requireId(value, label) {
  const id = requireNumber(value, label)
  if (!Number.isInteger(id) || id <= 0) throw new Error(`Invalid ID for ${label}.`)
  return id
}

function requireDate(value, label) {
  const date = new Date(value)
  if (!value || Number.isNaN(date.getTime())) throw new Error(`Invalid date for ${label}.`)
  return date.toISOString()
}

function requireArray(data, key) {
  if (!Array.isArray(data[key])) throw new Error(`Backup data.${key} must be an array.`)
  return data[key]
}

function mapId(map, oldId, label) {
  const id = map.get(requireId(oldId, label))
  if (!id) throw new Error(`Missing imported relationship for ${label} ${oldId}.`)
  return id
}

async function countRows(supabase, table, userId) {
  const { data, error } = await supabase
    .from(table)
    .select('id')
    .eq('user_id', userId)
  if (error) throw new Error(`Could not inspect ${table}: ${error.message}`)
  return data?.length ?? 0
}

async function insertRows(supabase, table, rows) {
  const importedIds = []
  for (let offset = 0; offset < rows.length; offset += INSERT_BATCH_SIZE) {
    const batch = rows.slice(offset, offset + INSERT_BATCH_SIZE)
    const { data, error } = await supabase.from(table).insert(batch).select('id')
    if (error) throw new Error(`Could not import ${table}: ${error.message}`)
    if (!data || data.length !== batch.length) {
      throw new Error(`Supabase returned an unexpected number of ${table} IDs.`)
    }
    importedIds.push(...data.map((row) => row.id))
  }
  return importedIds
}

async function resetUserData(supabase, userId) {
  for (const table of ['workout_sets', 'workout_exercises', 'workouts', 'exercises', 'gyms', 'body_part_groups']) {
    const { error } = await supabase.from(table).delete().eq('user_id', userId)
    if (error) throw new Error(`Could not reset ${table}: ${error.message}`)
  }
}

function createIdMap(sourceRows, importedIds, label) {
  if (sourceRows.length !== importedIds.length) {
    throw new Error(`Could not map imported ${label} IDs.`)
  }
  return new Map(sourceRows.map((row, index) => [requireId(row.id, `${label}.id`), importedIds[index]]))
}

async function main() {
  await loadLocalEnv()
  const { backupPath, reset } = parseArguments()
  const projectUrl = requireValue(
    'SUPABASE_URL or VITE_SUPABASE_URL',
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  )
  const serviceRoleKey = requireValue('SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY)
  const email = (process.env.SUPABASE_USER_EMAIL || DEFAULT_EMAIL).toLowerCase()
  const resolvedBackupPath = path.resolve(backupPath)
  const backup = JSON.parse(await fs.readFile(resolvedBackupPath, 'utf8'))

  if (backup.schemaVersion !== 1 || !backup.data || typeof backup.data !== 'object') {
    throw new Error('Unsupported GymLog backup. Expected schemaVersion 1.')
  }

  const settings = requireArray(backup.data, 'settings')
  const bodyPartGroups = requireArray(backup.data, 'bodyPartGroups')
  const exercises = requireArray(backup.data, 'exercises')
  const gyms = requireArray(backup.data, 'gyms')
  const workouts = requireArray(backup.data, 'workouts')
  const workoutExercises = requireArray(backup.data, 'workoutExercises')
  const workoutSets = requireArray(backup.data, 'workoutSets')

  const supabase = createClient(projectUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: curlFetch },
  })

  const { data: users, error: usersError } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  if (usersError) throw new Error(`Could not find the Supabase user: ${usersError.message}`)
  const user = users.users.find((candidate) => candidate.email?.toLowerCase() === email)
  if (!user) throw new Error(`No Supabase Auth user found for ${email}. Sign in with Google first.`)

  let existingCounts = Object.fromEntries(
    await Promise.all(TABLES.map(async (table) => [table, await countRows(supabase, table, user.id)])),
  )
  if (reset) {
    console.log('Resetting this user\'s imported workout data before import.')
    await resetUserData(supabase, user.id)
    existingCounts = Object.fromEntries(
      await Promise.all(TABLES.map(async (table) => [table, await countRows(supabase, table, user.id)])),
    )
  }
  const blockingTables = TABLES.filter((table) => table !== 'settings' && existingCounts[table] > 0)
  if (blockingTables.length > 0) {
    throw new Error(`Import refused because data already exists in: ${blockingTables.join(', ')}. No rows were changed.`)
  }

  console.log(`Importing ${resolvedBackupPath} for ${email} (${user.id}).`)
  console.log('Existing non-settings tables are empty; import will not overwrite data.')

  if (settings[0]) {
    const settingsRow = {
      gym_detection_radius: requireNumber(settings[0].gymDetectionRadius, 'settings.gymDetectionRadius'),
      theme: settings[0].theme === 'dark' ? 'dark' : 'dark',
    }
    const { data: existingSettings, error: settingsError } = await supabase
      .from('settings')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (settingsError) throw new Error(`Could not inspect settings: ${settingsError.message}`)
    if (existingSettings) {
      const { error } = await supabase.from('settings').update(settingsRow).eq('id', existingSettings.id)
      if (error) throw new Error(`Could not update settings: ${error.message}`)
    } else {
      const { error } = await supabase.from('settings').insert({ ...settingsRow, user_id: user.id })
      if (error) throw new Error(`Could not import settings: ${error.message}`)
    }
  }

  const bodyPartIds = await insertRows(
    supabase,
    'body_part_groups',
    bodyPartGroups.map((group) => ({ user_id: user.id, name: requireValue('body part name', group.name) })),
  )
  const bodyPartIdMap = createIdMap(bodyPartGroups, bodyPartIds, 'body part group')

  const gymIds = await insertRows(
    supabase,
    'gyms',
    gyms.map((gym) => ({
      user_id: user.id,
      name: requireValue('gym name', gym.name),
      abbreviation: gym.abbreviation?.trim() || gym.name.slice(0, 3).toUpperCase(),
      latitude: requireNumber(gym.latitude, 'gym.latitude'),
      longitude: requireNumber(gym.longitude, 'gym.longitude'),
    })),
  )
  const gymIdMap = createIdMap(gyms, gymIds, 'gym')

  const exerciseIds = await insertRows(
    supabase,
    'exercises',
    exercises.map((exercise) => ({
      user_id: user.id,
      body_part_group_id: mapId(bodyPartIdMap, exercise.bodyPartGroupId, 'exercise.bodyPartGroupId'),
      name: requireValue('exercise name', exercise.name),
      machine: exercise.machine === true,
      notes: exercise.notes?.trim() || null,
    })),
  )
  const exerciseIdMap = createIdMap(exercises, exerciseIds, 'exercise')

  const workoutIds = await insertRows(
    supabase,
    'workouts',
    workouts.map((workout) => ({
      user_id: user.id,
      gym_id: workout.gymId ? mapId(gymIdMap, workout.gymId, 'workout.gymId') : null,
      start_time: requireDate(workout.startTime, 'workout.startTime'),
      end_time: workout.endTime ? requireDate(workout.endTime, 'workout.endTime') : null,
    })),
  )
  const workoutIdMap = createIdMap(workouts, workoutIds, 'workout')

  const workoutExerciseIds = await insertRows(
    supabase,
    'workout_exercises',
    workoutExercises.map((entry) => ({
      user_id: user.id,
      workout_id: mapId(workoutIdMap, entry.workoutId, 'workoutExercise.workoutId'),
      exercise_id: mapId(exerciseIdMap, entry.exerciseId, 'workoutExercise.exerciseId'),
      exercise_order: requireNumber(entry.order, 'workoutExercise.order'),
    })),
  )
  const workoutExerciseIdMap = createIdMap(workoutExercises, workoutExerciseIds, 'workout exercise')

  await insertRows(
    supabase,
    'workout_sets',
    workoutSets.map((set) => ({
      user_id: user.id,
      workout_exercise_id: mapId(workoutExerciseIdMap, set.workoutExerciseId, 'workoutSet.workoutExerciseId'),
      set_number: requireNumber(set.setNumber, 'workoutSet.setNumber'),
      weight: requireNumber(set.weight, 'workoutSet.weight'),
      reps: requireNumber(set.reps, 'workoutSet.reps'),
      performed_at: requireDate(set.timestamp, 'workoutSet.timestamp'),
    })),
  )

  const importedCounts = Object.fromEntries(
    await Promise.all(TABLES.map(async (table) => [table, await countRows(supabase, table, user.id)])),
  )
  console.log('Import complete.')
  console.log(JSON.stringify({ source: { settings: settings.length, bodyPartGroups: bodyPartGroups.length, gyms: gyms.length, exercises: exercises.length, workouts: workouts.length, workoutExercises: workoutExercises.length, workoutSets: workoutSets.length }, destination: importedCounts }, null, 2))
}

main().catch((error) => {
  console.error(`Import failed: ${error.message}`)
  process.exitCode = 1
})
