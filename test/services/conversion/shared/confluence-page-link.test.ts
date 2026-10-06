import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {resolveConfluencePageLink} from '../../../../src/services/conversion/shared/confluence-page-link.js'

const SOURCE_FILE = 'doc/golden.md'

describe('resolveConfluencePageLink', () => {
  it('hit : renvoie l’URL renvoyée par le resolver, avec le chemin normalisé attendu', () => {
    let calledWith: string | undefined
    const resolver = (sourceFile: string) => {
      calledWith = sourceFile
      return 'https://example.atlassian.net/wiki/spaces/DOC/pages/1/Autre'
    }
    const url = resolveConfluencePageLink('../docs/autre.md', SOURCE_FILE, resolver)
    assert.strictEqual(url, 'https://example.atlassian.net/wiki/spaces/DOC/pages/1/Autre')
    assert.strictEqual(calledWith, 'docs/autre.md') // même convention que PageState.sourceFile
  })

  it('miss (resolver renvoie undefined) : renvoie undefined, l’appelant se rabat sur GitLab', () => {
    const url = resolveConfluencePageLink('../docs/brouillon.md', SOURCE_FILE, () => undefined)
    assert.strictEqual(url, undefined)
  })

  it('resolver absent (hors contexte sync) : renvoie undefined sans appeler quoi que ce soit', () => {
    const url = resolveConfluencePageLink('../docs/autre.md', SOURCE_FILE, undefined)
    assert.strictEqual(url, undefined)
  })

  it("cible non-.md (ex. lien vers du code source) : renvoie undefined, le resolver n'est pas appelé", () => {
    let called = false
    const url = resolveConfluencePageLink('../src/index.ts', SOURCE_FILE, () => {
      called = true
      return 'https://should-not-be-used'
    })
    assert.strictEqual(url, undefined)
    assert.strictEqual(called, false)
  })

  it('URL absolue en .md (ex. https://.../fichier.md) : jamais traitée comme un lien local', () => {
    let called = false
    const url = resolveConfluencePageLink('https://example.com/doc.md', SOURCE_FILE, () => {
      called = true
      return 'https://should-not-be-used'
    })
    assert.strictEqual(url, undefined)
    assert.strictEqual(called, false)
  })

  it('un .md ciblé par une ancre (#section) est bien reconnu comme .md - le fragment est abandonné sur un hit', () => {
    const url = resolveConfluencePageLink('../docs/autre.md#ma-section', SOURCE_FILE, () => 'https://conf/autre')
    assert.strictEqual(url, 'https://conf/autre')
  })
})
