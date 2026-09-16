import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {AGENT_CONTEXT_TARGETS, isAgentContextTargetKey} from '../../../src/use-cases/agent-context/targets.js'

describe('isAgentContextTargetKey', () => {
  for (const key of ['copilot', 'agent', 'claude', 'kiro']) {
    it(`accepte "${key}"`, () => {
      assert.strictEqual(isAgentContextTargetKey(key), true)
    })
  }

  it('rejette une clé inconnue', () => {
    assert.strictEqual(isAgentContextTargetKey('bogus'), false)
  })

  it('rejette une chaîne vide', () => {
    assert.strictEqual(isAgentContextTargetKey(''), false)
  })
})

describe('AGENT_CONTEXT_TARGETS', () => {
  it('contient exactement 4 cibles', () => {
    assert.strictEqual(AGENT_CONTEXT_TARGETS.length, 4)
  })

  it('a des clés uniques', () => {
    const keys = AGENT_CONTEXT_TARGETS.map((t) => t.key)
    assert.strictEqual(new Set(keys).size, keys.length)
  })

  it('a des relPath uniques', () => {
    const paths = AGENT_CONTEXT_TARGETS.map((t) => t.relPath)
    assert.strictEqual(new Set(paths).size, paths.length)
  })

  it('a un label et une description non vides pour chaque cible', () => {
    for (const t of AGENT_CONTEXT_TARGETS) {
      assert.ok(t.label.trim().length > 0, `label manquant pour ${t.key}`)
      assert.ok(t.description.trim().length > 0, `description manquante pour ${t.key}`)
    }
  })
})
