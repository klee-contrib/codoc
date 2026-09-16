import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {ConfluenceAttachmentsClient} from '../../../../src/clients/confluence/clients/attachments-client.js'
import type {ConfluenceHttp} from '../../../../src/clients/confluence/confluence-client.js'

function fakeHttp(getResult: unknown): ConfluenceHttp {
  return {
    baseUrl: 'https://example.atlassian.net',
    v1: {get: () => ({json: async () => getResult})},
    v2: {},
  } as unknown as ConfluenceHttp
}

describe('ConfluenceAttachmentsClient.find', () => {
  it('retourne undefined si aucune pièce jointe ne matche le nom', async () => {
    const client = new ConfluenceAttachmentsClient(fakeHttp({results: []}))
    assert.strictEqual(await client.find('1', 'x.png'), undefined)
  })

  it("retourne undefined si le résultat trouvé n'a pas de lien de téléchargement (_links.download)", async () => {
    const client = new ConfluenceAttachmentsClient(fakeHttp({results: [{id: '9', _links: {}}]}))
    assert.strictEqual(await client.find('1', 'x.png'), undefined)
  })

  it('retourne id/filename/downloadPath quand la pièce jointe est trouvée avec un lien valide', async () => {
    const client = new ConfluenceAttachmentsClient(fakeHttp({results: [{id: 9, _links: {download: '/download/x.png?v=1'}}]}))
    const result = await client.find('1', 'x.png')
    assert.deepEqual(result, {id: '9', filename: 'x.png', downloadPath: '/download/x.png?v=1'})
  })
})
