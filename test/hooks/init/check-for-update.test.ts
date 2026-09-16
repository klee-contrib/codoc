import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {isNewerVersion, shouldSkipAutoUpdateCheck} from '../../../src/hooks/init/check-for-update.js'

describe('isNewerVersion', () => {
  it('détecte un incrément de patch, minor, ou major', () => {
    assert.strictEqual(isNewerVersion('0.1.2', '0.1.1'), true)
    assert.strictEqual(isNewerVersion('0.2.0', '0.1.9'), true)
    assert.strictEqual(isNewerVersion('1.0.0', '0.9.9'), true)
  })

  it('renvoie false si égale ou plus ancienne', () => {
    assert.strictEqual(isNewerVersion('0.1.2', '0.1.2'), false)
    assert.strictEqual(isNewerVersion('0.1.1', '0.1.2'), false)
  })

  it('compare numériquement, pas lexicographiquement (0.1.10 > 0.1.9)', () => {
    assert.strictEqual(isNewerVersion('0.1.10', '0.1.9'), true)
  })
})

describe('shouldSkipAutoUpdateCheck', () => {
  it('saute la vérification en CI', () => {
    assert.strictEqual(shouldSkipAutoUpdateCheck({CI: 'true'}, true, {}), true)
  })

  it('saute la vérification en sortie non-interactive (non-TTY)', () => {
    assert.strictEqual(shouldSkipAutoUpdateCheck({}, false, {}), true)
  })

  it('saute la vérification si `autoUpdate: false` dans codoc.yaml', () => {
    assert.strictEqual(shouldSkipAutoUpdateCheck({}, true, {autoUpdate: false}), true)
  })

  it('ne saute rien par défaut (TTY interactif, pas de CI, autoUpdate non renseigné)', () => {
    assert.strictEqual(shouldSkipAutoUpdateCheck({}, true, {}), false)
  })

  it('`autoUpdate: true` explicite ne saute rien non plus', () => {
    assert.strictEqual(shouldSkipAutoUpdateCheck({}, true, {autoUpdate: true}), false)
  })
})
