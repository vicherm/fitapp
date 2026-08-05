#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import xlsx from 'xlsx'

const DEFAULT_PREFIX_TO_GROUP = {
  ABS: 'Abs',
  BAC: 'Back',
  BIC: 'Biceps',
  CAL: 'Calves',
  CAR: 'Cardio',
  CHE: 'Chest',
  FOR: 'Forearms',
  GLO: 'Glutes',
  LEG: 'Legs',
  SHO: 'Shoulders',
  TRI: 'Triceps',
}

function parseArgs(argv) {
  const args = {
    input: '',
    output: '',
    gapMinutes: 180,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (token === '--input' || token === '-i') {
      args.input = argv[i + 1] ?? ''
      i += 1
      continue
    }
    if (token === '--output' || token === '-o') {
      args.output = argv[i + 1] ?? ''
      i += 1
      continue
    }
    if (token === '--gap-minutes' || token === '-g') {
      args.gapMinutes = Number(argv[i + 1] ?? '180')
      i += 1
      continue
    }
    if (token === '--help' || token === '-h') {
      printHelp()
      process.exit(0)
    }
  }

  return args
}

function printHelp() {
  console.log(`Usage:
  node scripts/heavyset-csv-to-gymlog-json.mjs --input <heavyset.csv> --output <gymlog-backup.json> [--gap-minutes 180]

Description:
  Converts HeavySet CSV export into GymLog backup JSON format compatible with in-app JSON import.

Notes:
  - Exercise prefix codes are mapped to body part groups (e.g. LEG -> Legs, BIC -> Biceps).
  - Workouts are split when workout name changes, day changes, or time gap exceeds --gap-minutes.
`) // eslint-disable-line no-console
}

function assertRequired(value, message) {
  if (!value) {
    throw new Error(message)
  }
}

