import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {parsePageInput} from '../../../src/use-cases/pull/parse-page-input.js'

describe('parsePageInput', () => {
  it('accepts a raw numeric id (no domain)', () => {
    assert.deepStrictEqual(parsePageInput('5875073026'), {pageId: '5875073026'})
  })

  it('extracts id and domain from a full Confluence URL', () => {
    const r = parsePageInput('https://acme.atlassian.net/wiki/spaces/DA/pages/5875073026/Titre')
    assert.deepStrictEqual(r, {pageId: '5875073026', domain: 'acme.atlassian.net'})
  })

  it('flags a /folder/ URL with isFolder', () => {
    const r = parsePageInput('https://acme.atlassian.net/wiki/spaces/DA/folder/4394746322')
    assert.deepStrictEqual(r, {pageId: '4394746322', domain: 'acme.atlassian.net', isFolder: true})
  })

  it('trims surrounding whitespace', () => {
    assert.deepStrictEqual(parsePageInput('  42  '), {pageId: '42'})
  })

  it('throws on a non-numeric, non-URL input', () => {
    assert.throws(() => parsePageInput('not-an-id'), /Entrée invalide/)
  })

  it('rejects a URL without a /pages/<id> segment (caught → "Entrée invalide")', () => {
    assert.throws(() => parsePageInput('https://acme.atlassian.net/wiki/spaces/DA'), /Entrée invalide/)
  })
})
