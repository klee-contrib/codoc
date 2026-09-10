import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {ConfluenceClient} from '../../../src/clients/confluence/confluence-client.js'
import {getFolderRef} from '../../../src/services/confluence/folders.js'

function fakeClient(opts: {
  folder?: {id: string; title: string; parentId?: string}
  page?: {id: string; title: string; parentId?: string}
}): ConfluenceClient {
  return {
    folders: {
      get: async () => opts.folder,
    },
    pages: {
      fetchPage: async () => {
        if (!opts.page) throw new Error('404')
        return {...opts.page, storageXml: '', hasImages: false}
      },
    },
  } as unknown as ConfluenceClient
}

describe('getFolderRef', () => {
  it('résout un vrai dossier v2', async () => {
    const client = fakeClient({folder: {id: '1', title: 'Dossier', parentId: '0'}})
    assert.deepEqual(await getFolderRef(client, '1'), {id: '1', title: 'Dossier', parentId: '0', type: 'folder'})
  })

  it('résout en repli une page-dossier v1 quand le dossier v2 est introuvable', async () => {
    const client = fakeClient({page: {id: '2', title: 'Page-dossier', parentId: '0'}})
    assert.deepEqual(await getFolderRef(client, '2'), {id: '2', title: 'Page-dossier', parentId: '0', type: 'page'})
  })

  it('retourne undefined si ni dossier v2 ni page v1', async () => {
    const client = fakeClient({})
    assert.equal(await getFolderRef(client, '3'), undefined)
  })
})