function parseDate(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Excel serial date (days since 1899-12-30), including fractional day for time.
    const ms = Math.round((value - 25569) * 86400 * 1000)
    const d = new Date(ms)
    if (!Number.isNaN(d.getTime())) return d
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    const numeric = Number(trimmed)
    if (trimmed !== '' && Number.isFinite(numeric) && /^\d+(\.\d+)?$/.test(trimmed)) {
      const ms = Math.round((numeric - 25569) * 86400 * 1000)
      const d = new Date(ms)
      if (!Number.isNaN(d.getTime())) return d
    }
  }

  const d = new Date(value)
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid date: ${value}`)
  }
  return d
}

function dayKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseExerciseName(rawName) {
  const cleaned = String(rawName ?? '').trim().replace(/\s+/g, ' ')
  const match = cleaned.match(/^([A-Z]{3})\s+(.+)$/)
  if (!match) {
    return {
      code: 'GEN',
      normalizedName: cleaned || 'Unnamed Exercise',
    }
  }

  return {
    code: match[1],
    normalizedName: match[2].trim(),
  }
}

function toNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function toInt(value, fallback = 0) {
  const n = parseInt(String(value), 10)
  return Number.isFinite(n) ? n : fallback
}

function readRows(csvPath) {
  const workbook = xlsx.readFile(csvPath, { raw: false })
  const firstSheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[firstSheetName]
  const rows = xlsx.utils.sheet_to_json(sheet, {
    defval: '',
  })

  return rows.map((row) => {
    const date = parseDate(row.Date)
    return {
      timestamp: date,
      workoutName: String(row['Workout Name'] ?? '').trim() || 'Imported Workout',
      exerciseRaw: String(row['Exercise Name'] ?? '').trim(),
      reps: toInt(row.Reps, 0),
      weightKg: toNumber(row['Weight (kg)'], 0),
      notes: String(row.Notes ?? '').trim(),
    }
  })
}

function sortRows(rows) {
  return [...rows].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
}

function shouldStartNewWorkout(prevRow, currentRow, gapMinutes) {
  if (!prevRow) return true
  if (prevRow.workoutName !== currentRow.workoutName) return true
  if (dayKey(prevRow.timestamp) !== dayKey(currentRow.timestamp)) return true

  const gap = (currentRow.timestamp.getTime() - prevRow.timestamp.getTime()) / 60000
  return gap > gapMinutes
}

function buildBackup(rows, gapMinutes) {
  const bodyPartGroups = []
  const bodyPartGroupByName = new Map()
  const exercises = []
  const exerciseByKey = new Map()
  const workouts = []
  const workoutExercises = []
  const workoutSets = []

  const getOrCreateBodyPartGroup = (name) => {
    if (bodyPartGroupByName.has(name)) return bodyPartGroupByName.get(name)
    const id = bodyPartGroups.length + 1
    const group = { id, name }
    bodyPartGroups.push(group)
    bodyPartGroupByName.set(name, group)
    return group
  }

  const getOrCreateExercise = (row) => {
    const parsed = parseExerciseName(row.exerciseRaw)
    const groupName = DEFAULT_PREFIX_TO_GROUP[parsed.code] ?? parsed.code
    const group = getOrCreateBodyPartGroup(groupName)
    const key = `${group.id}:${parsed.normalizedName.toLowerCase()}`

    if (exerciseByKey.has(key)) {
      const existing = exerciseByKey.get(key)
      if (row.notes && !existing.notes) {
        existing.notes = row.notes
      }
      return existing
    }

    const exercise = {
      id: exercises.length + 1,
      name: parsed.normalizedName,
      bodyPartGroupId: group.id,
      ...(row.notes ? { notes: row.notes } : {}),
    }

    exercises.push(exercise)
    exerciseByKey.set(key, exercise)
    return exercise
  }

  let currentWorkout = null
  let prevRow = null
  let currentExerciseById = new Map()
  let currentSetCountByWorkoutExerciseId = new Map()

  for (const row of sortRows(rows)) {
    if (shouldStartNewWorkout(prevRow, row, gapMinutes)) {
      currentWorkout = {
        id: workouts.length + 1,
        startTime: row.timestamp,
      }
      workouts.push(currentWorkout)
      currentExerciseById = new Map()
      currentSetCountByWorkoutExerciseId = new Map()
    }

    const exercise = getOrCreateExercise(row)
    let workoutExercise = currentExerciseById.get(exercise.id)

    if (!workoutExercise) {
      workoutExercise = {
        id: workoutExercises.length + 1,
        workoutId: currentWorkout.id,
        exerciseId: exercise.id,
        order: currentExerciseById.size,
      }
      workoutExercises.push(workoutExercise)
      currentExerciseById.set(exercise.id, workoutExercise)
    }

    const prevSetCount = currentSetCountByWorkoutExerciseId.get(workoutExercise.id) ?? 0
    const setNumber = prevSetCount + 1
    currentSetCountByWorkoutExerciseId.set(workoutExercise.id, setNumber)

    workoutSets.push({
      id: workoutSets.length + 1,
      workoutExerciseId: workoutExercise.id,
      setNumber,
      weight: row.weightKg,
      reps: row.reps,
      timestamp: row.timestamp,
    })

    prevRow = row
  }

  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    data: {
      settings: [{ id: 1, gymDetectionRadius: 200, theme: 'dark' }],
      bodyPartGroups,
      exercises,
      gyms: [],
      workouts: workouts.map((w) => ({
        ...w,
        startTime: w.startTime.toISOString(),
      })),
      workoutExercises,
      workoutSets: workoutSets.map((s) => ({
        ...s,
        timestamp: s.timestamp.toISOString(),
      })),
    },
  }
}

function run() {
  try {
    const args = parseArgs(process.argv.slice(2))
    assertRequired(args.input, 'Missing required argument: --input <path>')
    assertRequired(args.output, 'Missing required argument: --output <path>')
    if (!Number.isFinite(args.gapMinutes) || args.gapMinutes <= 0) {
      throw new Error('Invalid --gap-minutes value. Use a positive number.')
    }

    const inputPath = path.resolve(process.cwd(), args.input)
    const outputPath = path.resolve(process.cwd(), args.output)

    if (!fs.existsSync(inputPath)) {
      throw new Error(`Input file does not exist: ${inputPath}`)
    }

    const rows = readRows(inputPath)
    if (rows.length === 0) {
      throw new Error('Input CSV has no rows')
    }

    const backup = buildBackup(rows, args.gapMinutes)

    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    fs.writeFileSync(outputPath, `${JSON.stringify(backup, null, 2)}\n`, 'utf8')

    console.log(`Converted ${rows.length} rows`) // eslint-disable-line no-console
    console.log(`Output: ${outputPath}`) // eslint-disable-line no-console
    console.log(`Workouts: ${backup.data.workouts.length}`) // eslint-disable-line no-console
    console.log(`Exercises: ${backup.data.exercises.length}`) // eslint-disable-line no-console
    console.log(`Body part groups: ${backup.data.bodyPartGroups.length}`) // eslint-disable-line no-console
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`Error: ${message}`) // eslint-disable-line no-console
    process.exit(1)
  }
}

run()
