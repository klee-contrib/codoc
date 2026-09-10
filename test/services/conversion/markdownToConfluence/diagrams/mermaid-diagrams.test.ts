import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {manageMermaidsInMarkdownFile} from '../../../../../src/services/conversion/markdownToConfluence/diagrams/mermaid-diagrams.js'
import {DrawioConfig} from '../../../../../src/types/codoc-types.js'

const cfg: DrawioConfig = {macroName: 'drawio'}

describe('manageMermaidsInMarkdownFile', () => {
  it("détecte et convertit un bloc ```mermaid terminé en LF", () => {
    const md = '# Titre\n\n```mermaid\nflowchart LR\n  A["a"]\n```\n'
    const r = manageMermaidsInMarkdownFile(md, 'diagram', cfg, 'doc/x.md')
    assert.strictEqual(r.attachments.length, 1)
    assert.match(r.attachments[0].content, /<mxfile/)
    assert.match(r.markdown, /drawio/)
  })

  it("détecte et convertit un bloc ```mermaid terminé en CRLF (fichier généré/checkouté avec core.autocrlf)", () => {
    const md = '# Titre\r\n\r\n```mermaid\r\nflowchart LR\r\n  A["a"]\r\n```\r\n'
    const r = manageMermaidsInMarkdownFile(md, 'diagram', cfg, 'doc/x.md')
    assert.strictEqual(r.attachments.length, 1)
    assert.match(r.attachments[0].content, /<mxfile/)
    assert.match(r.markdown, /drawio/)
  })

  it("ne fait rien si aucun bloc mermaid n'est présent", () => {
    const md = '# Titre\n\nRien à voir ici.\n'
    const r = manageMermaidsInMarkdownFile(md, 'diagram', cfg, 'doc/x.md')
    assert.strictEqual(r.attachments.length, 0)
    assert.strictEqual(r.markdown, md)
  })
})
