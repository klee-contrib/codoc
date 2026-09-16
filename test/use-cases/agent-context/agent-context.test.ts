import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {describe, it} from 'node:test'

import {
  BLOCK_END,
  BLOCK_START,
  kiroSteeringContent,
  resolveAgentContextTargets,
  writeBlock,
  writeDedicated,
} from '../../../src/use-cases/agent-context/agent-context.js'
import {
  AGENT_CONTEXT_TARGETS,
  AgentContextTarget,
  AgentContextTargetKey,
} from '../../../src/use-cases/agent-context/targets.js'

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codoc-agent-context-'))
}

function throwingPrompt(): Promise<AgentContextTargetKey[]> {
  throw new Error('le prompt ne devrait jamais être appelé ici')
}

describe('resolveAgentContextTargets', () => {
  describe('avec --target', () => {
    it('renvoie les clés du flag sans toucher au disque ni au prompt', async () => {
      const keys = await resolveAgentContextTargets(['claude', 'kiro'], tmpDir(), throwingPrompt)
      assert.deepStrictEqual(keys, ['claude', 'kiro'])
    })

    it('déduplique les clés répétées', async () => {
      const keys = await resolveAgentContextTargets(['claude', 'claude', 'kiro'], tmpDir(), throwingPrompt)
      assert.deepStrictEqual(keys, ['claude', 'kiro'])
    })

    it('rejette une clé inconnue avec un message listant la clé et les valeurs possibles', async () => {
      await assert.rejects(
        () => resolveAgentContextTargets(['claude', 'bogus'], tmpDir(), throwingPrompt),
        /"bogus".*Valeurs possibles.*copilot, agent, claude, kiro/,
      )
    })
  })

  describe('sans --target, cibles déjà présentes sur le disque', () => {
    it('les sélectionne silencieusement, sans jamais appeler le prompt', async () => {
      const dir = tmpDir()
      fs.writeFileSync(path.join(dir, 'CLAUDE.md'), 'contenu existant', 'utf8')
      fs.mkdirSync(path.join(dir, '.kiro', 'steering'), {recursive: true})
      fs.writeFileSync(path.join(dir, '.kiro', 'steering', 'codoc.md'), 'contenu existant', 'utf8')

      const keys = await resolveAgentContextTargets(undefined, dir, throwingPrompt)
      assert.deepStrictEqual(keys, ['claude', 'kiro'])
    })
  })

  describe("sans --target, aucune cible n'existe encore", () => {
    it('tombe sur le prompt interactif, avec les 4 cibles proposées', async () => {
      const dir = tmpDir()
      let received: AgentContextTarget[] | undefined
      const fakePrompt = async (targets: AgentContextTarget[]): Promise<AgentContextTargetKey[]> => {
        received = targets
        return ['agent']
      }

      const keys = await resolveAgentContextTargets(undefined, dir, fakePrompt)

      assert.deepStrictEqual(keys, ['agent'])
      assert.strictEqual(received, AGENT_CONTEXT_TARGETS)
    })

    it('renvoie un tableau vide si le prompt échoue (Ctrl+C, stdin non interactif)', async () => {
      const dir = tmpDir()
      const failingPrompt = async (): Promise<AgentContextTargetKey[]> => {
        throw new Error('ExitPromptError')
      }

      const keys = await resolveAgentContextTargets(undefined, dir, failingPrompt)
      assert.deepStrictEqual(keys, [])
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
