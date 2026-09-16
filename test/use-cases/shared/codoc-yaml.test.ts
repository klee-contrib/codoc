import assert from 'node:assert/strict'
import fs from 'node:fs'
import {describe, it} from 'node:test'

import {loadRawConfig, resetConfigCache} from '../../../src/config/codoc-config-raw.js'
import {CONFIG_PATH} from '../../../src/config/codoc-paths.js'
import {addAtlassianEnvironment, buildYamlEntry, removeEntriesFromYaml} from '../../../src/use-cases/shared/codoc-yaml.js'

async function withConfigFile<T>(initialContent: string | undefined, run: () => Promise<T>): Promise<T> {
  const existed = fs.existsSync(CONFIG_PATH)
  const previous = existed ? fs.readFileSync(CONFIG_PATH, 'utf8') : undefined
  if (initialContent !== undefined) fs.writeFileSync(CONFIG_PATH, initialContent)
  else fs.rmSync(CONFIG_PATH, {force: true})

  try {
    return await run()
  } finally {
    if (existed) fs.writeFileSync(CONFIG_PATH, previous!)
    else fs.rmSync(CONFIG_PATH, {force: true})
  }
}

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

  describe('addAtlassianEnvironment', () => {
    it("crée codoc.yaml s'il est absent", async () => {
      await withConfigFile(undefined, async () => {
        const result = await addAtlassianEnvironment('kleegroup', 'https://kleegroup.atlassian.net', 'DA')
        assert.strictEqual(result, 'created')
        const content = fs.readFileSync(CONFIG_PATH, 'utf8').replace(/\r\n/g, '\n')
        assert.match(content, /^atlassian:\n {2}environments:\n {4}kleegroup:\n {6}baseUrl: https:\/\/kleegroup\.atlassian\.net\n {6}spaceKey: DA\n/)
      })
    })

    it('insère sous `atlassian:\\n  environments:\\n` existant, sans toucher au reste du fichier (docs: notamment)', async () => {
      const existing = 'atlassian:\n  environments:\n    default:\n      baseUrl: https://acme.atlassian.net\n      spaceKey: AC\n\ndocs:\n  - path: doc/a.md\n'
      await withConfigFile(existing, async () => {
        const result = await addAtlassianEnvironment('acme2', 'https://acme2.atlassian.net', 'AC2')
        assert.strictEqual(result, 'inserted')
        const content = fs.readFileSync(CONFIG_PATH, 'utf8').replace(/\r\n/g, '\n')
        assert.match(content, /environments:\n {4}acme2:\n {6}baseUrl: https:\/\/acme2\.atlassian\.net\n {6}spaceKey: AC2\n {4}default:/)
        assert.match(content, /docs:\n {2}- path: doc\/a\.md/)
      })
    })

    it('écrit un placeholder TODO si spaceKey est vide', async () => {
      await withConfigFile(undefined, async () => {
        await addAtlassianEnvironment('kleegroup', 'https://kleegroup.atlassian.net', '')
        const content = fs.readFileSync(CONFIG_PATH, 'utf8')
        assert.match(content, /spaceKey: TODO/)
      })
    })

    it("retourne 'manual' sans rien modifier si `atlassian:` existe sous une forme non reconnue", async () => {
      const existing = 'atlassian:\n  # commentaire interposé\n  environments:\n    default:\n      baseUrl: https://acme.atlassian.net\n'
      await withConfigFile(existing, async () => {
        const result = await addAtlassianEnvironment('acme2', 'https://acme2.atlassian.net', 'AC2')
        assert.strictEqual(result, 'manual')
        assert.strictEqual(fs.readFileSync(CONFIG_PATH, 'utf8'), existing)
      })
    })

    it("retourne 'exists' sans rien modifier si la clé est déjà déclarée (pas de doublon YAML)", async () => {
      const existing = 'atlassian:\n  environments:\n    acme:\n      baseUrl: https://acme.atlassian.net\n      spaceKey: AC\n'
      await withConfigFile(existing, async () => {
        const result = await addAtlassianEnvironment('acme', 'https://autre-domaine.atlassian.net', 'AUTRE')
        assert.strictEqual(result, 'exists')
        assert.strictEqual(fs.readFileSync(CONFIG_PATH, 'utf8'), existing)
      })
    })

    it("invalide le cache de config : un loadRawConfig() après coup voit le nouvel environnement (pas l'état pré-écriture)", async () => {
      const existing = 'atlassian:\n  environments:\n    default:\n      baseUrl: https://acme.atlassian.net\n      spaceKey: X\n'
      await withConfigFile(existing, async () => {
        resetConfigCache()
        const before = loadRawConfig()
        assert.deepStrictEqual(Object.keys(before.atlassian!.environments!), ['default'])

        await addAtlassianEnvironment('acme2', 'https://acme2.atlassian.net', 'AC2')

        const after = loadRawConfig()
        assert.deepStrictEqual(Object.keys(after.atlassian!.environments!).sort(), ['acme2', 'default'])
      })
    })
  })
})
