import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {buildYamlEntry, removeEntriesFromYaml} from '../../../src/use-cases/shared/codoc-yaml.js'

describe('codoc-yaml', () => {
  describe('buildYamlEntry', () => {
    it('builds a minimal entry without optional env/imagesDir', () => {
      const e = buildYamlEntry({localPath: 'doc/x.md', title: 'X', parentPageId: '123', maintainedIn: 'confluence'})
      assert.match(e, /- path: doc\/x\.md/)
      assert.match(e, /maintainedIn: confluence/)
      assert.match(e, /title: "X"/)
      assert.match(e, /parentPageId: "123"/)
      assert.ok(!e.includes('env:'))
      assert.ok(!e.includes('imagesDir:'))
    })

    it('includes env and imagesDir when provided', () => {
      const e = buildYamlEntry({
        localPath: 'doc/y.md',
        title: 'Y',
        parentPageId: '9',
        maintainedIn: 'code',
        env: 'da',
        imagesDir: 'doc/img',
      })
      assert.match(e, /env: da/)
      assert.match(e, /imagesDir: doc\/img/)
    })

    it('escapes double quotes in the title', () => {
      const e = buildYamlEntry({localPath: 'doc/z.md', title: 'A"B', parentPageId: '1', maintainedIn: 'code'})
      assert.match(e, /title: "A\\"B"/)
    })

    it('writes codocId in head of entry when provided', () => {
      const e = buildYamlEntry({localPath: 'doc/x.md', title: 'X', parentPageId: '1', maintainedIn: 'code', codocId: 'abc123'})
      assert.match(e, /- codocId: abc123/)
      assert.match(e, /\n {4}path: doc\/x\.md/) // path n'est plus la tête de liste
    })

    it('omits the title line for a folder entry (no title)', () => {
      const e = buildYamlEntry({localPath: 'model/doc/**', parentPageId: '7', maintainedIn: 'code', codocId: 'f1', env: 'da'})
      assert.ok(!e.includes('title:'))
      assert.match(e, /parentPageId: "7"/)
      assert.match(e, /path: model\/doc\/\*\*/)
    })
  })

  describe('removeEntriesFromYaml', () => {
    const content = [
      'docs:',
      '  - path: doc/a.md',
      '    maintainedIn: code',
      '    confluence:',
      '      title: "A"',
      '  - path: doc/b.md',
      '    maintainedIn: confluence',
      '    confluence:',
      '      title: "B"',
      '',
    ].join('\n')

    it('removes only the targeted entry block, keeping the others', () => {
      const out = removeEntriesFromYaml(content, ['doc/a.md'])
      assert.ok(!out.includes('doc/a.md'))
      assert.ok(!out.includes('title: "A"'))
      assert.ok(out.includes('doc/b.md'))
      assert.ok(out.includes('title: "B"'))
      assert.ok(out.startsWith('docs:'))
    })

    it('leaves content untouched when no path matches', () => {
      const out = removeEntriesFromYaml(content, ['doc/missing.md'])
      assert.ok(out.includes('doc/a.md'))
      assert.ok(out.includes('doc/b.md'))
    })
  })
})
