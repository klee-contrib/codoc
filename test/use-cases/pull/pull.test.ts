import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {findExistingImport} from '../../../src/use-cases/pull/pull.js'
import type {PublishState} from '../../../src/services/lock/lock-file.js'
import type {AppConfig} from '../../../src/types/codoc-types.js'

function emptyConfig(docs: AppConfig['docs'] = []): AppConfig {
  return {atlassian: {environments: []}, gitlab: {}, docs}
}

const emptyState: PublishState = {lastPublished: '', pages: {}}

describe('findExistingImport', () => {
  it("retourne undefined si rien ne correspond (ni lock, ni config)", () => {
    assert.strictEqual(findExistingImport(emptyConfig(), emptyState, '123', 'Un titre'), undefined)
  })

  it("apparie par id Confluence (lock) quand aucune entrée codoc.yaml ne référence ce codocId", () => {
    const state: PublishState = {
      lastPublished: '',
      pages: {
        doc1: {
          confluencePageId: '123',
          environment: 'default',
          title: 'Ancien titre',
          sourceFile: 'doc/a.md',
          publishedAt: '',
          maintainedIn: 'confluence',
        },
      },
    }
    const result = findExistingImport(emptyConfig(), state, '123', 'Nouveau titre Confluence')
    assert.deepEqual(result, {
      codocId: 'doc1',
      sourceFile: 'doc/a.md',
      title: 'Ancien titre',
      pageId: '123',
      matchedBy: 'id',
      parentPageId: undefined,
      maintainedIn: 'confluence',
      imagesDir: undefined,
    })
  })

  it("à défaut d'id, apparie par titre (lock) - et rapporte le pageId DÉJÀ suivi, pas celui qu'on est en train de pull", () => {
    const state: PublishState = {
      lastPublished: '',
      pages: {
        doc1: {
          confluencePageId: '999',
          environment: 'default',
          title: 'Guide utilisateur',
          sourceFile: 'doc/guide.md',
          publishedAt: '',
          maintainedIn: 'code',
        },
      },
    }
    const result = findExistingImport(emptyConfig(), state, '123', 'Guide utilisateur')
    assert.equal(result?.matchedBy, 'titre')
    assert.equal(result?.pageId, '999')
    assert.equal(result?.sourceFile, 'doc/guide.md')
    assert.equal(result?.maintainedIn, 'code')
  })

  it("à défaut de lock, apparie par titre dans codoc.yaml (jamais encore synchronisé) et nettoie le path (glob)", () => {
    const config = emptyConfig([
      {
        codocId: 'doc9',
        path: 'doc/existing/**',
        maintainedIn: 'code',
        generateSummary: true,
        confluence: {title: 'Doc existante', parentPageId: '555'},
        imagesDir: 'doc/img',
      },
    ])
    const result = findExistingImport(config, emptyState, '777', 'Doc existante')
    assert.deepEqual(result, {
      codocId: 'doc9',
      sourceFile: 'doc/existing',
      title: 'Doc existante',
      pageId: '777',
      matchedBy: 'config',
      parentPageId: '555',
      maintainedIn: 'code',
      imagesDir: 'doc/img',
    })
  })

  it("quand lock ET config existent pour le même codocId, la config fait foi (pas le lock, potentiellement obsolète)", () => {
    const state: PublishState = {
      lastPublished: '',
      pages: {
        doc5: {
          confluencePageId: '42',
          environment: 'default',
          title: 'Titre dans le lock (obsolète)',
          sourceFile: 'doc/old-path.md',
          publishedAt: '',
          maintainedIn: 'confluence',
        },
      },
    }
    const config = emptyConfig([
      {
        codocId: 'doc5',
        path: 'doc/new-path.md',
        maintainedIn: 'code',
        generateSummary: true,
        confluence: {title: 'Titre dans la config (à jour)', parentPageId: '10'},
        imagesDir: 'assets',
      },
    ])
    const result = findExistingImport(config, state, '42', 'Nouveau titre Confluence')
    assert.deepEqual(result, {
      codocId: 'doc5',
      sourceFile: 'doc/new-path.md',
      title: 'Titre dans la config (à jour)',
      pageId: '42',
      matchedBy: 'id',
      parentPageId: '10',
      maintainedIn: 'code',
      imagesDir: 'assets',
    })
  })
})
