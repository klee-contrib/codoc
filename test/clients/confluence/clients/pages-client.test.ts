import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {ConfluencePagesClient} from '../../../../src/clients/confluence/clients/pages-client.js'
import type {ConfluenceHttp} from '../../../../src/clients/confluence/confluence-client.js'
import type {ConfluenceConfig} from '../../../../src/types/codoc-types.js'

type Call = {method: string; path: string; opts?: any}

function kyResponse(value: unknown): any {
  const p: any = Promise.resolve(value)
  p.json = async () => value
  p.text = async () => (typeof value === 'string' ? value : JSON.stringify(value))
  p.arrayBuffer = async () => value
  return p
}

function fakeHttp(handlers: {
  get?: (path: string, opts: any, callIndex: number) => unknown
  post?: (path: string, opts: any) => unknown
  put?: (path: string, opts: any) => unknown
}): {http: ConfluenceHttp; calls: Call[]} {
  const calls: Call[] = []
  const getCallCounts = new Map<string, number>()

  const v1 = {
    get: (path: string, opts?: any) => {
      calls.push({method: 'GET', path, opts})
      const i = getCallCounts.get(path) ?? 0
      getCallCounts.set(path, i + 1)
      return kyResponse(handlers.get?.(path, opts, i))
    },
    post: (path: string, opts?: any) => {
      calls.push({method: 'POST', path, opts})
      return kyResponse(handlers.post?.(path, opts))
    },
    put: (path: string, opts?: any) => {
      calls.push({method: 'PUT', path, opts})
      return kyResponse(handlers.put?.(path, opts))
    },
    delete: (path: string) => {
      calls.push({method: 'DELETE', path})
      return kyResponse(undefined)
    },
  }

  return {http: {baseUrl: 'https://example.atlassian.net', v1, v2: v1} as unknown as ConfluenceHttp, calls}
}

const config: ConfluenceConfig = {
  key: 'default',
  baseUrl: 'https://example.atlassian.net',
  username: 'u',
  apiToken: 't',
  spaceKey: 'DA',
  jira: {},
  drawio: {macroName: 'drawio'},
}

describe('ConfluencePagesClient.fetchChildren', () => {
  it("suit la pagination start/limit jusqu'à un batch incomplet (garde-fou contre la troncature silencieuse à 200)", async () => {
    const page1 = Array.from({length: 200}, (_, i) => ({id: String(i), title: `Page ${i}`}))
    const page2 = [{id: '200', title: 'Page 200'}, {id: '201', title: 'Page 201'}]

    const {http, calls} = fakeHttp({
      get: (_path, _opts, callIndex) => ({results: callIndex === 0 ? page1 : page2}),
    })
    const client = new ConfluencePagesClient(http, config)

    const result = await client.fetchChildren('123')

    assert.strictEqual(result.length, 202)
    assert.deepEqual(result[0], {id: '0', title: 'Page 0'})
    assert.deepEqual(result[201], {id: '201', title: 'Page 201'})

    const getCalls = calls.filter((c) => c.method === 'GET')
    assert.strictEqual(getCalls.length, 2)
    assert.strictEqual(getCalls[0].opts.searchParams.start, 0)
    assert.strictEqual(getCalls[1].opts.searchParams.start, 200)
  })

  it("s'arrête dès le premier batch incomplet (pas d'appel superflu)", async () => {
    const {http, calls} = fakeHttp({get: () => ({results: [{id: '1', title: 'Unique'}]})})
    const client = new ConfluencePagesClient(http, config)

    const result = await client.fetchChildren('123')

    assert.strictEqual(result.length, 1)
    assert.strictEqual(calls.filter((c) => c.method === 'GET').length, 1)
  })
})

describe('ConfluencePagesClient.findByTitle', () => {
  it("essaie les variantes d'apostrophe dans l'ordre et s'arrête à la première trouvée", async () => {
    const {http, calls} = fakeHttp({
      get: (_path, opts) => {
        const variant = opts.searchParams.title as string
        return {results: variant.includes('’') ? [{id: '42', title: variant}] : []}
      },
    })
    const client = new ConfluencePagesClient(http, config)

    const result = await client.findByTitle("Guide de l'utilisateur")

    assert.deepEqual(result, {id: '42', title: "Guide de l’utilisateur"})
    assert.strictEqual(calls.length, 2)
  })

  it('retourne undefined si aucune variante ne matche', async () => {
    const {http} = fakeHttp({get: () => ({results: []})})
    const client = new ConfluencePagesClient(http, config)

    assert.strictEqual(await client.findByTitle('Introuvable'), undefined)
  })
})

describe('ConfluencePagesClient.exists / testConnection', () => {
  it('exists renvoie true si la requête réussit', async () => {
    const {http} = fakeHttp({get: () => ({id: '1'})})
    const client = new ConfluencePagesClient(http, config)
    assert.strictEqual(await client.exists('1'), true)
  })

  it("exists renvoie false sur n'importe quelle erreur (404, réseau, auth...) - comportement actuel documenté, pas de distinction de cause", async () => {
    const http: ConfluenceHttp = {
      baseUrl: 'https://x',
      v1: {
        get: () => {
          throw new Error('network down')
        },
      },
      v2: {},
    } as unknown as ConfluenceHttp
    const client = new ConfluencePagesClient(http, config)
    assert.strictEqual(await client.exists('1'), false)
  })
})

describe('ConfluencePagesClient.create', () => {
  it('utilise defaultParentPageId de la config si aucun parentId explicite', async () => {
    const {http, calls} = fakeHttp({post: () => ({id: 'new-id'})})
    const client = new ConfluencePagesClient(http, {...config, defaultParentPageId: '999'})

    await client.create('Titre', '<p/>')

    const postCall = calls.find((c) => c.method === 'POST')!
    assert.deepEqual(postCall.opts.json.ancestors, [{id: '999'}])
  })

  it('un parentId explicite prend le pas sur defaultParentPageId', async () => {
    const {http, calls} = fakeHttp({post: () => ({id: 'new-id'})})
    const client = new ConfluencePagesClient(http, {...config, defaultParentPageId: '999'})

    await client.create('Titre', '<p/>', 111)

    const postCall = calls.find((c) => c.method === 'POST')!
    assert.deepEqual(postCall.opts.json.ancestors, [{id: '111'}])
  })
})
