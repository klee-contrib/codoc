import assert from 'node:assert/strict'
import fs from 'node:fs'
import {describe, it} from 'node:test'

import {STATE_FILE} from '../../../src/config/codoc-paths.js'
import {loadPublishState} from '../../../src/services/lock/lock-file.js'

describe('loadPublishState - fichier absent', () => {
  it('retourne un état vide par défaut sans lever, si codoc.lock est absent', () => {
    assert.strictEqual(fs.existsSync(STATE_FILE), false, 'précondition : codoc.lock ne doit pas déjà exister pour ce test')
    const state = loadPublishState()
    assert.deepEqual(state, {lastPublished: '', pages: {}})
  })
})
