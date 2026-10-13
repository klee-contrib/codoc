import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {describe, it} from 'node:test'

import {isGitignored, loadEnvFiles, upsertEnvLine} from '../../src/services/env-files.js'

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codoc-env-files-'))
}

describe('loadEnvFiles', () => {
  it('lit une variable présente seulement dans le fichier utilisateur', () => {
    const dir = tmpDir()
    const project = path.join(dir, '.env-codoc')
    const user = path.join(dir, 'home.env')
    fs.writeFileSync(project, 'OTHER=1\n')
    fs.writeFileSync(user, 'JIRA_API_TOKEN=depuis-home\n')
    const env: NodeJS.ProcessEnv = {}

    loadEnvFiles([project, path.join(dir, 'absent'), user], env)

    assert.deepStrictEqual(env, {OTHER: '1', JIRA_API_TOKEN: 'depuis-home'})
  })

  it('le projet prime sur l’utilisateur, mais une ligne vide du projet ne masque plus la valeur utilisateur', () => {
    const dir = tmpDir()
    const project = path.join(dir, 'project.env')
    const user = path.join(dir, 'home.env')
    fs.writeFileSync(project, 'A=projet\nB=\n')
    fs.writeFileSync(user, 'A=home\nB=home\n')
    const env: NodeJS.ProcessEnv = {}

    loadEnvFiles([project, user], env)

    assert.deepStrictEqual(env, {A: 'projet', B: 'home'})
  })

  it('une variable déjà exportée et non vide reste prioritaire', () => {
    const dir = tmpDir()
    const user = path.join(dir, 'home.env')
    fs.writeFileSync(user, 'A=home\nB=home\n')
    const env: NodeJS.ProcessEnv = {A: 'export', B: ''}

    loadEnvFiles([user], env)

    assert.deepStrictEqual(env, {A: 'export', B: 'home'})
  })
})

describe('upsertEnvLine', () => {
  it('crée le fichier, remplace la ligne existante, ajoute sinon', () => {
    const file = path.join(tmpDir(), '.env-codoc')
    upsertEnvLine(file, 'A', '1')
    fs.appendFileSync(file, 'B=2')
    upsertEnvLine(file, 'A', '3')
    upsertEnvLine(file, 'C', '4')
    assert.strictEqual(fs.readFileSync(file, 'utf8').replaceAll('\r\n', '\n'), 'A=3\nB=2\nC=4\n')
  })
})

describe('isGitignored', () => {
  it('vrai si le .gitignore du dossier liste le fichier', () => {
    const dir = tmpDir()
    const file = path.join(dir, '.env-codoc')
    assert.strictEqual(isGitignored(file), false)
    fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules\r\n/.env-codoc\r\n')
    assert.strictEqual(isGitignored(file), true)
  })
})
