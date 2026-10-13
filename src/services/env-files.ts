import dotenv from 'dotenv'
import path from 'node:path'

import {fileExists, readFile, writeFile} from './files-service.js'

/**
 * Charge les fichiers dans l'ordre de priorité : le premier qui donne une valeur non vide gagne.
 * Une variable déjà exportée et non vide reste prioritaire ; une ligne vide (`KEY=`) ne masque
 * pas la valeur d'un fichier suivant (ex. ~/.env-codoc).
 */
export function loadEnvFiles(files: string[], env: NodeJS.ProcessEnv = process.env): void {
  for (const file of files) {
    if (!fileExists(file)) continue
    for (const [name, value] of Object.entries(dotenv.parse(readFile(file)))) {
      if (value.trim() && !env[name]?.trim()) env[name] = value
    }
  }
}

export function upsertEnvLine(file: string, name: string, value: string): void {
  const lineRe = new RegExp(`^\\s*${escapeRegex(name)}\\s*=.*$`, 'm')
  const newLine = `${name}=${value}`

  if (!fileExists(file)) {
    writeFile(file, `${newLine}\n`)
    return
  }

  const content = readFile(file)
  if (lineRe.test(content)) {
    writeFile(file, content.replace(lineRe, newLine))
  } else {
    const sep = content.endsWith('\n') ? '' : '\n'
    writeFile(file, `${content}${sep}${newLine}\n`)
  }
}

/** Vrai si le .gitignore du dossier du fichier liste ce fichier (par son nom). */
export function isGitignored(file: string): boolean {
  const gitignore = path.join(path.dirname(file), '.gitignore')
  if (!fileExists(gitignore)) return false
  const name = path.basename(file)
  return readFile(gitignore)
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^\//, ''))
    .some((line) => line === name || line === '.env*' || line === '.env-*')
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
