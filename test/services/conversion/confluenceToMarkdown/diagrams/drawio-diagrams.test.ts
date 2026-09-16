import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {describe, it} from 'node:test'

import {convertDrawioBlocksToImages} from '../../../../../src/services/conversion/confluenceToMarkdown/diagrams/drawio-diagrams.js'

function tmpImagesDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codoc-drawio-images-'))
}

const CLASSIC_MACRO = (name: string) =>
  `<ac:structured-macro ac:name="drawio"><ac:parameter ac:name="attachment">${name}</ac:parameter></ac:structured-macro>`

const ADF_BLOCK = (name: string) =>
  `<ac:adf-extension>drawio<ac:adf-attribute key="diagram-name">${name}</ac:adf-parameter></ac:adf-extension>`

describe('convertDrawioBlocksToImages', () => {
  it("ne fait rien (ni fetch ni dossier créé) si aucun bloc draw.io n'est présent", async () => {
    const xml = '<p>Rien à voir ici</p>'
    const imagesDir = path.join(os.tmpdir(), `codoc-drawio-never-created-${Date.now()}`)
    const result = await convertDrawioBlocksToImages(xml, async () => {
      throw new Error("fetchAttachment ne doit jamais être appelé s'il n'y a aucun bloc")
    }, imagesDir, undefined)

    assert.strictEqual(result, xml)
    assert.strictEqual(fs.existsSync(imagesDir), false)
  })

  it("ne fait rien si des blocs existent mais qu'aucun imagesDir n'est fourni (mêmes conventions que pour les autres images)", async () => {
    const xml = `<p>avant</p>${CLASSIC_MACRO('a.drawio')}<p>après</p>`
    const result = await convertDrawioBlocksToImages(xml, async () => {
      throw new Error('fetchAttachment ne doit jamais être appelé sans imagesDir')
    }, undefined, undefined)

    assert.strictEqual(result, xml)
  })

  it("préserve le bloc tel quel (xml inchangé) si la pièce jointe est introuvable, et crée bien imagesDir", async () => {
    const imagesDir = tmpImagesDir()
    fs.rmSync(imagesDir, {recursive: true, force: true})
    const xml = `<p>avant</p>${CLASSIC_MACRO('a.drawio')}<p>après</p>`

    const result = await convertDrawioBlocksToImages(xml, async () => undefined, imagesDir, undefined)

    assert.strictEqual(result, xml)
    assert.strictEqual(fs.existsSync(imagesDir), true)
    fs.rmSync(imagesDir, {recursive: true, force: true})
  })

  it("préserve le bloc tel quel si le téléchargement de la pièce jointe échoue (exception), sans jamais planter", async () => {
    const imagesDir = tmpImagesDir()
    const xml = `<p>avant</p>${CLASSIC_MACRO('a.drawio')}<p>après</p>`

    const result = await convertDrawioBlocksToImages(
      xml,
      async () => {
        throw new Error('503 Service Unavailable')
      },
      imagesDir,
      undefined,
    )

    assert.strictEqual(result, xml)
    fs.rmSync(imagesDir, {recursive: true, force: true})
  })

  it('détecte les deux formats de bloc (macro classique + extension ADF) et interroge fetchAttachment pour chacun, dans l\'ordre du document', async () => {
    const imagesDir = tmpImagesDir()
    const xml = `<p>avant</p>${CLASSIC_MACRO('a.drawio')}<p>milieu</p>${ADF_BLOCK('b.drawio')}<p>après</p>`
    const requested: string[] = []

    const result = await convertDrawioBlocksToImages(
      xml,
      async (filename) => {
        requested.push(filename)
        return undefined
      },
      imagesDir,
      undefined,
    )

    assert.deepEqual(requested, ['a.drawio', 'b.drawio'])
    assert.strictEqual(result, xml)
    fs.rmSync(imagesDir, {recursive: true, force: true})
  })
})
