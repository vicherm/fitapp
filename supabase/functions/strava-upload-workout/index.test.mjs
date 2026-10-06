import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')
  .replace(/^import .*\r?\n/gm, '')
const javascript = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText

function createScenario(options = {}) {
  let handler
  let link = options.link ?? null
  let uploads = 0
  let polls = 0
  let processing = options.processing ?? false
  const db = {
    auth: {
      getUser: async () => ({ data: { user: {
        id: 'owner', email: 'miroslav.vicher@gmail.com', app_metadata: { provider: 'google' },
      } } }),
    },
    from(table) {
      let operation = 'read'
      let values
      const query = {
        select() { return query },
        eq() { return query },
        order() { return query },
        single() { return query },
        maybeSingle() { return query },
        upsert(input, config) {
          assert.equal(config.onConflict, 'workout_id')
          assert.equal(config.ignoreDuplicates, true)
          operation = 'reserve'
          values = input
          return query
        },
        update(input) { operation = 'update'; values = input; return query },
        then(resolve, reject) {
          let data
          let error = null
          if (table === 'workout_strava_links') {
            if (operation === 'reserve') {
              data = link ? [] : [{ workout_id: values.workout_id }]
              link ??= { ...values, strava_activity_id: null, strava_upload_id: null }
            } else if (operation === 'update') {
              if (options.failUploadIdSave && values.strava_upload_id) {
                error = new Error('Upload ID save failed')
              } else {
                Object.assign(link, values)
                data = { ...link }
              }
            } else data = link ? { ...link } : null
          } else if (table === 'workouts') {
            data = { id: 1, start_time: '2026-10-06T10:00:00Z', gyms: { name: 'Gym' } }
          } else if (table === 'workout_exercises') {
            data = [{
              exercise_order: 0,
              exercises: { strava_exercise_type: 'BARBELL_BENCH_PRESS' },
              workout_sets: [{ weight: 20, reps: 10, performed_at: '2026-10-06T10:00:00Z', set_number: 1 }],
            }]
          } else {
            data = { user_id: 'owner', access_token: 'test', expires_at: '2099-01-01T00:00:00Z' }
          }
          return Promise.resolve({ data, error }).then(resolve, reject)
        },
      }
      return query
    },
  }
  vm.runInNewContext(javascript, {
    serve: callback => { handler = callback },
    createClient: () => db,
    Deno: { env: { get: () => 'test' } },
    Response, Blob, FormData, URLSearchParams,
    setTimeout: callback => queueMicrotask(callback),
    fetch: async (url, request) => {
      if (request?.method === 'POST') {
        uploads += 1
        await options.onUpload?.()
        return Response.json({ id_str: '123' })
      }
      assert.equal(url, 'https://www.strava.com/api/v3/uploads/123')
      polls += 1
      return Response.json(processing ? { status: 'Processing' } : { activity_id: 456 })
    },
  })
  return {
    invoke: (preview = false) => handler(new Request('https://example.test', {
      method: 'POST', headers: { Authorization: 'Bearer test' },
      body: JSON.stringify({ workoutId: 1, preview }),
    })),
    finishProcessing: () => { processing = false },
    get uploads() { return uploads },
    get polls() { return polls },
    get link() { return link },
  }
}

test('overlapping requests reserve the workout before a single remote upload', async () => {
  let started
  let release
  const start = new Promise(resolve => { started = resolve })
  const gate = new Promise(resolve => { release = resolve })
  const scenario = createScenario({ onUpload: async () => { started(); await gate } })
  const first = scenario.invoke()
  await start
  try {
    assert.equal((await scenario.invoke()).status, 409)
  } finally {
    release()
  }
  assert.equal((await (await first).json()).uploaded, true)
  assert.equal((await (await scenario.invoke()).json()).alreadyUploaded, true)
  assert.equal(scenario.uploads, 1)
  assert.equal(scenario.link.strava_upload_id, '123')
})

test('polling timeout retries the saved upload rather than creating another', async () => {
  const scenario = createScenario({ processing: true })
  assert.equal((await scenario.invoke()).status, 400)
  assert.equal(scenario.polls, 30)
  assert.equal(scenario.link.strava_upload_id, '123')
  scenario.finishProcessing()
  assert.equal((await (await scenario.invoke()).json()).stravaActivityId, 456)
  assert.equal(scenario.uploads, 1)
})

test('failed upload ID persistence blocks an unsafe second upload', async () => {
  const scenario = createScenario({ failUploadIdSave: true })
  assert.equal((await scenario.invoke()).status, 400)
  assert.equal((await scenario.invoke()).status, 409)
  assert.equal(scenario.uploads, 1)
  assert.equal(scenario.polls, 0)
})

test('ambiguous network failure keeps the reservation and blocks retries', async () => {
  const scenario = createScenario({ onUpload: () => { throw new Error('Network failure') } })
  assert.equal((await scenario.invoke()).status, 400)
  assert.equal((await scenario.invoke()).status, 409)
  assert.equal(scenario.uploads, 1)
})

test('legacy completed links return already-uploaded without contacting Strava', async () => {
  const scenario = createScenario({ link: { strava_activity_id: 456 } })
  assert.equal((await (await scenario.invoke()).json()).alreadyUploaded, true)
  assert.equal(scenario.uploads, 0)
  assert.equal(scenario.polls, 0)
})

test('JSON preview does not reserve or upload the workout', async () => {
  const scenario = createScenario()
  assert.equal((await (await scenario.invoke(true)).json()).preview, true)
  assert.equal(scenario.link, null)
  assert.equal(scenario.uploads, 0)
})