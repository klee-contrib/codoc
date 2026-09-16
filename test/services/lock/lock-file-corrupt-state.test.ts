import assert from 'node:assert/strict'
import fs from 'node:fs'
import {describe, it} from 'node:test'

import {STATE_FILE} from '../../../src/config/codoc-paths.js'
import {loadPublishState} from '../../../src/services/lock/lock-file.js'

describe('loadPublishState - fichier corrompu', () => {
  it("retourne un état vide par défaut sans lever, si codoc.lock contient du JSON invalide", () => {
    const existed = fs.existsSync(STATE_FILE)
    const previousContent = existed ? fs.readFileSync(STATE_FILE, 'utf8') : undefined

    fs.writeFileSync(STATE_FILE, "{ceci n'est pas du json valide")
    try {
      const state = loadPublishState()
      assert.deepEqual(state, {lastPublished: '', pages: {}})
    } finally {
      if (existed) fs.writeFileSync(STATE_FILE, previousContent!)
      else fs.rmSync(STATE_FILE, {force: true})
    }
  })
})
