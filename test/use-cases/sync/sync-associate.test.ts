import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {
  associateByCodocId,
  validateCodocIds,
} from '../../../src/use-cases/sync/sync-associate.js'
import {type SyncEntry} from '../../../src/use-cases/sync/sync-entries.js'
import { PageState } from '../../../src/services/lock/lock-file.js'

// Le lock est désormais indexé par codocId directement (la clé du Record EST le
// codocId), donc plus de champ `codocId` dans PageState.
const lockEntry = (title: string): PageState => ({
  confluencePageId: '1',
  environment: 'da',
  title,
  sourceFile: `${title}.md`,
  publishedAt: '',
  maintainedIn: 'code',
})

describe('sync-associate', () => {
  describe('associateByCodocId', () => {
    const entries = [
      {codocId: 'A', path: 'a.md'},
      {codocId: 'B', path: 'b.md'},
      {codocId: 'NEW', path: 'new.md'}, // pas dans le lock
    ]
    const lockPages: Record<string, PageState> = {
      A: lockEntry('A'),       // apparié (clé = codocId)
      GONE: lockEntry('Gone'), // plus dans le yaml → orphelin
      B: lockEntry('B'),       // apparié
    }

    it('apparie par codocId', () => {
      const {matched} = associateByCodocId(lockPages, entries)
      assert.deepStrictEqual(matched.map((m) => m.entry.codocId).sort(), ['A', 'B'])
      assert.strictEqual(matched.find((m) => m.entry.codocId === 'A')?.codocId, 'A')
    })

    it('classe orphelins du lock (codocId disparu du yaml)', () => {
      const {lockOrphans} = associateByCodocId(lockPages, entries)
      assert.deepStrictEqual(lockOrphans.map((o) => o.codocId), ['GONE'])
    })

    it('classe les nouveaux du yaml', () => {
      const {yamlNew} = associateByCodocId(lockPages, entries)
      assert.deepStrictEqual(yamlNew.map((e) => e.codocId), ['NEW'])
    })
  })

  describe('validateCodocIds', () => {
    const entry = (codocId: string | undefined, p: string): SyncEntry => ({
      codocId,
      kind: 'page',
      path: p,
      localPath: `/abs/${p}`,
      relPath: p,
      maintainedIn: 'code',
      env: {key: 'da'} as SyncEntry['env'],
    })

    it('throw si une entrée yaml manque de codocId', () => {
      assert.throws(
        () => validateCodocIds([entry('A', 'a.md'), entry(undefined, 'b.md')]),
        /codocId manquant dans codoc\.yaml/,
      )
    })

    it('throw sur codocId yaml en double', () => {
      assert.throws(
        () => validateCodocIds([entry('X', 'a.md'), entry('X', 'b.md')]),
        /double dans codoc\.yaml/,
      )
    })

    it('passe quand tout est cohérent', () => {
      assert.doesNotThrow(() => validateCodocIds([entry('A', 'a.md')]))
    })
  })
})
