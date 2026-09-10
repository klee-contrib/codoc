import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import { confluenceEnvRequirements } from '../../src/config/codoc-config-atlassian.js'

// Note : on teste uniquement les parseurs purs (sans IO disque). Les lite-getters
// (getGitlabConfig, getCodocConfig) appellent loadRawConfig() qui lit codoc.yaml
// depuis PROJECT_ROOT - non isolable sans refactor du module.

describe('confluenceEnvRequirements', () => {
  it('retourne [] si aucun environnement déclaré', () => {
    assert.deepStrictEqual(confluenceEnvRequirements(undefined), [])
    assert.deepStrictEqual(confluenceEnvRequirements({}), [])
  })

  it("retourne une paire préfixée par la clé, même pour un seul environnement (jamais de repli générique)", () => {
    const reqs = confluenceEnvRequirements({prod: {baseUrl: 'https://x', spaceKey: 'X'}})
    assert.deepStrictEqual(
      reqs.map((r) => r.name),
      ['CONFLUENCE_PROD_USERNAME', 'CONFLUENCE_PROD_API_TOKEN'],
    )
    assert.strictEqual(reqs.every((r) => !r.satisfiedBy), true)
  })

  it("retourne une paire préfixée par clé pour plusieurs environnements", () => {
    const reqs = confluenceEnvRequirements({
      prod: {baseUrl: 'https://x', spaceKey: 'X'},
      preprod: {baseUrl: 'https://y', spaceKey: 'Y'},
    })
    assert.deepStrictEqual(
      reqs.map((r) => r.name),
      ['CONFLUENCE_PROD_USERNAME', 'CONFLUENCE_PROD_API_TOKEN', 'CONFLUENCE_PREPROD_USERNAME', 'CONFLUENCE_PREPROD_API_TOKEN'],
    )
    assert.strictEqual(reqs.every((r) => !r.satisfiedBy), true)
  })
})
