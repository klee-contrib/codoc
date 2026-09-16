import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {envKeyFromDomain, matchEnvByDomain} from '../../../src/use-cases/shared/env-select.js'
import {ConfluenceConfig} from '../../../src/types/codoc-types.js'

function fakeEnv(key: string, baseUrl: string): ConfluenceConfig {
  return {key, baseUrl, username: 'u', apiToken: 't', spaceKey: 'SP', jira: {}, drawio: {macroName: 'drawio'}}
}

describe('matchEnvByDomain', () => {
  it("trouve l'environnement dont le hostname du baseUrl correspond", () => {
    const envs = [fakeEnv('prod', 'https://acme.atlassian.net/wiki'), fakeEnv('rec', 'https://acme-rec.atlassian.net/wiki')]
    assert.strictEqual(matchEnvByDomain(envs, 'acme-rec.atlassian.net'), envs[1])
  })

  it('renvoie undefined si aucun environnement ne correspond', () => {
    assert.strictEqual(matchEnvByDomain([fakeEnv('prod', 'https://acme.atlassian.net/wiki')], 'unknown.example.com'), undefined)
  })

  it("renvoie undefined (pas de throw) si un baseUrl est malformé", () => {
    assert.strictEqual(matchEnvByDomain([fakeEnv('broken', 'not-a-url')], 'acme.atlassian.net'), undefined)
  })

  it('renvoie undefined pour une liste vide', () => {
    assert.strictEqual(matchEnvByDomain([], 'acme.atlassian.net'), undefined)
  })
})

describe('envKeyFromDomain', () => {
  it('dérive le premier label du domaine, en minuscules', () => {
    assert.strictEqual(envKeyFromDomain('KleeGroup.atlassian.net'), 'kleegroup')
  })

  it('normalise les caractères non alphanumériques en tirets', () => {
    assert.strictEqual(envKeyFromDomain('mon_client.jira-dev.com'), 'mon-client')
  })

  it('retombe sur le domaine complet si le premier label est vide après normalisation', () => {
    assert.strictEqual(envKeyFromDomain('___.atlassian.net'), 'default')
  })

  it('désambiguïse par suffixe numérique en cas de collision avec une clé déjà connue', () => {
    assert.strictEqual(envKeyFromDomain('acme.atlassian.net', ['acme']), 'acme-2')
    assert.strictEqual(envKeyFromDomain('acme.atlassian.net', ['acme', 'acme-2']), 'acme-3')
  })

  it("ne collisionne pas si la clé n'est pas déjà prise", () => {
    assert.strictEqual(envKeyFromDomain('acme.atlassian.net', ['other']), 'acme')
  })
})
