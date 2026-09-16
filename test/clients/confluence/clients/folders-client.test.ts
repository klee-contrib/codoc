import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {ConfluenceFoldersClient} from '../../../../src/clients/confluence/clients/folders-client.js'
import type {ConfluenceHttp} from '../../../../src/clients/confluence/confluence-client.js'

function kyResponse(value: unknown): any {
  const p: any = Promise.resolve(value)
  p.json = async () => value
  return p
}

type Call = {path: string; opts?: any}

function fakeHttp(opts: {
  v1Get?: (path: string, opts: any, callIndex: number) => unknown
  v2Get?: (path: string, opts: any, callIndex: number) => unknown
}): {http: ConfluenceHttp; v1Calls: Call[]; v2Calls: Call[]} {
  const v1Calls: Call[] = []
  const v2Calls: Call[] = []
  const v1Counts = new Map<string, number>()
  const v2Counts = new Map<string, number>()

  const v1 = {
    get: (path: string, o?: any) => {
      v1Calls.push({path, opts: o})
      const i = v1Counts.get(path) ?? 0
      v1Counts.set(path, i + 1)
      return kyResponse(opts.v1Get?.(path, o, i))
    },
  }
  const v2 = {
    get: (path: string, o?: any) => {
      v2Calls.push({path, opts: o})
      const i = v2Counts.get(path) ?? 0
      v2Counts.set(path, i + 1)
      return kyResponse(opts.v2Get?.(path, o, i))
    },
    post: (path: string, o?: any) => {
      v2Calls.push({path, opts: o})
      return kyResponse({id: 'created-id'})
    },
    delete: (path: string) => {
      v2Calls.push({path})
      return kyResponse(undefined)
    },
  }

  return {http: {baseUrl: 'https://example.atlassian.net', v1, v2} as unknown as ConfluenceHttp, v1Calls, v2Calls}
}

describe('ConfluenceFoldersClient.children', () => {
  it('suit la pagination par curseur (_links.next) jusqu\'à son absence', async () => {
    const {http, v2Calls} = fakeHttp({
      v2Get: (_path, _opts, i) =>
        i === 0
          ? {
              results: [{id: '1', title: 'A', type: 'page'}, {id: '2', title: 'B', type: 'page'}],
              _links: {next: '/rest/api/v2/folders/root/direct-children?cursor=abc123&limit=250'},
            }
          : {results: [{id: '3', title: 'C', type: 'folder'}]},
    })
    const client = new ConfluenceFoldersClient(http)

    const result = await client.children('root')

    assert.strictEqual(result.length, 3)
    assert.deepEqual(result[2], {id: '3', title: 'C', type: 'folder'})
    assert.strictEqual(v2Calls.length, 2)
    assert.strictEqual(v2Calls[0].opts.searchParams.cursor, undefined)
    assert.strictEqual(v2Calls[1].opts.searchParams.cursor, 'abc123')
  })

  it("s'arrête dès qu'il n'y a plus de _links.next (pas d'appel superflu)", async () => {
    const {http, v2Calls} = fakeHttp({v2Get: () => ({results: [{id: '1', title: 'A', type: 'page'}]})})
    const client = new ConfluenceFoldersClient(http)

    const result = await client.children('root')

    assert.strictEqual(result.length, 1)
    assert.strictEqual(v2Calls.length, 1)
  })
})

describe('ConfluenceFoldersClient.findByTitleUnderParent', () => {
  it('échappe guillemets et antislashs dans la clause CQL', async () => {
    const {http, v1Calls} = fakeHttp({v1Get: () => ({results: []})})
    const client = new ConfluenceFoldersClient(http)

    await client.findByTitleUnderParent('10', 'Dossier "spécial"\\ok')

    const cql = v1Calls[0].opts.searchParams.cql as string
    assert.match(cql, /title = "Dossier \\"spécial\\"\\\\ok"/)
  })

  it("n'accepte que les correspondances exactes (2 résultats homonymes = pas de correspondance)", async () => {
    const {http} = fakeHttp({
      v1Get: () => ({results: [{content: {id: '1', title: 'X'}}, {content: {id: '2', title: 'X'}}]}),
    })
    const client = new ConfluenceFoldersClient(http)

    assert.strictEqual(await client.findByTitleUnderParent('10', 'X'), undefined)
  })

  it("essaie la variante suivante si la première ne trouve rien", async () => {
    const {http, v1Calls} = fakeHttp({
      v1Get: (_path, opts) => {
        const cql = opts.searchParams.cql as string
        return {results: cql.includes('’') ? [{content: {id: '5', title: "Dossier d’équipe"}}] : []}
      },
    })
    const client = new ConfluenceFoldersClient(http)

    const result = await client.findByTitleUnderParent('10', "Dossier d'équipe")

    assert.deepEqual(result, {id: '5', title: "Dossier d’équipe"})
    assert.strictEqual(v1Calls.length, 2)
  })
})

describe('ConfluenceFoldersClient.exists / get', () => {
  it('get renvoie undefined (jamais une exception) si le dossier est introuvable', async () => {
    const http: ConfluenceHttp = {
      baseUrl: 'https://x',
      v1: {},
      v2: {
        get: () => {
          const err = new Error('404') as Error & {response: {status: number}}
          err.response = {status: 404}
          throw err
        },
      },
    } as unknown as ConfluenceHttp
    const client = new ConfluenceFoldersClient(http)

    assert.strictEqual(await client.get('missing'), undefined)
  })

  it('get retourne id/title/parentId à partir de la réponse v2', async () => {
    const {http} = fakeHttp({v2Get: () => ({id: 7, title: 'Dossier', parentId: 3})})
    const client = new ConfluenceFoldersClient(http)

    assert.deepEqual(await client.get('7'), {id: '7', title: 'Dossier', parentId: '3'})
  })
})

describe('ConfluenceFoldersClient.getSpaceId', () => {
  it("lève une erreur explicite si l'espace est introuvable (pas un throw ky brut)", async () => {
    const {http} = fakeHttp({v2Get: () => ({results: []})})
    const client = new ConfluenceFoldersClient(http)

    await assert.rejects(() => client.getSpaceId('NOPE'), /Space "NOPE" introuvable/)
  })

  it("retourne l'id de l'espace trouvé", async () => {
    const {http} = fakeHttp({v2Get: () => ({results: [{id: '999'}]})})
    const client = new ConfluenceFoldersClient(http)

    assert.strictEqual(await client.getSpaceId('DA'), '999')
  })
})
