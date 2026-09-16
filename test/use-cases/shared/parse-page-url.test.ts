import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {parsePageUrl} from '../../../src/use-cases/shared/parse-page-url.js'

describe('parsePageUrl', () => {
  it('extracts id, domain and spaceKey from a full Confluence URL', () => {
    const r = parsePageUrl('https://acme.atlassian.net/wiki/spaces/DA/pages/5875073026/Titre')
    assert.deepStrictEqual(r, {pageId: '5875073026', domain: 'acme.atlassian.net', spaceKey: 'DA'})
  })

  it('flags a /folder/ URL with isFolder, and still extracts spaceKey', () => {
    const r = parsePageUrl('https://acme.atlassian.net/wiki/spaces/DA/folder/4394746322')
    assert.deepStrictEqual(r, {pageId: '4394746322', domain: 'acme.atlassian.net', isFolder: true, spaceKey: 'DA'})
  })

  it('trims surrounding whitespace', () => {
    const r = parsePageUrl('  https://acme.atlassian.net/wiki/spaces/DA/pages/42/Titre  ')
    assert.deepStrictEqual(r, {pageId: '42', domain: 'acme.atlassian.net', spaceKey: 'DA'})
  })

  it('extracts id/domain without spaceKey when the URL has no /spaces/ segment', () => {
    const r = parsePageUrl('https://acme.atlassian.net/wiki/pages/42/Titre')
    assert.deepStrictEqual(r, {pageId: '42', domain: 'acme.atlassian.net'})
  })

  it('rejects a bare numeric id (URL required)', () => {
    assert.throws(() => parsePageUrl('5875073026'), /Entrée invalide/)
  })

  it('throws on a non-numeric, non-URL input', () => {
    assert.throws(() => parsePageUrl('not-an-id'), /Entrée invalide/)
  })

  it('rejects a URL without a /pages/<id> segment', () => {
    assert.throws(() => parsePageUrl('https://acme.atlassian.net/wiki/spaces/DA'), /Aucun ID de page trouvé/)
  })
})
