import assert from 'node:assert/strict'
import {afterEach, beforeEach, describe, it} from 'node:test'

import {ensureEnvVars} from '../../src/services/ensure-env.js'

describe('ensureEnvVars', () => {
  const managed = ['ENSURE_ENV_TEST_A', 'ENSURE_ENV_TEST_B', 'ENSURE_ENV_TEST_FALLBACK']
  const original: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const name of managed) original[name] = process.env[name]
  })

  afterEach(() => {
    for (const name of managed) {
      if (original[name] === undefined) delete process.env[name]
      else process.env[name] = original[name]
    }
  })

  it("ne fait rien pour une liste vide", async () => {
    await ensureEnvVars([])
  })

  it("ne redemande pas une variable déjà définie", async () => {
    process.env.ENSURE_ENV_TEST_A = 'already-set'
    // Si un prompt était déclenché, ce test resterait bloqué (pas de mock inquirer ici) - le
    // simple fait qu'il se termine prouve qu'aucun prompt n'a eu lieu.
    await ensureEnvVars([{name: 'ENSURE_ENV_TEST_A', hint: 'hint'}])
    assert.strictEqual(process.env.ENSURE_ENV_TEST_A, 'already-set')
  })

  it("skip une variable dont un fallback `satisfiedBy` est déjà défini, sans jamais la définir elle-même", async () => {
    process.env.ENSURE_ENV_TEST_FALLBACK = 'fallback-value'
    delete process.env.ENSURE_ENV_TEST_B

    await ensureEnvVars([{name: 'ENSURE_ENV_TEST_B', hint: 'hint', satisfiedBy: ['ENSURE_ENV_TEST_FALLBACK']}])

    assert.strictEqual(process.env.ENSURE_ENV_TEST_B, undefined)
  })
})
