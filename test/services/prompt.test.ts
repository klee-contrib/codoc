import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {resolveConfirm, resolveValue, Rl} from '../../src/services/prompt.js'

/** Simule un readline.Interface : ne répond que via `.question`, seule méthode utilisée par ask/confirm. */
function fakeRl(answer: string): Rl {
  return {question: async () => answer} as unknown as Rl
}

describe('resolveValue', () => {
  it('utilise le flag sans jamais toucher au prompt, même face à une config et un promptDefault', async () => {
    const rl = fakeRl('jamais-appelé')
    const value = await resolveValue(rl, {flag: 'depuis-flag', config: 'depuis-config', prompt: '?', promptDefault: 'x'})
    assert.strictEqual(value, 'depuis-flag')
  })

  it('respecte un flag explicitement vide (ex. --images-dir "" pour désactiver)', async () => {
    const rl = fakeRl('jamais-appelé')
    const value = await resolveValue(rl, {flag: '', config: 'depuis-config', prompt: '?'})
    assert.strictEqual(value, '')
  })

  it('utilise la config si le flag est absent', async () => {
    const rl = fakeRl('jamais-appelé')
    const value = await resolveValue(rl, {config: 'depuis-config', prompt: '?', promptDefault: 'x'})
    assert.strictEqual(value, 'depuis-config')
  })

  it('respecte une config explicitement vide', async () => {
    const rl = fakeRl('jamais-appelé')
    const value = await resolveValue(rl, {config: '', prompt: '?', promptDefault: 'x'})
    assert.strictEqual(value, '')
  })

  it('demande en console si ni flag ni config, avec promptDefault comme valeur pré-remplie', async () => {
    const rl = fakeRl('') // touche vide → garde la valeur pré-remplie (comportement de askWithDefault)
    const value = await resolveValue(rl, {prompt: 'Titre :', promptDefault: 'défaut affiché'})
    assert.strictEqual(value, 'défaut affiché')
  })

  it('demande en console sans défaut si promptDefault est omis', async () => {
    const rl = fakeRl('réponse tapée')
    const value = await resolveValue(rl, {prompt: 'Titre :'})
    assert.strictEqual(value, 'réponse tapée')
  })
})

describe('resolveConfirm', () => {
  it('utilise le flag (true) sans jamais toucher au prompt', async () => {
    const rl = fakeRl('n') // répondrait non si jamais appelé
    const value = await resolveConfirm(rl, {flag: true, question: '?', default: false})
    assert.strictEqual(value, true)
  })

  it('utilise le flag (false) sans jamais toucher au prompt', async () => {
    const rl = fakeRl('o') // répondrait oui si jamais appelé
    const value = await resolveConfirm(rl, {flag: false, question: '?', default: true})
    assert.strictEqual(value, false)
  })

  it('demande en console si le flag est absent', async () => {
    const rl = fakeRl('o')
    const value = await resolveConfirm(rl, {question: '?', default: false})
    assert.strictEqual(value, true)
  })
})
