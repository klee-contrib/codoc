import {confirm, input, password} from '@inquirer/prompts'

import {CODOC_ENV_FILE} from '../config/codoc-paths.js'
import {log} from './log/logger.js'
import {fileExists, readFile, writeFile} from './files-service.js'

export interface EnsureEnvOptions {
  hint: string
  secret?: boolean
  generateUrl?: string
}

export interface EnvRequirement extends EnsureEnvOptions {
  name: string
  satisfiedBy?: string[]
}

export async function ensureEnvVars(requirements: EnvRequirement[]): Promise<void> {
  for (const {name, satisfiedBy, ...opts} of requirements) {
    if (satisfiedBy?.some((n) => process.env[n]?.trim())) continue
    await ensureEnvVar(name, opts)
  }
}

export async function ensureEnvVar(name: string, opts: EnsureEnvOptions): Promise<string | undefined> {
  const existing = process.env[name]
  if (existing && existing.trim()) return existing.trim()

  log.blank()
  log.warning0(`${name} n'est pas défini.`)
  log.raw(`     ${opts.hint}`)
  if (opts.generateUrl) {
    log.raw(`     Pour le générer : ${opts.generateUrl}`)
  }

  const secret = opts.secret !== false
  let value: string
  try {
    value = secret
      ? await password({message: `  Saisis ${name} (Entrée vide pour skip) :`, mask: '*'})
      : await input({message: `  Saisis ${name} (Entrée vide pour skip) :`})
  } catch {
    return undefined
  }

  value = value.trim()
  if (!value) return undefined

  process.env[name] = value

  const save = await confirm({
    message: `  Sauvegarder ${name} dans .env-codoc pour les prochains runs ?`,
    default: true,
  }).catch(() => false)

  if (save) {
    upsertEnvLine(name, value)
    log.success1(`[UPDATED] ${name} sauvegardé dans .env-codoc`)
  }

  return value
}

function upsertEnvLine(name: string, value: string): void {
  const lineRe = new RegExp(`^\\s*${escapeRegex(name)}\\s*=.*$`, 'm')
  const newLine = `${name}=${value}`

  if (!fileExists(CODOC_ENV_FILE)) {
    writeFile(CODOC_ENV_FILE, `${newLine}\n`)
    return
  }

  const content = readFile(CODOC_ENV_FILE)
  if (lineRe.test(content)) {
    writeFile(CODOC_ENV_FILE, content.replace(lineRe, newLine))
  } else {
    const sep = content.endsWith('\n') ? '' : '\n'
    writeFile(CODOC_ENV_FILE, `${content}${sep}${newLine}\n`)
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
