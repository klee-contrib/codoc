import assert from 'node:assert/strict'
import fs from 'node:fs'
import {describe, it} from 'node:test'

import {STATE_FILE} from '../../../src/config/codoc-paths.js'
import {findLockedRef, loadPublishState, makePageState, savePublishState} from '../../../src/services/lock/lock-file.js'
import type {PublishState} from '../../../src/services/lock/lock-file.js'

describe('makePageState', () => {
  it('construit un PageState complet à partir des champs requis', () => {
    const state = makePageState({
      pageId: '123',
      environment: 'default',
      title: 'Titre',
      url: 'https://x/wiki/spaces/DA/pages/123',
      sourceFile: 'doc/x.md',
      maintainedIn: 'code',
      publishedAt: '2026-01-01T00:00:00.000Z',
    })
    assert.deepEqual(state, {
      confluencePageId: '123',
      environment: 'default',
      title: 'Titre',
      confluenceUrl: 'https://x/wiki/spaces/DA/pages/123',
      sourceFile: 'doc/x.md',
      publishedAt: '2026-01-01T00:00:00.000Z',
      maintainedIn: 'code',
    })
  })

  it("n'ajoute la clé isFolder que si true (jamais isFolder: false en dur)", () => {
    const withoutFolder = makePageState({
      pageId: '1',
      environment: 'default',
      title: 'T',
      sourceFile: 'doc/x.md',
      maintainedIn: 'code',
      publishedAt: '2026-01-01T00:00:00.000Z',
    })
    assert.strictEqual('isFolder' in withoutFolder, false)

    const withFolder = makePageState({
      pageId: '1',
      environment: 'default',
      title: 'T',
      sourceFile: 'doc/x.md',
      maintainedIn: 'code',
      publishedAt: '2026-01-01T00:00:00.000Z',
      isFolder: true,
    })
    assert.strictEqual(withFolder.isFolder, true)
  })

  it('omet confluenceUrl si url absente (jamais confluenceUrl: undefined explicite)', () => {
    const state = makePageState({
      pageId: '1',
      environment: 'default',
      title: 'T',
      sourceFile: 'doc/x.md',
      maintainedIn: 'confluence',
      publishedAt: '2026-01-01T00:00:00.000Z',
    })
    assert.strictEqual(state.confluenceUrl, undefined)
  })
})

describe('findLockedRef', () => {
  const lock: PublishState = {
    lastPublished: '2026-01-01T00:00:00.000Z',
    pages: {
      a1: {
        confluencePageId: '111',
        environment: 'default',
        title: 'Page A',
        confluenceUrl: 'https://x/a',
        sourceFile: 'doc/a.md',
        publishedAt: '2026-01-01T00:00:00.000Z',
        maintainedIn: 'code',
      },
      a2: {
        confluencePageId: '111',
        environment: 'preprod',
        title: 'Page A (preprod)',
        sourceFile: 'doc/a.md',
        publishedAt: '2026-01-01T00:00:00.000Z',
        maintainedIn: 'code',
      },
      folder1: {
        confluencePageId: '222',
        environment: 'default',
        title: 'Dossier',
        sourceFile: 'doc/folder',
        publishedAt: '2026-01-01T00:00:00.000Z',
        maintainedIn: 'code',
        isFolder: true,
        children: [{title: 'Enfant', confluencePageId: '333', sourceFile: 'doc/folder/child.md'}],
      },
    },
  }

  it("trouve une entrée racine par (env, sourceFile)", () => {
    const ref = findLockedRef(lock, 'default', 'doc/a.md')
    assert.deepEqual(ref, {confluencePageId: '111', confluenceUrl: 'https://x/a', title: 'Page A'})
  })

  it("distingue le même sourceFile selon l'environnement (deux entrées possibles pour un seul chemin)", () => {
    const ref = findLockedRef(lock, 'preprod', 'doc/a.md')
    assert.strictEqual(ref?.title, 'Page A (preprod)')
  })

  it("trouve un enfant de dossier par sourceFile, sans confondre avec la racine du dossier", () => {
    const ref = findLockedRef(lock, 'default', 'doc/folder/child.md')
    assert.deepEqual(ref, {confluencePageId: '333', confluenceUrl: undefined, title: 'Enfant'})
  })

  it("retourne undefined si l'environnement ne correspond à rien", () => {
    assert.strictEqual(findLockedRef(lock, 'inexistant', 'doc/a.md'), undefined)
  })

  it("retourne undefined si le sourceFile ne correspond à rien (ni racine ni enfant)", () => {
    assert.strictEqual(findLockedRef(lock, 'default', 'doc/inconnu.md'), undefined)
  })
})

describe('loadPublishState / savePublishState (round-trip réel sur STATE_FILE)', () => {
  it('un état sauvegardé est relu à l\'identique (cache) et persiste bien tel quel sur disque', () => {
    const before = fs.existsSync(STATE_FILE) ? fs.readFileSync(STATE_FILE, 'utf8') : undefined
    try {
      const state: PublishState = {
        lastPublished: '2026-01-01T00:00:00.000Z',
        pages: {
          test1: {
            confluencePageId: '999',
            environment: 'default',
            title: 'Test lock-file',
            sourceFile: 'doc/test-lock-file.md',
            publishedAt: '2026-01-01T00:00:00.000Z',
            maintainedIn: 'code',
          },
        },
      }
      savePublishState(state)

      assert.deepEqual(loadPublishState(), state)

      const onDisk = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) as PublishState
      assert.deepEqual(onDisk, state)
    } finally {
      if (before === undefined) fs.rmSync(STATE_FILE, {force: true})
      else fs.writeFileSync(STATE_FILE, before)
    }
  })
})
