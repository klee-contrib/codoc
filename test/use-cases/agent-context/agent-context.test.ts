import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {describe, it} from 'node:test'

import {InputRequest, InputsContext} from '../../../src/services/resolve-inputs.js'
import {
  BLOCK_END,
  BLOCK_START,
  kiroSteeringContent,
  resolveAgentContextTargets,
  writeBlock,
  writeDedicated,
} from '../../../src/use-cases/agent-context/agent-context.js'
import {AGENT_CONTEXT_TARGETS} from '../../../src/use-cases/agent-context/targets.js'

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codoc-agent-context-'))
}

function fakeContext(options: {interactive?: boolean; answer?: string[]} = {}) {
  const asked: InputRequest[] = []
  const context: InputsContext = {
    interactive: options.interactive ?? false,
    env: {},
    config: {},
    async ask(_spec, request) {
      asked.push(request)
      return options.answer
    },
    async remember() {},
  }
  return {context, asked}
}

describe('resolveAgentContextTargets', () => {
  describe('avec --target', () => {
    it('renvoie les clés du flag sans rien demander', async () => {
      const {context, asked} = fakeContext({interactive: true})
      const keys = await resolveAgentContextTargets(['claude', 'kiro'], context)
      assert.deepStrictEqual(keys, ['claude', 'kiro'])
      assert.deepStrictEqual(asked, [])
    })

    it('déduplique les clés répétées', async () => {
      const keys = await resolveAgentContextTargets(['claude', 'claude', 'kiro'], fakeContext().context)
      assert.deepStrictEqual(keys, ['claude', 'kiro'])
    })

    it('rejette une clé inconnue avec un message listant la clé et les valeurs possibles', async () => {
      await assert.rejects(
        () => resolveAgentContextTargets(['claude', 'bogus'], fakeContext().context),
        /"bogus".*Valeurs possibles.*copilot, agent, claude, kiro/,
      )
    })
  })

  describe('sans --target', () => {
    it('demande en terminal parmi les 4 cibles, même si certaines existent déjà sur le disque', async () => {
      const dir = tmpDir()
      fs.writeFileSync(path.join(dir, 'CLAUDE.md'), 'contenu existant', 'utf8')
      fs.mkdirSync(path.join(dir, '.kiro', 'steering'), {recursive: true})
      fs.writeFileSync(path.join(dir, '.kiro', 'steering', 'codoc.md'), 'contenu existant', 'utf8')
      const {context, asked} = fakeContext({interactive: true, answer: ['agent']})

      const keys = await resolveAgentContextTargets(undefined, context)

      assert.deepStrictEqual(keys, ['agent'])
      assert.deepStrictEqual(
        asked[0].choices?.map((choice) => (typeof choice === 'string' ? choice : choice.value)),
        AGENT_CONTEXT_TARGETS.map((t) => t.key),
      )
    })

    it('hors terminal, échoue en indiquant --target au lieu de rester bloqué sur une question', async () => {
      await assert.rejects(
        () => resolveAgentContextTargets(undefined, fakeContext().context),
        /Valeurs manquantes[\s\S]*--target <clé>/,
      )
    })
  })
})

describe('writeDedicated', () => {
  it("crée le fichier et renvoie 'créé' quand il est absent", () => {
    const file = path.join(tmpDir(), 'out.md')

    const status = writeDedicated(file, 'contenu')

    assert.strictEqual(status, 'créé')
    assert.ok(fs.readFileSync(file, 'utf8').includes('contenu'))
  })

  it("remplace intégralement le contenu et renvoie 'regénéré' quand il existe déjà", () => {
    const file = path.join(tmpDir(), 'out.md')
    fs.writeFileSync(file, 'ancien contenu', 'utf8')

    const status = writeDedicated(file, 'nouveau contenu')

    assert.strictEqual(status, 'regénéré')
    const raw = fs.readFileSync(file, 'utf8')
    assert.ok(raw.includes('nouveau contenu'))
    assert.ok(!raw.includes('ancien contenu'))
  })
})

describe('writeBlock', () => {
  it('crée le fichier avec le bloc balisé quand il est absent', () => {
    const file = path.join(tmpDir(), 'shared.md')

    const status = writeBlock(file, 'corps du message')

    assert.strictEqual(status, 'créé')
    const raw = fs.readFileSync(file, 'utf8')
    assert.ok(raw.includes(BLOCK_START))
    assert.ok(raw.includes('corps du message'))
    assert.ok(raw.includes(BLOCK_END))
  })

  it('ajoute le bloc à un fichier avec du contenu existant sans le perturber', () => {
    const file = path.join(tmpDir(), 'shared.md')
    fs.writeFileSync(file, '# Instructions du projet\n\nRègle existante non liée à codoc.\n', 'utf8')

    writeBlock(file, 'corps codoc')

    const raw = fs.readFileSync(file, 'utf8')
    assert.ok(raw.includes('Règle existante non liée à codoc.'))
    assert.ok(raw.includes(BLOCK_START))
    assert.ok(raw.includes('corps codoc'))
  })

  it("réinjecte sans dupliquer le bloc lors d'un rerun, en préservant le contenu autour", () => {
    const file = path.join(tmpDir(), 'shared.md')
    fs.writeFileSync(file, '# Instructions du projet\n\nRègle existante.\n', 'utf8')

    writeBlock(file, 'première version')
    const secondStatus = writeBlock(file, 'deuxième version')

    assert.strictEqual(secondStatus, 'regénéré')
    const raw = fs.readFileSync(file, 'utf8')
    assert.strictEqual(raw.split(BLOCK_START).length - 1, 1)
    assert.ok(!raw.includes('première version'))
    assert.ok(raw.includes('deuxième version'))
    assert.ok(raw.includes('Règle existante.'))
  })
})

describe('kiroSteeringContent', () => {
  it('préfixe le frontmatter inclusion:always avant le corps, sans rien avant', () => {
    const out = kiroSteeringContent('# corps')
    assert.strictEqual(out, '---\ninclusion: always\n---\n\n# corps')
    assert.ok(out.startsWith('---\n'))
  })
})
