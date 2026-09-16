import assert from 'node:assert/strict'
import zlib from 'node:zlib'
import {describe, it} from 'node:test'

import {extractGraphModel} from '../../../../../src/services/conversion/confluenceToMarkdown/diagrams/drawio-to-image.js'

describe('extractGraphModel', () => {
  it('extrait le XML en clair tel quel quand <mxGraphModel> est déjà présent', () => {
    const drawio = '<mxfile><diagram id="x">ignoré ici</diagram><mxGraphModel><root><mxCell id="0"/></root></mxGraphModel></mxfile>'
    const result = extractGraphModel(drawio)
    assert.strictEqual(result, '<mxGraphModel><root><mxCell id="0"/></root></mxGraphModel>')
  })

  it('décompresse un payload <diagram> deflate+base64+URI-encodé (format natif de l\'app draw.io)', () => {
    const xml = '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel>'
    const compressed = zlib.deflateRawSync(encodeURIComponent(xml)).toString('base64')
    const drawio = `<mxfile><diagram id="abc" name="Page-1">${compressed}</diagram></mxfile>`

    assert.strictEqual(extractGraphModel(drawio), xml)
  })

  it('retombe sur le payload compressé si <mxGraphModel> est présent mais jamais refermé', () => {
    const xml = '<mxGraphModel><root><mxCell id="0"/></root></mxGraphModel>'
    const compressed = zlib.deflateRawSync(encodeURIComponent(xml)).toString('base64')
    const drawio = `<mxfile><mxGraphModel tronqué <diagram id="abc">${compressed}</diagram></mxfile>`
    assert.strictEqual(extractGraphModel(drawio), xml)
  })

  it("lève une erreur claire si ni XML en clair ni payload compressé ne sont reconnaissables", () => {
    assert.throws(() => extractGraphModel('<mxfile><diagram id="x">pas-du-base64-valide !!</diagram></mxfile>'), /mxGraphModel/)
  })

  it("lève une erreur claire sur une entrée sans balise <diagram> ni <mxGraphModel>", () => {
    assert.throws(() => extractGraphModel('<mxfile></mxfile>'), /mxGraphModel/)
  })
})
