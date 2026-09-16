import crypto from 'node:crypto'
import path from 'node:path'

import {CONFIG_PATH, CODOC_ENV_FILE, PROJECT_ROOT} from '../../config/codoc-paths.js'
import {generateRandomCodocId} from '../../services/codoc-id.js'
import {docguideContent} from '../../services/init-templates/doc-guide-init.js'
import {envTemplate} from '../../services/init-templates/env-init.js'
import {yamlTemplate} from '../../services/init-templates/yaml-init.js'
import {ensureDir, fileExists, readFile, writeFile} from '../../services/files-service.js'

function randomId(): string {
  return crypto.randomBytes(3).toString('hex')
}

export interface InitResult {
  docRelPath: string
  created: string[]
  skipped: string[]
  warnings: string[]
}

// ─────────────────────────────── init ───────────────────────────────

export function initCodoc(): InitResult {
  const created: string[] = []
  const skipped: string[] = []
  const warnings: string[] = []

  const id = randomId()
  const docDir = path.join(PROJECT_ROOT, 'doc')
  const docFilename = `codoc-guide-${id}.md`
  const docAbsPath = path.join(docDir, docFilename)
  const docRelPath = `doc/${docFilename}`

  ensureDir(docDir)
  writeFile(docAbsPath, docguideContent(id))
  created.push(docRelPath)

  writeIfAbsent(CONFIG_PATH, 'codoc.yaml', () => yamlTemplate(docRelPath, generateRandomCodocId()), created, skipped)
  writeIfAbsent(CODOC_ENV_FILE, '.env-codoc', envTemplate, created, skipped)

  ensureGitignoreEntries(['.env-codoc'], created, skipped)

  return {docRelPath, created, skipped, warnings}
}

function writeIfAbsent(
  absPath: string,
  label: string,
  contentFn: () => string,
  created: string[],
  skipped: string[],
): void {
  if (fileExists(absPath)) {
    skipped.push(label)
  } else {
    writeFile(absPath, contentFn())
    created.push(label)
  }
}

/** Garantit que chaque entrée listée est présente dans `.gitignore` (idempotent, crée le fichier si absent). */
function ensureGitignoreEntries(entries: string[], created: string[], skipped: string[]): void {
  const gitignorePath = path.join(PROJECT_ROOT, '.gitignore')
  const label = '.gitignore'

  const existingLines = fileExists(gitignorePath)
    ? readFile(gitignorePath)
        .split(/\r?\n/)
        .map((l) => l.trim())
    : []

  const missing = entries.filter((e) => !existingLines.includes(e))
  if (!missing.length) {
    skipped.push(`${label} (toutes les entrées codoc déjà présentes)`)
    return
  }

  const existing = fileExists(gitignorePath) ? readFile(gitignorePath) : ''
  const separator = !existing || existing.endsWith('\n') ? '' : '\n'
  const block = `${separator}\n# Ajouté par codoc init\n${missing.join('\n')}\n`
  writeFile(gitignorePath, existing + block)

  const action = fileExists(gitignorePath) && existing ? 'mis à jour' : 'créé'
  created.push(`${label} (${action}, ajouté : ${missing.join(', ')})`)
}
