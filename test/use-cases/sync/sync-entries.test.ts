import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {entryKind} from '../../../src/use-cases/sync/sync-entries.js'

describe('sync-entries', () => {
  describe('entryKind', () => {
    it('classe par suffixe de chemin', () => {
      assert.strictEqual(entryKind('doc/cu-ws/**'), 'folder')
      assert.strictEqual(entryKind('model/doc/*'), 'glob')
      assert.strictEqual(entryKind('doc/foo/'), 'folder')
      assert.strictEqual(entryKind('doc/page.md'), 'page')
    })
  })
})
