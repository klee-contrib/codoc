import assert from 'node:assert/strict'
import fs from 'node:fs'
import {describe, it} from 'node:test'

import {CONFIG_PATH} from '../../src/config/codoc-paths.js'
import {getCodocConfigOrEmpty} from '../../src/config/codoc-config.js'

describe('getCodocConfigOrEmpty', () => {
  it('ne lève pas et renvoie `environments: []` en absence totale de codoc.yaml (mode hors scope de projet)', () => {
    assert.strictEqual(fs.existsSync(CONFIG_PATH), false, 'précondition : codoc.yaml ne doit pas déjà exister pour ce test')

    const config = getCodocConfigOrEmpty()

    assert.deepEqual(config.atlassian.environments, [])
    assert.deepEqual(config.docs, [])
  })
})
