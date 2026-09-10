import assert from 'node:assert/strict'
import {afterEach, beforeEach, describe, it} from 'node:test'

import {getDefaultBranch, resetDefaultBranchCache} from '../../../src/services/git/default-branch.js'

describe('getDefaultBranch', () => {
  let originalCiBranch: string | undefined

  beforeEach(() => {
    originalCiBranch = process.env.CI_DEFAULT_BRANCH
    delete process.env.CI_DEFAULT_BRANCH
    resetDefaultBranchCache()
  })

  afterEach(() => {
    if (originalCiBranch !== undefined) process.env.CI_DEFAULT_BRANCH = originalCiBranch
    else delete process.env.CI_DEFAULT_BRANCH
    resetDefaultBranchCache()
  })

  it("utilise $CI_DEFAULT_BRANCH si défini (et codoc.yaml absent)", async () => {
    process.env.CI_DEFAULT_BRANCH = 'release-2026.06'
    const branch = await getDefaultBranch()
    assert.strictEqual(branch, 'release-2026.06')
  })

  it("mémoïse le résultat (les changements d'env après le 1er appel sont ignorés)", async () => {
    process.env.CI_DEFAULT_BRANCH = 'first'
    const first = await getDefaultBranch()
    process.env.CI_DEFAULT_BRANCH = 'second'
    const second = await getDefaultBranch()
    assert.strictEqual(first, 'second' === second ? 'second' : first) // sanity
    assert.strictEqual(first, second)
    assert.strictEqual(second, 'first')
  })

  it("tombe sur git/origin ou fallback 'main' si pas de yaml ni d'env CI", async () => {
    const branch = await getDefaultBranch()
    // Le repo de test a `origin/HEAD` ou tombe sur "main". Ne plante pas, renvoie une string non vide.
    assert.ok(branch)
    assert.ok(branch.length > 0)
  })
})
