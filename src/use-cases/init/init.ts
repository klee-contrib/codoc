import crypto from 'node:crypto'
import path from 'node:path'

import {getCodocConfig} from '../../config/codoc-config.js'
import {CONFIG_PATH, CODOC_ENV_FILE, PROJECT_ROOT} from '../../config/codoc-paths.js'
import {generateRandomCodocId} from '../../services/codoc-id.js'
import {agentMdContent} from '../../services/init-templates/agent-md-init.js'
import {docguideContent} from '../../services/init-templates/doc-guide-init.js'
import {envTemplate} from '../../services/init-templates/env-init.js'
import {yamlTemplate} from '../../services/init-templates/yaml-init.js'
import {ensureDir, fileExists, readFile, removePath, writeFile} from '../../services/files-service.js'
import {askWithDefault, createRl} from '../../services/prompt.js'

const AGENT_MD_PATH = path.join(PROJECT_ROOT, '.github', 'agents', 'codoc-agent.md')
const AGENT_MD_LABEL = '.github/agents/codoc-agent.md'
const LEGACY_AGENT_MD_PATH = path.join(PROJECT_ROOT, '.github', 'codoc-agent.md')
const COPILOT_INSTRUCTIONS_PATH = path.join(PROJECT_ROOT, '.github', 'copilot-instructions.md')
const COPILOT_INSTRUCTIONS_LABEL = '.github/copilot-instructions.md'
const COPILOT_BLOCK_START = '<!-- codoc-agent:start -->'
const COPILOT_BLOCK_END = '<!-- codoc-agent:end -->'

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

interface AgentMdTarget {
  path: string
  label: string
}

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

export interface AgentMdResult {
  created: string[]
  warnings: string[]
}

/** `codoc init --agent-md` : ne génère que le guide agent IA, rien d'autre. Demande la destination si aucune n'existe déjà. */
export async function initAgentMdOnly(agentTarget?: string): Promise<AgentMdResult> {
  const created: string[] = []
  const warnings: string[] = []
  const target = await resolveAgentMdTarget(agentTarget)
  generateAgentMd(target, created, warnings)
  return {created, warnings}
}

/** Flag → fichier déjà en place (fichier dédié ou bloc dans copilot-instructions.md) → prompt. */
async function resolveAgentMdTarget(agentTarget?: string): Promise<AgentMdTarget> {
  if (agentTarget === 'copilot') return {path: COPILOT_INSTRUCTIONS_PATH, label: COPILOT_INSTRUCTIONS_LABEL}
  if (agentTarget === 'agent') return {path: AGENT_MD_PATH, label: AGENT_MD_LABEL}

  if (fileExists(AGENT_MD_PATH)) return {path: AGENT_MD_PATH, label: AGENT_MD_LABEL}
  if (fileExists(COPILOT_INSTRUCTIONS_PATH)) return {path: COPILOT_INSTRUCTIONS_PATH, label: COPILOT_INSTRUCTIONS_LABEL}

  const rl = createRl()
  try {
    const answer = await askWithDefault(
      rl,
      'Générer le guide dans un fichier agent dédié ou dans le contexte Copilot ? (agent/copilot) :',
      'agent',
    )
    return answer.trim().toLowerCase().startsWith('copi')
      ? {path: COPILOT_INSTRUCTIONS_PATH, label: COPILOT_INSTRUCTIONS_LABEL}
      : {path: AGENT_MD_PATH, label: AGENT_MD_LABEL}
  } finally {
    rl.close()
  }
}

/** Génère le guide agent IA à la destination choisie, migre l'ancien emplacement `.github/codoc-agent.md` si besoin. */
function generateAgentMd(target: AgentMdTarget, created: string[], warnings: string[]): void {
  try {
    const config = getCodocConfig()
    const content = agentMdContent(config)
    const hadLegacy = fileExists(LEGACY_AGENT_MD_PATH)

    const status =
      target.path === COPILOT_INSTRUCTIONS_PATH
        ? writeAgentMdBlock(COPILOT_INSTRUCTIONS_PATH, content)
        : writeDedicatedAgentMd(AGENT_MD_PATH, content)

    if (hadLegacy && target.path !== LEGACY_AGENT_MD_PATH) removePath(LEGACY_AGENT_MD_PATH)
    created.push(`${target.label} (${hadLegacy ? 'déplacé depuis .github/codoc-agent.md' : status})`)
  } catch (err) {
    warnings.push(
      `${target.label} : impossible de générer - ${
        (err as Error).message.split('\n')[0]
      }. Remplis codoc.yaml puis relance \`codoc init --agent-md\`.`,
    )
  }
}

/** Fichier dédié et entièrement possédé par codoc : contenu remplacé intégralement. */
function writeDedicatedAgentMd(absPath: string, content: string): 'créé' | 'regénéré' {
  const existed = fileExists(absPath)
  writeFile(absPath, content)
  return existed ? 'regénéré' : 'créé'
}

/** copilot-instructions.md est partagé avec d'autres instructions : injection idempotente par bloc balisé. */
function writeAgentMdBlock(absPath: string, content: string): 'créé' | 'regénéré' {
  const block = `${COPILOT_BLOCK_START}\n${content.trim()}\n${COPILOT_BLOCK_END}`

  if (!fileExists(absPath)) {
    ensureDir(path.dirname(absPath))
    writeFile(absPath, `${block}\n`)
    return 'créé'
  }

  const existing = readFile(absPath)
  const blockRe = new RegExp(`${escapeRegex(COPILOT_BLOCK_START)}[\\s\\S]*?${escapeRegex(COPILOT_BLOCK_END)}`)
  if (blockRe.test(existing)) {
    writeFile(absPath, existing.replace(blockRe, block))
    return 'regénéré'
  }

  const separator = existing.endsWith('\n') ? '\n' : '\n\n'
  writeFile(absPath, `${existing}${separator}${block}\n`)
  return 'créé'
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
