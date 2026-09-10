import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {ConfluenceClient} from '../../../src/clients/confluence/confluence-client.js'
import {createOrUpdatePage, createPageOrThrowConflict} from '../../../src/services/confluence/pages.js'

function titleConflictError(): Error & {response: {status: number; text: () => Promise<string>}} {
  const err = new Error('400') as Error & {response: {status: number; text: () => Promise<string>}}
  err.response = {status: 400, text: async () => 'A page with this title already exists'}
  return err
}

function fakeClient(opts: {found?: {id: string}; createFails?: boolean; update?: (id: string) => any}): ConfluenceClient {
  return {
    configuration: {baseUrl: 'https://example.atlassian.net', spaceKey: 'DA'},
    pages: {
      create: async () => {
        if (opts.createFails) throw titleConflictError()
        return {id: 'new-page-id'}
      },
      findByTitle: async () => opts.found,
      update: async (id: string) => (opts.update ?? ((i: string) => ({id: i})))(id),
    },
  } as unknown as ConfluenceClient
}

describe('createPageOrThrowConflict', () => {
  it("crée directement la page en l'absence de conflit", async () => {
    const client = fakeClient({})
    const result = await createPageOrThrowConflict(client, 'Titre', '<xml/>')
    assert.deepEqual(result, {id: 'new-page-id'})
  })

  it("lève l'erreur de conflit habituelle si aucun onTitleConflict n'est fourni", async () => {
    const client = fakeClient({createFails: true, found: {id: '999'}})
    await assert.rejects(
      () => createPageOrThrowConflict(client, 'Titre', '<xml/>'),
      /existe déjà quelque part dans Confluence/,
    )
  })

  it("lève l'erreur de conflit si onTitleConflict refuse l'adoption", async () => {
    const client = fakeClient({createFails: true, found: {id: '999'}})
    await assert.rejects(
      () => createPageOrThrowConflict(client, 'Titre', '<xml/>', undefined, async () => false),
      /existe déjà quelque part dans Confluence/,
    )
  })

  it("adopte la page trouvée (update dessus) si onTitleConflict confirme", async () => {
    const client = fakeClient({createFails: true, found: {id: '999'}})
    let updatedId: string | undefined
    const onTitleConflict = async (existingPageId: string, existingUrl: string) => {
      updatedId = existingPageId
      assert.match(existingUrl, /999/)
      return true
    }

    const result = await createPageOrThrowConflict(client, 'Titre', '<xml/>', undefined, onTitleConflict)

    assert.strictEqual(updatedId, '999')
    assert.deepEqual(result, {id: '999'})
  })

  it("ne propose jamais l'adoption si la page en conflit est introuvable par titre (silencieuse interdite par construction)", async () => {
    const client = fakeClient({createFails: true, found: undefined})
    const onTitleConflict = async () => true
    await assert.rejects(
      () => createPageOrThrowConflict(client, 'Titre', '<xml/>', undefined, onTitleConflict),
      /n'a pas pu être retrouvée par titre/,
    )
  })
})

describe('createOrUpdatePage', () => {
  it('propage onTitleConflict jusque dans le repli création (update -> 404 -> create en conflit)', async () => {
    const client = {
      configuration: {baseUrl: 'https://example.atlassian.net', spaceKey: 'DA'},
      pages: {
        create: async () => {
          throw titleConflictError()
        },
        findByTitle: async () => ({id: '999'}),
        update: async (id: string) => {
          if (id === 'stale-id') {
            const err = new Error('404') as Error & {response: {status: number}}
            err.response = {status: 404}
            throw err
          }
          return {id}
        },
      },
    } as unknown as ConfluenceClient

    const result = await createOrUpdatePage(client, 'Titre', '<xml/>', undefined, 'stale-id', async () => true)

    assert.deepEqual(result, {id: '999'})
  })
})
