import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {convertMarkdownToConfluence} from '../../../../src/services/conversion/markdownToConfluence/index.js'
import {manageExcerptsInMarkdown} from '../../../../src/services/conversion/markdownToConfluence/excerpts.js'

describe('manageExcerptsInMarkdown', () => {
  const render = (md: string) => `[[${md}]]`

  it('remplace un bloc <!-- excerpt --> par une sentinelle', () => {
    const md = 'Avant\n\n<!-- excerpt -->\nContenu\n<!-- /excerpt -->\n\nAprès'
    const r = manageExcerptsInMarkdown(md, render)
    assert.match(r, /data-confluence-macro="/)
    assert.match(r, /Avant/)
    assert.match(r, /Après/)
    assert.doesNotMatch(r, /<!--\s*excerpt/)
    assert.doesNotMatch(r, /\/excerpt/)
  })

  it("ne modifie pas le markdown si aucun extrait n'est présent", () => {
    const md = '# Titre\n\nRien à voir ici.\n'
    assert.strictEqual(manageExcerptsInMarkdown(md, render), md)
  })

  it('gère plusieurs extraits distincts dans le même document', () => {
    const md = '<!-- excerpt -->A<!-- /excerpt -->\n\ntexte\n\n<!-- excerpt -->B<!-- /excerpt -->'
    const r = manageExcerptsInMarkdown(md, render)
    assert.strictEqual((r.match(/data-confluence-macro="/g) ?? []).length, 2)
  })
})

describe('convertMarkdownToConfluence - extraits', () => {
  it('enveloppe le contenu marqué dans une macro Confluence "excerpt"', () => {
    const md = [
      '# CVE',
      '',
      '<!-- excerpt -->',
      '',
      '> Nombre de CVEs : 2 vulnérabilité(s).',
      '',
      '| CVE | Criticité |',
      '| --- | --- |',
      '| CVE-2024-1 | HIGH |',
      '',
      '<!-- /excerpt -->',
      '',
      'Reste de la page.',
    ].join('\n')

    const xml = convertMarkdownToConfluence(md)

    assert.match(xml, /<ac:structured-macro ac:name="excerpt" ac:schema-version="1">/)
    assert.match(xml, /<ac:rich-text-body>/)
    assert.match(xml, /Nombre de CVEs : 2/)
    assert.match(xml, /<table>/)
    assert.match(xml, /CVE-2024-1/)
    assert.match(xml, /Reste de la page/)
    assert.doesNotMatch(xml, /<!--/)
    assert.doesNotMatch(xml, /data-confluence-macro/) // sentinelle bien résorbée
  })

  it('nomme la macro quand un nom est fourni (<!-- excerpt:nom -->)', () => {
    const xml = convertMarkdownToConfluence('<!-- excerpt:cve-summary -->\nTexte\n<!-- /excerpt -->')
    assert.match(xml, /<ac:parameter ac:name="name">cve-summary<\/ac:parameter>/)
  })

  it('supporte une ligne vide interne (contenu multi-blocs) sans casser la sentinelle', () => {
    const md = [
      '<!-- excerpt -->',
      '',
      'Paragraphe 1.',
      '',
      'Paragraphe 2.',
      '',
      '<!-- /excerpt -->',
    ].join('\n')

    const xml = convertMarkdownToConfluence(md)
    assert.match(xml, /ac:name="excerpt"/)
    assert.match(xml, /Paragraphe 1/)
    assert.match(xml, /Paragraphe 2/)
  })

  it("laisse la page inchangée quand aucun extrait n'est présent", () => {
    const xml = convertMarkdownToConfluence('# Titre\n\nParagraphe normal.')
    assert.doesNotMatch(xml, /ac:name="excerpt"/)
    assert.match(xml, /<h1>Titre<\/h1>/)
  })
})
