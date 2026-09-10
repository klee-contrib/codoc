import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {slugify} from '../../src/services/slugify.js'

describe('slugify', () => {
  it('lowercases and replaces non-alphanumerics with hyphens', () => {
    assert.strictEqual(slugify('Bon de livraison'), 'bon-de-livraison')
  })

  it('strips diacritics (accents)', () => {
    assert.strictEqual(slugify('Dépositaire'), 'depositaire')
    assert.strictEqual(slugify('éà ç'), 'ea-c')
  })

  it('trims leading and trailing separators', () => {
    assert.strictEqual(slugify('  --Hello, World!--  '), 'hello-world')
  })

  it('collapses runs of separators into a single hyphen', () => {
    assert.strictEqual(slugify('a___b   c'), 'a-b-c')
  })
})
