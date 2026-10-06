import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {confluenceAccessInputs, INPUTS} from '../../src/config/codoc-inputs.js'
import {InputsContext, requestAll, resolveInputs} from '../../src/services/resolve-inputs.js'

function nonInteractive(env: Record<string, string> = {}, config: Record<string, unknown> = {}): InputsContext {
  return {
    interactive: false,
    env,
    config,
    ask: () => Promise.reject(new Error('aucune question hors terminal')),
    remember: () => Promise.resolve(),
  }
}

describe('confluenceAccessInputs', () => {
  it('ne demande rien si aucun environnement déclaré', () => {
    assert.deepStrictEqual(confluenceAccessInputs(undefined), {})
    assert.deepStrictEqual(confluenceAccessInputs({}), {})
  })

  it("demande baseUrl, spaceKey et une paire d'identifiants préfixée par la clé, même pour un seul environnement (jamais de repli générique)", () => {
    const inputs = Object.values(confluenceAccessInputs({prod: {baseUrl: 'https://x', spaceKey: 'X'}}))
    assert.deepStrictEqual(
      inputs.map((spec) => [spec.label, spec.env ?? spec.config]),
      [
        ['atlassian.environments.prod.baseUrl', ['atlassian', 'environments', 'prod', 'baseUrl']],
        ['atlassian.environments.prod.spaceKey', ['atlassian', 'environments', 'prod', 'spaceKey']],
        ['CONFLUENCE_PROD_USERNAME', ['CONFLUENCE_PROD_USERNAME']],
        ['CONFLUENCE_PROD_API_TOKEN', ['CONFLUENCE_PROD_API_TOKEN']],
      ],
    )
  })

  it('demande une paire préfixée par clé pour chaque environnement', () => {
    const inputs = Object.values(confluenceAccessInputs({prod: {}, 'pre-prod': {}}))
    assert.deepStrictEqual(
      inputs.filter((spec) => spec.env).map((spec) => spec.label),
      [
        'CONFLUENCE_PROD_USERNAME',
        'CONFLUENCE_PROD_API_TOKEN',
        'CONFLUENCE_PRE_PROD_USERNAME',
        'CONFLUENCE_PRE_PROD_API_TOKEN',
      ],
    )
  })

  it("ne demande rien quand codoc.yaml et les variables d'env sont complets", async () => {
    const environments = {prod: {baseUrl: 'https://acme.atlassian.net', spaceKey: 'DOC'}}
    const access = confluenceAccessInputs(environments)
    const context = nonInteractive(
      {CONFLUENCE_PROD_USERNAME: 'moi@acme.test', CONFLUENCE_PROD_API_TOKEN: 'secret'},
      {atlassian: {environments}},
    )

    assert.strictEqual(Object.keys(await resolveInputs(access, requestAll(access), context)).length, 4)
  })

  it('hors terminal, liste chaque valeur manquante (identifiants, codoc.yaml, argument) et où la renseigner', async () => {
    const environments = {prod: {baseUrl: 'https://acme.atlassian.net'}}
    const access = confluenceAccessInputs(environments)
    const context = nonInteractive({CONFLUENCE_PROD_USERNAME: 'moi@acme.test'}, {atlassian: {environments}})

    await assert.rejects(
      resolveInputs({...access, ...INPUTS}, {...requestAll(access), pageUrl: {}}, context),
      (error: Error) => {
        assert.match(error.message, /atlassian\.environments\.prod\.spaceKey\s+→ codoc\.yaml/)
        assert.match(error.message, /CONFLUENCE_PROD_API_TOKEN\s+→ \.env-codoc/)
        assert.match(error.message, /Pour le générer : Pour les membres de KleeGroup/)
        assert.match(error.message, /URL de la page Confluence\s+→ codoc pull <url>/)
        assert.doesNotMatch(error.message, /USERNAME|baseUrl/)
        return true
      },
    )
  })
})

describe('INPUTS', () => {
  it("refuse dès le flag une URL qui n'est pas celle d'une page Confluence", async () => {
    await assert.rejects(
      resolveInputs(INPUTS, {pageUrl: {flag: 'https://acme.atlassian.net/wiki/home'}}, nonInteractive()),
      /Aucun ID de page trouvé/,
    )
  })

  it('accepte une page parente vide explicite (aucun parent)', async () => {
    assert.deepStrictEqual(await resolveInputs(INPUTS, {parentPage: {flag: '', optional: true}}, nonInteractive()), {
      parentPage: '',
    })
  })
})
