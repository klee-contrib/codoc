import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {describe, it} from 'node:test'

import {writeFile} from '../../src/services/files-service.js'

function tmpFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codoc-files-service-'))
  return path.join(dir, 'out.txt')
}

describe('writeFile', () => {
  it('écrit les fins de ligne alignées sur os.EOL, pas en dur en LF', () => {
    const file = tmpFile()

    writeFile(file, 'ligne1\nligne2\nligne3')

    const raw = fs.readFileSync(file, 'utf8')
    assert.strictEqual(raw, `ligne1${os.EOL}ligne2${os.EOL}ligne3`)
  })

  it('ne double pas les fins de ligne si le contenu contient déjà du CRLF', () => {
    const file = tmpFile()

    writeFile(file, 'ligne1\r\nligne2\nligne3')

    const raw = fs.readFileSync(file, 'utf8')
    assert.strictEqual(raw, `ligne1${os.EOL}ligne2${os.EOL}ligne3`)
  })
})
