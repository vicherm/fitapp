import { PGlite } from '@electric-sql/pglite'
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { emptyServerSnapshot } from '../src/db/sync'
import type { ServerSnapshot } from '../src/db/local'

let pg: PGlite
const userId = crypto.randomUUID()
const otherId = crypto.randomUUID()
const metadata = () => ({
  id: crypto.randomUUID(), user_id: userId, is_deleted: false,
  created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z',
})

async function push(changes: ServerSnapshot): Promise<ServerSnapshot> {
  const result = await pg.query<{ snapshot: ServerSnapshot }>('select public.push_local_changes($1::jsonb) as snapshot', [JSON.stringify(changes)])
  return result.rows[0].snapshot
}

beforeAll(async () => {
  pg = new PGlite()
  await pg.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    create table auth.users (id uuid primary key, email text, raw_app_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as
      $$ select current_setting('request.jwt.claims', true)::jsonb $$;
    grant usage on schema auth to authenticated;
    grant execute on all functions in schema auth to authenticated;
  `)
  const directory = resolve('supabase', 'migrations')
  for (const file of (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort()) {
    await pg.exec(await readFile(resolve(directory, file), 'utf8'))
  }
  await pg.query('insert into auth.users (id, email, raw_app_meta_data) values ($1, $2, $3), ($4, $5, $3)', [
    userId, 'miroslav.vicher@gmail.com', JSON.stringify({ provider: 'google' }), otherId, 'other@example.com',
  ])
  await pg.query("select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)", [
    userId, JSON.stringify({ email: 'miroslav.vicher@gmail.com', app_metadata: { provider: 'google' } }),
  ])
  await pg.exec('set role authenticated')
}, 60000)

afterAll(async () => { await pg?.close() })

describe('actual PostgreSQL sync migrations', () => {
  it('applies all migrations and preserves timestamps with authenticated RPCs', async () => {
    const changes = emptyServerSnapshot()
    const group = { ...metadata(), name: 'Server test back' }
    changes.body_part_groups = [group]
    expect((await push(changes)).body_part_groups[0].updated_at).toContain('2026-10-01')
    changes.body_part_groups[0] = { ...group, name: 'Server test new', updated_at: '2026-10-02T00:00:00.123456Z' }
    const accepted = (await push(changes)).body_part_groups[0]
    expect(accepted.name).toBe('Server test new')
    expect(accepted.updated_at).toContain('.123456')
    changes.body_part_groups[0] = { ...group, name: 'Stale edit' }
    expect((await push(changes)).body_part_groups[0].name).toBe('Server test new')
    changes.body_part_groups[0] = { ...accepted, name: 'Tie edit' }
    expect((await push(changes)).body_part_groups[0].name).toBe('Server test new')
  })

  it('inserts dependencies and new tombstones in one batch, then cascaded tombstones explicitly', async () => {
    const changes = emptyServerSnapshot()
    const group = { ...metadata(), name: 'Tree group' }
    const exercise = { ...metadata(), name: 'Tree row', body_part_group_id: group.id, machine: false, notes: null, strava_exercise_type: null }
    const workout = { ...metadata(), start_time: '2026-10-01T09:00:00Z', end_time: null, gym_id: null, note: null }
    const entry = { ...metadata(), workout_id: workout.id, exercise_id: exercise.id, exercise_order: 0 }
    const set = { ...metadata(), workout_exercise_id: entry.id, set_number: 1, reps: 8, weight: 50, performed_at: '2026-10-01T09:10:00Z', is_deleted: true }
    changes.body_part_groups = [group]
    changes.exercises = [exercise]
    changes.workouts = [workout]
    changes.workout_exercises = [entry]
    changes.workout_sets = [set]
    expect((await push(changes)).workout_sets[0].is_deleted).toBe(true)
    changes.workouts = [{ ...workout, is_deleted: true, updated_at: '2026-10-02T00:00:00Z' }]
    changes.workout_exercises = [{ ...entry, is_deleted: true, updated_at: '2026-10-02T00:00:00Z' }]
    changes.workout_sets = []
    expect((await push(changes)).workout_exercises[0].updated_at).toContain('2026-10-02')
  })

  it('releases unique keys for replacements and transactional swaps', async () => {
    const changes = emptyServerSnapshot()
    const a = { ...metadata(), name: 'Swap A' }
    const b = { ...metadata(), name: 'Swap B' }
    changes.body_part_groups = [a, b]
    await push(changes)
    changes.body_part_groups = [
      { ...a, name: b.name, updated_at: '2026-10-02T00:00:00Z' },
      { ...b, name: a.name, updated_at: '2026-10-02T00:00:00Z' },
    ]
    expect((await push(changes)).body_part_groups.map((row) => row.name).sort()).toEqual(['Swap A', 'Swap B'])
    changes.body_part_groups = [
      { ...changes.body_part_groups[0], is_deleted: true, updated_at: '2026-10-03T00:00:00Z' },
      { ...metadata(), name: 'Swap B' },
    ]
    expect((await push(changes)).body_part_groups.filter((row) => !row.is_deleted)).toHaveLength(1)
  })

  it('rolls all changes back on unique or foreign-key failure', async () => {
    const changes = emptyServerSnapshot()
    const group = { ...metadata(), name: 'Rollback group' }
    changes.body_part_groups = [group, { ...metadata(), name: group.name }]
    await expect(push(changes)).rejects.toThrow('unique')
    const count = await pg.query<{ count: number }>('select count(*)::int as count from public.body_part_groups where id = $1', [group.id])
    expect(count.rows[0].count).toBe(0)
    changes.body_part_groups = [group]
    changes.exercises = [{ ...metadata(), name: 'Invalid parent', body_part_group_id: crypto.randomUUID(), machine: false, notes: null, strava_exercise_type: null }]
    await expect(push(changes)).rejects.toThrow('foreign key')
    expect((await pg.query<{ count: number }>('select count(*)::int as count from public.body_part_groups where id = $1', [group.id])).rows[0].count).toBe(0)
  })

  it('rejects conflicting parent deletion and preserves ordinary server timestamp/cascade triggers', async () => {
    const changes = emptyServerSnapshot()
    const group = { ...metadata(), name: 'Cascade group' }
    const exercise = { ...metadata(), name: 'Cascade exercise', body_part_group_id: group.id, machine: false, notes: null, strava_exercise_type: null }
    const workout = { ...metadata(), start_time: '2026-10-01T09:00:00Z', end_time: null, gym_id: null, note: null }
    const entry = { ...metadata(), workout_id: workout.id, exercise_id: exercise.id, exercise_order: 0 }
    changes.body_part_groups = [group]
    changes.exercises = [exercise]
    changes.workouts = [workout]
    changes.workout_exercises = [entry]
    await push(changes)
    changes.workouts = [{ ...workout, is_deleted: true, updated_at: '2026-10-02T00:00:00Z' }]
    changes.workout_exercises = []
    await expect(push(changes)).rejects.toThrow('parent and child')
    expect((await pg.query<{ is_deleted: boolean }>('select is_deleted from public.workouts where id = $1', [workout.id])).rows[0].is_deleted).toBe(false)
    await pg.query('update public.workouts set is_deleted = true where id = $1', [workout.id])
    const result = await pg.query<{ is_deleted: boolean; updated_at: string }>('select is_deleted, updated_at::text from public.workout_exercises where id = $1', [entry.id])
    expect(result.rows[0].is_deleted).toBe(true)
    expect(result.rows[0].updated_at).not.toContain('2026-10-01')
  })

  it('rejects other owners and signed-in disallowed accounts', async () => {
    const changes = emptyServerSnapshot()
    changes.body_part_groups = [{ ...metadata(), user_id: otherId, name: 'Wrong owner' }]
    await expect(push(changes)).rejects.toThrow('ownership')
    await pg.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ email: 'other@example.com', app_metadata: { provider: 'google' } })])
    await expect(pg.query('select public.pull_local_snapshot()')).rejects.toThrow('allowed account')
    await pg.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ email: 'miroslav.vicher@gmail.com', app_metadata: { provider: 'google' } })])
  })

  it('returns more than 1,000 rows and tombstones in a complete Pull', async () => {
    const changes = emptyServerSnapshot()
    changes.body_part_groups = Array.from({ length: 1001 }, (_, index) => ({ ...metadata(), name: `Bulk ${index}`, is_deleted: index === 0 }))
    await push(changes)
    const result = await pg.query<{ snapshot: ServerSnapshot }>('select public.pull_local_snapshot() as snapshot')
    expect(result.rows[0].snapshot.body_part_groups.length).toBeGreaterThan(1000)
    expect(result.rows[0].snapshot.body_part_groups.some((row) => row.name === 'Bulk 0' && row.is_deleted)).toBe(true)
    expect(Object.keys(result.rows[0].snapshot)).toHaveLength(7)
  })
})
